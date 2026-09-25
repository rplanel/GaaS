import type { GalaxyWorkflow } from 'blendtype'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { makeGalaxyCache, workflowCacheKey } from '../../../../src/runtime/server/utils/galaxyCache'
import { workflowDescriptionEffect, WorkflowRevisionNotFound } from '../../../../src/runtime/server/utils/grizzle/workflowDescription'
import { createRecordingGalaxyLayer, expectFailureOf } from '../../fixtures'

/**
 * #87, Q13(a). One revision described in one call: its steps, its inputs,
 * the definitions of the tools it pins, and every tool that came back as
 * something other than itself.
 *
 * The tool half has its own tests beside `resolvePinnedToolsEffect`. What is
 * here is the workflow half — which payload is read, what is cached under
 * which key, and what the endpoint's own 404 is.
 */

const GALAXY = 'https://galaxy.example.com'
const FOO = 'toolshed.g2.bx.psu.edu/repos/iuc/foo/foo/1.2.3+galaxy0'

/** A live payload with one data input and one tool step. */
const liveWorkflow = {
  id: 'galaxy-workflow-1',
  name: 'Satellite Finder',
  version: 3,
  inputs: { 0: { label: 'Input FASTQ', value: '', uuid: 'input-uuid' } },
  steps: {
    0: { id: 0, type: 'data_input', tool_id: null, tool_version: null, tool_inputs: {}, input_steps: {} },
    1: { id: 1, type: 'tool', tool_id: FOO, tool_version: '1.2.3+galaxy0', tool_inputs: { n: '3' }, input_steps: {} },
  },
} as unknown as GalaxyWorkflow

function installed(toolId: string, version: string) {
  return { model_class: 'Tool', id: toolId, name: 'foo', version, inputs: [], outputs: [] }
}

/** What ofetch throws for a Galaxy answer with that status, as far as blendtype reads it. */
function galaxyAnswers(statusCode: number) {
  return Object.assign(new Error(`[GET] "api/workflows/…": ${statusCode}`), { statusCode })
}

/** A Galaxy that answers the workflow read and every tool lookup. */
function galaxyServing(workflow: unknown = liveWorkflow) {
  return createRecordingGalaxyLayer(({ url }) => {
    if (url.startsWith('api/workflows/')) {
      return workflow instanceof Error ? workflow : workflow
    }
    const match = /^api\/tools\/(.+)\?io_details=true&tool_version=(.+)$/.exec(url)
    return installed(match![1]!, decodeURIComponent(match![2]!.replaceAll('+', ' ')))
  })
}

function mapCache() {
  const items = new Map<string, unknown>()
  return {
    items,
    cache: makeGalaxyCache({
      getItem: async (key: string) => items.get(key) ?? null,
      setItem: async (key: string, value: unknown) => {
        items.set(key, value)
      },
    }),
  }
}

describe('workflowDescriptionEffect', () => {
  it('answers the live payload\'s steps and inputs verbatim, with the tools it pins', async () => {
    const galaxy = galaxyServing()
    const { cache } = mapCache()

    const description = await workflowDescriptionEffect('galaxy-workflow-1', 3, cache, GALAXY).pipe(
      Effect.provide(galaxy.layer),
      Effect.runPromise,
    )

    expect(description.steps).toEqual(liveWorkflow.steps)
    expect(description.inputs).toEqual(liveWorkflow.inputs)
    expect(Object.keys(description.tools)).toEqual([`${FOO}@1.2.3+galaxy0`])
    expect(description.unavailable).toEqual([])
  })

  it('asks Galaxy for the revision named, never for its latest', async () => {
    const galaxy = galaxyServing()
    const { cache } = mapCache()

    await workflowDescriptionEffect('galaxy-workflow-1', 3, cache, GALAXY).pipe(
      Effect.provide(galaxy.layer),
      Effect.runPromise,
    )

    // The revision travels as `query.version`, not in the path; left out,
    // Galaxy describes its latest, which moves with every save in its editor.
    expect(galaxy.calls[0]).toMatchObject({
      method: 'GET',
      url: 'api/workflows/galaxy-workflow-1',
      query: { version: 3 },
    })
  })

  it('caches the revision under the Galaxy URL, the workflow id and the revision', async () => {
    const galaxy = galaxyServing()
    const { cache, items } = mapCache()

    await workflowDescriptionEffect('galaxy-workflow-1', 3, cache, GALAXY).pipe(
      Effect.provide(galaxy.layer),
      Effect.runPromise,
    )

    expect([...items.keys()]).toContain(workflowCacheKey(GALAXY, 'galaxy-workflow-1', 3))
  })

  it('describes a second time without asking Galaxy at all', async () => {
    // A pinned revision is immutable and a tool version is its identity, so
    // "for ever" is correct for both: navigating away and back costs nothing.
    const { cache } = mapCache()
    await workflowDescriptionEffect('galaxy-workflow-1', 3, cache, GALAXY).pipe(
      Effect.provide(galaxyServing().layer),
      Effect.runPromise,
    )

    const second = createRecordingGalaxyLayer(() => new Error('Galaxy should not have been asked again'))
    const description = await workflowDescriptionEffect('galaxy-workflow-1', 3, cache, GALAXY).pipe(
      Effect.provide(second.layer),
      Effect.runPromise,
    )

    expect(second.calls).toEqual([])
    expect(Object.keys(description.tools)).toEqual([`${FOO}@1.2.3+galaxy0`])
  })

  // A 4xx is Galaxy saying "no such thing": 404 for an id it does not know,
  // and 400 for a revision index past the end of the history — "Version does
  // not exist" is a `MessageException`, which Galaxy answers 400. Reading
  // 404 alone would report the commonest way to name a revision that is not
  // there as a fault of this server's, which is the mistake `versionState`
  // already avoids.
  it.each([
    ['an id it does not know', 404],
    ['a revision index past the end of the history', 400],
  ])('answers WorkflowRevisionNotFound for %s', async (_label, statusCode) => {
    const galaxy = createRecordingGalaxyLayer(() => galaxyAnswers(statusCode))

    const exit = await workflowDescriptionEffect('galaxy-workflow-1', 3, mapCache().cache, GALAXY).pipe(
      Effect.provide(galaxy.layer),
      Effect.runPromiseExit,
    )

    expectFailureOf(exit, WorkflowRevisionNotFound, (error) => {
      expect(error.message).toContain('revision 3')
    })
  })

  it('lets any other Galaxy failure through as itself, and caches nothing', async () => {
    const galaxy = createRecordingGalaxyLayer(() => galaxyAnswers(500))
    const { cache, items } = mapCache()

    const exit = await workflowDescriptionEffect('galaxy-workflow-1', 3, cache, GALAXY).pipe(
      Effect.provide(galaxy.layer),
      Effect.runPromiseExit,
    )

    expect(exit._tag).toBe('Failure')
    expect([...items.keys()]).toEqual([])
  })

  it('asks Galaxy for no tool when the revision pins none', async () => {
    const galaxy = galaxyServing({ ...liveWorkflow, steps: { 0: liveWorkflow.steps[0] } })

    const description = await workflowDescriptionEffect('galaxy-workflow-1', 3, mapCache().cache, GALAXY).pipe(
      Effect.provide(galaxy.layer),
      Effect.runPromise,
    )

    expect(galaxy.calls).toHaveLength(1)
    expect(description.tools).toEqual({})
    expect(description.unavailable).toEqual([])
  })
})
