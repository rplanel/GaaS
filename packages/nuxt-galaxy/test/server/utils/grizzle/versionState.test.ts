import { Effect, Exit } from 'effect'
import { describe, expect, it } from 'vitest'
import { versionStateEffect } from '../../../../src/runtime/server/utils/grizzle/versionState'
import { createRecordingGalaxyLayer, expectFailure } from '../../fixtures'
import { dataInputStep, toolStep, workflowDefinition } from '../../workflowDefinition'

/**
 * #76, ADR 0004. The state of a version is a live reading the admin page
 * takes from Galaxy of whether the version can still run: runnable, tools
 * missing, missing in Galaxy, revision mismatch. These are the reading's own
 * rules: what is asked of Galaxy, in which order, what each answer means,
 * and where the reading stops. Nothing is written anywhere: the effect needs
 * a Galaxy client and nothing else, which its requirement type says.
 */

const FOO = 'toolshed.g2.bx.psu.edu/repos/iuc/foo/foo/1.2.3+galaxy0'
const BAR = 'toolshed.g2.bx.psu.edu/repos/iuc/bar/bar/2.0'

/** The version whose state is read: the row's Galaxy id, revision index and revision uuid. */
const version = { galaxyId: 'galaxy-wf-1', revision: 3, revisionUuid: 'fa95ecd4-ed11-49e2-b3d6-8f178b807256' }

/** The export Galaxy holds at revision 3: two tool steps, the uuid the version pinned. */
const exportAtRevision = {
  ...workflowDefinition({
    0: dataInputStep(0, 'Input FASTQ'),
    1: toolStep(1, FOO, '1.2.3+galaxy0'),
    2: toolStep(2, BAR, '2.0'),
  }),
  version: 3,
}

/** What `GET api/workflows/{id}` answers for a stored workflow that exists. */
function storedWorkflow(deleted = false) {
  return { model_class: 'StoredWorkflow', id: version.galaxyId, name: 'Satellite Finder', deleted, version: 3 }
}

/** What Galaxy answers for a tool it holds at the version asked for. */
function installed(toolId: string, toolVersion: string) {
  return { model_class: 'Tool', id: toolId, name: toolId.split('/').at(-2), version: toolVersion }
}

/** What ofetch throws for a Galaxy answer with that status, as far as blendtype reads it. */
function galaxyAnswers(statusCode: number) {
  return Object.assign(new Error(`Galaxy answered ${statusCode}`), { statusCode })
}

const SHOW = `api/workflows/${version.galaxyId}`
const EXPORT = `api/workflows/${version.galaxyId}/download?style=export&version=${version.revision}`

/**
 * A Galaxy answering each of the three kinds of call, each overridable: the
 * stored workflow, the export of the pinned revision, and a tool lookup.
 */
function galaxy(overrides: {
  show?: unknown
  exported?: unknown
  tool?: (toolId: string, toolVersion: string) => unknown
} = {}) {
  return createRecordingGalaxyLayer(({ url }) => {
    if (url === SHOW)
      return overrides.show ?? storedWorkflow()
    if (url === EXPORT)
      return overrides.exported ?? exportAtRevision
    const tool = /^api\/tools\/(.+)\?io_details=true&tool_version=(.+)$/.exec(url)
    if (tool) {
      // read the way Galaxy reads a query value: decoded, a raw `+` being a space
      const toolVersion = decodeURIComponent(tool[2]!.replaceAll('+', ' '))
      return overrides.tool?.(tool[1]!, toolVersion) ?? installed(tool[1]!, toolVersion)
    }
    return new Error(`unexpected call to Galaxy: ${url}`)
  })
}

function read(layer: ReturnType<typeof galaxy>) {
  return versionStateEffect(version).pipe(Effect.provide(layer.layer), Effect.runPromise)
}

describe('versionStateEffect', () => {
  it('reads runnable when Galaxy lists the stored workflow, holds the pinned revision and every tool at its version', async () => {
    const layer = galaxy()

    expect(await read(layer)).toEqual({ state: 'runnable' })
    // the stored workflow, then the export, then one lookup per distinct tool
    expect(layer.calls.map(call => call.url)).toEqual([
      SHOW,
      EXPORT,
      // the pinned version travels URL-encoded, a raw `+` being a space to Galaxy
      `api/tools/${FOO}?io_details=true&tool_version=1.2.3%2Bgalaxy0`,
      `api/tools/${BAR}?io_details=true&tool_version=2.0`,
    ])
    expect(layer.calls.every(call => call.method === 'GET')).toBe(true)
  })

  it('names the tools Galaxy does not hold at their pinned version', async () => {
    // one tool gone altogether (404), one held only at another version (200
    // with another `version`): both are missing, as at publish (#75)
    const layer = galaxy({
      tool: (toolId, toolVersion) => {
        if (toolId === BAR)
          return galaxyAnswers(404)
        if (toolId === FOO)
          return installed(FOO, '1.3.0')
        return installed(toolId, toolVersion)
      },
    })

    expect(await read(layer)).toEqual({
      state: 'tools-missing',
      missingTools: [{ toolId: FOO, toolVersion: '1.2.3+galaxy0' }, { toolId: BAR, toolVersion: '2.0' }],
    })
  })

  describe('missing in Galaxy', () => {
    it.each([
      ['Galaxy knows no such stored workflow (404)', galaxyAnswers(404)],
      ['the id is not one Galaxy can decode (400)', galaxyAnswers(400)],
    ])('reads missing in Galaxy when %s, and asks nothing further', async (_label, show) => {
      const layer = galaxy({ show })

      expect(await read(layer)).toEqual({ state: 'missing-in-galaxy' })
      expect(layer.calls.map(call => call.url)).toEqual([SHOW])
    })

    it('reads missing in Galaxy for a stored workflow Galaxy has deleted, which it still describes', async () => {
      // Galaxy deletes softly: `GET api/workflows/{id}` keeps answering 200
      // with `deleted: true`, and only the list leaves the workflow out. The
      // administrator deleted it, so it is missing, whatever the status says.
      const layer = galaxy({ show: storedWorkflow(true) })

      expect(await read(layer)).toEqual({ state: 'missing-in-galaxy' })
      expect(layer.calls.map(call => call.url)).toEqual([SHOW])
    })
  })

  describe('revision mismatch', () => {
    it('reads a mismatch when the index the version pinned names no revision any more, and asks no tool', async () => {
      // Galaxy indexes a list, so an index past its end is a 400 ("Version
      // does not exist"): the history was rewritten or shortened
      const layer = galaxy({ exported: galaxyAnswers(400) })

      expect(await read(layer)).toEqual({ state: 'revision-mismatch' })
      expect(layer.calls.map(call => call.url)).toEqual([SHOW, EXPORT])
    })

    it('reads a mismatch carrying Galaxy\'s uuid when the revision at that index is not the one pinned', async () => {
      const layer = galaxy({ exported: { ...exportAtRevision, uuid: '0b7c9a2e-1111-4222-8333-444455556666' } })

      expect(await read(layer)).toEqual({ state: 'revision-mismatch', galaxyRevisionUuid: '0b7c9a2e-1111-4222-8333-444455556666' })
      expect(layer.calls.map(call => call.url)).toEqual([SHOW, EXPORT])
    })
  })

  it('lets Galaxy being unwell through as itself rather than as a state', async () => {
    // a 500 says nothing about the version; the endpoint answers it, never a
    // reading the administrator could act on
    const layer = galaxy({ show: galaxyAnswers(500) })

    const exit = await versionStateEffect(version).pipe(Effect.provide(layer.layer), Effect.runPromiseExit)

    expect(Exit.isFailure(exit)).toBe(true)
    expectFailure(exit, (error) => {
      expect(error).toMatchObject({ _tag: 'WorkflowError', statusCode: 500 })
    })
  })

  it('lets a tool lookup Galaxy failed through as itself too', async () => {
    const layer = galaxy({ tool: toolId => (toolId === BAR ? galaxyAnswers(500) : undefined) })

    const exit = await versionStateEffect(version).pipe(Effect.provide(layer.layer), Effect.runPromiseExit)

    expectFailure(exit, (error) => {
      expect(error).toMatchObject({ _tag: 'ToolError', statusCode: 500 })
    })
  })
})
