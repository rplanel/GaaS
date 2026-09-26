import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'
import { makeGalaxyCache } from '../../../../src/runtime/server/utils/galaxyCache'
import {
  StoredDefinitionStale,
  StoredDefinitionUnreadable,
  workflowDescriptionEffect,
  WorkflowRevisionNotFound,
} from '../../../../src/runtime/server/utils/grizzle/workflowDescription'
import { createMockDrizzle, createRecordingGalaxyLayer, expectFailureOf, mockDbUser, mockDbWorkflow } from '../../fixtures'
import { connection, dataInputStep, toolStep, workflowDefinition } from '../../workflowDefinition'

/**
 * #87 Q13(a), and #88 Q12. One revision described in one call: its steps,
 * its inputs, the definitions of the tools it pins, and every tool that came
 * back as something other than itself.
 *
 * The tool half has its own tests beside `resolvePinnedToolsEffect`, and the
 * normalisation its own beside `storedDefinition`. What is here is the
 * workflow half — which row is read, what is refused about it, and what the
 * endpoint's 404 now means.
 *
 * Since #88 the source is the **stored definition**: the export captured at
 * publish, in this application's own database. Galaxy is asked about the
 * tools and about nothing else.
 */

const GALAXY = 'https://galaxy.example.com'
const EMAIL = mockDbUser.user.email
const FOO = 'toolshed.g2.bx.psu.edu/repos/iuc/foo/foo/1.2.3+galaxy0'
const BAR = 'toolshed.g2.bx.psu.edu/repos/iuc/bar/bar/2.0.0'
const REVISION_UUID = mockDbWorkflow.revisionUuid

/** A definition with one data input feeding one tool step, as publishing stored it. */
const storedDefinition = {
  ...workflowDefinition({
    0: dataInputStep(0, 'Input FASTQ'),
    1: toolStep(1, FOO, '1.2.3+galaxy0', { tool_state: '{"n": "3"}' }),
  }),
  uuid: REVISION_UUID,
}

function installed(toolId: string, version: string) {
  return { model_class: 'Tool', id: toolId, name: 'foo', version, inputs: [], outputs: [] }
}

/** A Galaxy that answers every tool lookup and would refuse anything else. */
function galaxyServingTools() {
  return createRecordingGalaxyLayer(({ url }) => {
    const match = /^api\/tools\/(.+)\?io_details=true&tool_version=(.+)$/.exec(url)
    if (!match) {
      return new Error(`nothing but a tool should be asked of Galaxy here, not ${url}`)
    }
    return installed(match[1]!, decodeURIComponent(match[2]!.replaceAll('+', ' ')))
  })
}

/**
 * The database as this read finds it: the Galaxy service account, then the
 * version row. Two selects in that order, which is the order the effect runs
 * them in.
 */
function databaseHolding(version: unknown) {
  const drizzle = createMockDrizzle()
  drizzle.enqueueResult([mockDbUser])
  drizzle.enqueueResult(version === undefined ? [] : [version])
  return drizzle
}

/** A version row pinning `storedDefinition` unless the test says otherwise. */
function aVersion(overrides: { definition?: unknown, revisionUuid?: string } = {}) {
  return {
    definition: overrides.definition ?? storedDefinition,
    revisionUuid: overrides.revisionUuid ?? REVISION_UUID,
  }
}

function describing(
  drizzle: ReturnType<typeof createMockDrizzle>,
  galaxy: ReturnType<typeof createRecordingGalaxyLayer>,
  revision = 1,
) {
  const items = new Map<string, unknown>()
  const cache = makeGalaxyCache({
    getItem: async (key: string) => items.get(key) ?? null,
    setItem: async (key: string, value: unknown) => {
      items.set(key, value)
    },
  })
  return {
    items,
    effect: workflowDescriptionEffect('galaxy-workflow-1', revision, cache, GALAXY, EMAIL).pipe(
      Effect.provide(Layer.merge(drizzle.layer, galaxy.layer)),
    ),
  }
}

describe('workflowDescriptionEffect', () => {
  it('describes the revision from the stored definition, with the tools it pins', async () => {
    const galaxy = galaxyServingTools()
    const { effect } = describing(databaseHolding(aVersion()), galaxy)

    const description = await Effect.runPromise(effect)

    expect(Object.keys(description.steps)).toEqual(['0', '1'])
    expect(description.steps['1']).toMatchObject({
      id: 1,
      type: 'tool',
      tool_id: FOO,
      tool_version: '1.2.3+galaxy0',
      // decoded from the export's `tool_state`, which is where the values
      // the revision was saved with live
      tool_inputs: { n: '3' },
    })
    expect(description.inputs).toEqual({ 0: { label: 'Input FASTQ', value: '', uuid: 'uuid-0' } })
    expect(Object.keys(description.tools)).toEqual([`${FOO}@1.2.3+galaxy0`])
    expect(description.unavailable).toEqual([])
  })

  it('keeps both connections of an input fed by two upstream outputs', async () => {
    // The whole argument for the switch of source. `GET /api/workflows/{id}`
    // assigns `input_steps[conn.input_name]` in a loop, so it can only ever
    // report one of these, and nothing downstream could tell an edge had
    // gone missing.
    const fanIn = {
      ...workflowDefinition({
        0: dataInputStep(0, 'Input FASTQ'),
        1: toolStep(1, FOO, '1.2.3+galaxy0'),
        2: toolStep(2, BAR, '2.0.0', {
          input_connections: {
            'batchmode|input_fastas': [connection(1, 'proviruses'), connection(1, 'viruses')],
          },
        }),
      }),
      uuid: REVISION_UUID,
    }
    const { effect } = describing(databaseHolding(aVersion({ definition: fanIn })), galaxyServingTools())

    const description = await Effect.runPromise(effect)

    expect(description.steps['2']!.input_connections).toEqual({
      'batchmode|input_fastas': [
        { id: 1, output_name: 'proviruses' },
        { id: 1, output_name: 'viruses' },
      ],
    })
  })

  it('asks Galaxy for the tools and for nothing else', async () => {
    // The row is already held, so the workflow half costs no round trip —
    // which is what made the switch of source cheaper than what it replaced,
    // not dearer.
    const galaxy = galaxyServingTools()
    const { effect } = describing(databaseHolding(aVersion()), galaxy)

    await Effect.runPromise(effect)

    expect(galaxy.calls).toHaveLength(1)
    expect(galaxy.calls[0]).toMatchObject({ method: 'GET' })
    expect(galaxy.calls[0]!.url).toContain('api/tools/')
  })

  it('reads the row of the revision asked for, on this Galaxy account', async () => {
    const drizzle = databaseHolding(aVersion())
    const { effect } = describing(drizzle, galaxyServingTools(), 1)

    await Effect.runPromise(effect)

    // Two selects: the service account, then the version. A revision is not
    // a Galaxy query any more.
    expect(drizzle.mock.select).toHaveBeenCalledTimes(2)
  })

  it('answers WorkflowRevisionNotFound when no published version pins that revision', async () => {
    const { effect } = describing(databaseHolding(undefined), galaxyServingTools())

    const exit = await Effect.runPromiseExit(effect)

    expectFailureOf(exit, WorkflowRevisionNotFound, (error) => {
      expect(error.message).toContain('revision 1')
    })
  })

  it('refuses a definition that is not the revision the version pinned', async () => {
    // Q11: the graph refuses to draw on a `revision_uuid` mismatch rather
    // than drawing a stale shape, and reading the stored definition is what
    // puts the pinned revision's own uuid in hand to compare.
    const { effect } = describing(
      databaseHolding(aVersion({ revisionUuid: '00000000-0000-4000-8000-000000000000' })),
      galaxyServingTools(),
    )

    const exit = await Effect.runPromiseExit(effect)

    expectFailureOf(exit, StoredDefinitionStale, (error) => {
      expect(error.message).toContain(REVISION_UUID)
      expect(error.message).toContain('00000000-0000-4000-8000-000000000000')
    })
  })

  it('refuses a row stored before the export schema kept its connections', async () => {
    // Such a row parses perfectly — the stripped shape is a subset of the
    // widened one — and would be drawn as a workflow whose steps are joined
    // by nothing, with nothing about the picture to say so (#82).
    const legacy = {
      ...storedDefinition,
      steps: {
        0: { id: 0, type: 'data_input', tool_id: null, tool_version: null, label: 'Input FASTQ', uuid: 'uuid-0', annotation: '', name: 'Input dataset', content_id: null, tool_state: '{}', input_connections: {}, inputs: [], outputs: [], workflow_outputs: [] },
        1: { id: 1, type: 'tool', tool_id: FOO, tool_version: '1.2.3+galaxy0', label: null, uuid: 'uuid-1', annotation: '', name: 'foo', content_id: FOO, tool_state: '{}', input_connections: {}, inputs: [], outputs: [], workflow_outputs: [] },
      },
    }
    const { effect } = describing(databaseHolding(aVersion({ definition: legacy })), galaxyServingTools())

    const exit = await Effect.runPromiseExit(effect)

    expectFailureOf(exit, StoredDefinitionUnreadable, (error) => {
      expect(error.message).toContain('Republish')
    })
  })

  it('refuses a row that is not a workflow export at all', async () => {
    const { effect } = describing(
      databaseHolding(aVersion({ definition: { steps: { 0: { nothing: 'like a step' } } } })),
      galaxyServingTools(),
    )

    const exit = await Effect.runPromiseExit(effect)

    expectFailureOf(exit, StoredDefinitionUnreadable, (error) => {
      expect(error.message).toContain('Republish')
    })
  })

  it('describes a revision that pins no tool without asking Galaxy anything', async () => {
    const noTools = {
      ...workflowDefinition({ 0: dataInputStep(0, 'Input FASTQ') }),
      uuid: REVISION_UUID,
    }
    const galaxy = galaxyServingTools()
    const { effect } = describing(databaseHolding(aVersion({ definition: noTools })), galaxy)

    const description = await Effect.runPromise(effect)

    expect(galaxy.calls).toEqual([])
    expect(description.tools).toEqual({})
    expect(description.unavailable).toEqual([])
  })

  it('caches the tool definitions it resolved, and nothing about the revision', async () => {
    // The revision is a local row now, so there is nothing about it left to
    // cache; a tool is the one thing here worth remembering for ever.
    const { effect, items } = describing(databaseHolding(aVersion()), galaxyServingTools())

    await Effect.runPromise(effect)

    expect([...items.keys()].every(key => key.startsWith('tool|'))).toBe(true)
    expect(items.size).toBe(1)
  })
})
