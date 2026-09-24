import { Effect, Exit } from 'effect'
import { describe, expect, it } from 'vitest'
import { missingToolsEffect, pinnedTools } from '../../../../src/runtime/server/utils/grizzle/workflowTools'
import { createRecordingGalaxyLayer, expectFailure } from '../../fixtures'
import { dataInputStep, toolStep, workflowDefinition } from '../../workflowDefinition'

/**
 * #75, ADR 0004. Galaxy refuses to run a revision whose tools are not
 * installed at their exact pinned version (`require_exact_tool_versions`),
 * so publishing checks them first. These are the check's own rules: which
 * steps are looked up, what Galaxy's answers mean, and what is never asked.
 */

const FOO = 'toolshed.g2.bx.psu.edu/repos/iuc/foo/foo/1.2.3+galaxy0'
const BAR = 'toolshed.g2.bx.psu.edu/repos/iuc/bar/bar/2.0'

/** A revision with two tool steps and one dataset input. */
const twoTools = workflowDefinition({
  0: dataInputStep(0, 'Input FASTQ'),
  1: toolStep(1, FOO, '1.2.3+galaxy0'),
  2: toolStep(2, BAR, '2.0'),
})

/** What Galaxy answers for a tool it holds at the version asked for. */
function installed(toolId: string, version: string) {
  return { model_class: 'Tool', id: toolId, name: toolId.split('/').at(-2), version }
}

/** What ofetch throws for a Galaxy answer with that status, as far as blendtype reads it. */
function galaxyAnswers(statusCode: number) {
  return Object.assign(new Error(`[GET] "api/tools/…": ${statusCode}`), { statusCode })
}

/** The tool an `api/tools/<id>?io_details=true&tool_version=<v>` call asks for. */
function asked(url: string) {
  const match = /^api\/tools\/(.+)\?io_details=true&tool_version=(.+)$/.exec(url)
  if (!match)
    throw new Error(`not a tool lookup: ${url}`)
  return { toolId: match[1]!, toolVersion: match[2]! }
}

/** A Galaxy that holds every tool at the version asked for, except where `except` says otherwise. */
function galaxyHolding(except: (toolId: string, toolVersion: string) => unknown = () => undefined) {
  return createRecordingGalaxyLayer(({ url }) => {
    const { toolId, toolVersion } = asked(url)
    return except(toolId, toolVersion) ?? installed(toolId, toolVersion)
  })
}

describe('pinnedTools', () => {
  it('lists each distinct tool and version the revision pins, in step order', () => {
    expect(pinnedTools(twoTools)).toEqual([
      { toolId: FOO, toolVersion: '1.2.3+galaxy0' },
      { toolId: BAR, toolVersion: '2.0' },
    ])
  })

  it('counts a tool two steps share once, and skips steps that are not tool steps', () => {
    const definition = workflowDefinition({
      0: dataInputStep(0, 'Input'),
      1: toolStep(1, FOO, '1.2.3+galaxy0'),
      2: toolStep(2, FOO, '1.2.3+galaxy0'),
      3: toolStep(3, FOO, '1.3.0'),
    })

    expect(pinnedTools(definition)).toEqual([
      { toolId: FOO, toolVersion: '1.2.3+galaxy0' },
      { toolId: FOO, toolVersion: '1.3.0' },
    ])
  })
})

describe('missingToolsEffect', () => {
  it('answers nothing missing when Galaxy holds every tool at its pinned version', async () => {
    const galaxy = galaxyHolding()

    const missing = await missingToolsEffect(twoTools).pipe(Effect.provide(galaxy.layer), Effect.runPromise)

    expect(missing).toEqual([])
    expect(galaxy.calls.map(call => call.url).sort()).toEqual([
      `api/tools/${BAR}?io_details=true&tool_version=2.0`,
      `api/tools/${FOO}?io_details=true&tool_version=1.2.3+galaxy0`,
    ])
  })

  it('names a tool Galaxy does not have at all', async () => {
    // Galaxy answers 404 when no version of the tool is installed
    const galaxy = galaxyHolding(toolId => (toolId === BAR ? galaxyAnswers(404) : undefined))

    const missing = await missingToolsEffect(twoTools).pipe(Effect.provide(galaxy.layer), Effect.runPromise)

    expect(missing).toEqual([{ toolId: BAR, toolVersion: '2.0' }])
  })

  it('names a tool Galaxy holds only at another version', async () => {
    // asked for a version it does not have, Galaxy answers 200 with the
    // newest version of the same tool rather than 404 (`get_tool` with
    // `exact=False`), so the answer's version has to be read, not the status
    const galaxy = galaxyHolding(toolId => (toolId === FOO ? installed(FOO, '1.3.0') : undefined))

    const missing = await missingToolsEffect(twoTools).pipe(Effect.provide(galaxy.layer), Effect.runPromise)

    expect(missing).toEqual([{ toolId: FOO, toolVersion: '1.2.3+galaxy0' }])
  })

  it('looks a tool two steps share up once', async () => {
    const definition = workflowDefinition({
      1: toolStep(1, FOO, '1.2.3+galaxy0'),
      2: toolStep(2, FOO, '1.2.3+galaxy0'),
    })
    const galaxy = galaxyHolding()

    await missingToolsEffect(definition).pipe(Effect.provide(galaxy.layer), Effect.runPromise)

    expect(galaxy.calls).toHaveLength(1)
  })

  it('asks Galaxy nothing for a revision with no tool steps', async () => {
    const galaxy = createRecordingGalaxyLayer(() => new Error('Galaxy should not have been asked'))

    const missing = await missingToolsEffect(workflowDefinition({ 0: dataInputStep(0, 'Input') })).pipe(
      Effect.provide(galaxy.layer),
      Effect.runPromise,
    )

    expect(missing).toEqual([])
    expect(galaxy.calls).toEqual([])
  })

  it('lets Galaxy being unwell through as itself rather than calling a tool missing', async () => {
    // a 500 says nothing about the tool, so it is not read as missing; the
    // same goes for a 503, which blendtype retries before failing
    const galaxy = galaxyHolding(toolId => (toolId === BAR ? galaxyAnswers(500) : undefined))

    const exit = await missingToolsEffect(twoTools).pipe(Effect.provide(galaxy.layer), Effect.runPromiseExit)

    expect(Exit.isFailure(exit)).toBe(true)
    expectFailure(exit, (error) => {
      expect(error).toMatchObject({ _tag: 'ToolError', statusCode: 500 })
    })
  })
})
