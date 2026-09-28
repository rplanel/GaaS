import type { Context } from 'effect'
import { Effect, Layer, pipe } from 'effect'
import { describe, expect, it } from 'vitest'
import { WorkflowError } from '../src/errors'
import { GalaxyFetch } from '../src/galaxy'
import {
  exportWorkflow,
  exportWorkflowEffect,
  galaxyRevisionNumber,
  getWorkflow,
  getWorkflowEffect,
  getWorkflowRevisions,
  getWorkflowRevisionsEffect,
  getWorkflows,
  getWorkflowsEffect,
  getWorkflowTagName,
  getWorkflowTagVersion,
  invokeWorkflow,
  invokeWorkflowEffect,
} from '../src/workflows'
import {
  createFailureLayer,
  createHttpErrorLayer,
  createServiceUnavailableLayer,
  createSuccessLayer,
  createUrlTrackingLayer,
  ERROR_MESSAGES,
  expectFailure,
  extractFiberFailure,
  HTTP_STATUS_CODES,
  mockGalaxyWorkflow,
  mockGalaxyWorkflowsItem,
} from './fixtures'

// ============================================================================
// getWorkflowEffect
// ============================================================================

describe('getWorkflowEffect', () => {
  describe('success cases', () => {
    it('should successfully retrieve a workflow', () =>
      pipe(
        Effect.gen(function* () {
          const workflow = yield* getWorkflowEffect('test-workflow-id')

          expect(workflow).toEqual(mockGalaxyWorkflow)
          expect(workflow.id).toBe('test-workflow-id')
          expect(workflow.name).toBe('Test Workflow')
        }),
        Effect.provide(createSuccessLayer(mockGalaxyWorkflow)),
        Effect.runPromise,
      ))

    it('should construct correct API URL', () =>
      pipe(
        Effect.gen(function* () {
          const trackingLayer = createUrlTrackingLayer(mockGalaxyWorkflow)
          const workflow = yield* getWorkflowEffect('wf-abc').pipe(
            Effect.provide(trackingLayer),
          )

          expect(workflow).toEqual(mockGalaxyWorkflow)
          expect(trackingLayer.getLastUrl()).toBe('api/workflows/wf-abc')
        }),
        Effect.runPromise,
      ))

    // #48. Galaxy keeps every save of a stored workflow as a revision and
    // answers `GET /api/workflows/{id}` with the latest unless `version`
    // names one: the 0-based index `get_internal_version` resolves.
    it('asks for one revision when given one', () =>
      pipe(
        Effect.gen(function* () {
          const trackingLayer = createUrlTrackingLayer(mockGalaxyWorkflow)
          yield* getWorkflowEffect('wf-abc', 3).pipe(
            Effect.provide(trackingLayer),
          )

          expect(trackingLayer.getLastUrl()).toBe('api/workflows/wf-abc')
          expect(trackingLayer.getLastOptions()?.query).toEqual({ version: 3 })
        }),
        Effect.runPromise,
      ))

    it('asks for the latest revision when given none, as before', () =>
      pipe(
        Effect.gen(function* () {
          const trackingLayer = createUrlTrackingLayer(mockGalaxyWorkflow)
          yield* getWorkflowEffect('wf-abc').pipe(
            Effect.provide(trackingLayer),
          )

          expect(trackingLayer.getLastOptions()?.query).toBeUndefined()
        }),
        Effect.runPromise,
      ))
  })

  describe('error cases', () => {
    it('should handle network failures', () =>
      pipe(
        Effect.gen(function* () {
          const exit = yield* Effect.exit(
            getWorkflowEffect('test-workflow-id'),
          )

          expectFailure(exit, (error) => {
            expect(error).toBeInstanceOf(WorkflowError)
            expect(error.message).toContain('Error getting workflow test-workflow-id')
            expect(error.workflowId).toBe('test-workflow-id')
          })
        }),
        Effect.provide(
          createFailureLayer(new Error(ERROR_MESSAGES.NETWORK_REFUSED)),
        ),
        Effect.runPromise,
      ))

    it('should handle 404 not found error', () =>
      pipe(
        Effect.gen(function* () {
          const exit = yield* Effect.exit(
            getWorkflowEffect('non-existent'),
          )

          expectFailure(exit, (error) => {
            expect(error).toBeInstanceOf(WorkflowError)
            expect(error.statusCode).toBe(HTTP_STATUS_CODES.NOT_FOUND)
          })
        }),
        Effect.provide(
          createHttpErrorLayer(HTTP_STATUS_CODES.NOT_FOUND, 'Not Found'),
        ),
        Effect.runPromise,
      ))
  })
})

describe('getWorkflow (Promise wrapper)', () => {
  it('should resolve with workflow data', async () => {
    const result = await getWorkflow('test-workflow-id', createSuccessLayer(mockGalaxyWorkflow))
    expect(result).toEqual(mockGalaxyWorkflow)
  })

  it('should reject on failure', async () => {
    await expect(
      getWorkflow('test-workflow-id', createFailureLayer(new Error(ERROR_MESSAGES.NETWORK_REFUSED))),
    ).rejects.toThrow()
  })

  it('should map Service Unavailable to GalaxyServiceUnavailable', async () => {
    try {
      await getWorkflow('test-workflow-id', createServiceUnavailableLayer())
      expect.unreachable('Should have thrown')
    }
    catch (error) {
      const inner = extractFiberFailure(error)
      expect((inner as any)._tag).toBe('GalaxyServiceUnavailable')
    }
  })
})

// ============================================================================
// getWorkflowsEffect
// ============================================================================

describe('getWorkflowsEffect', () => {
  it('should successfully retrieve workflows list', () =>
    pipe(
      Effect.gen(function* () {
        const workflows = yield* getWorkflowsEffect()

        expect(workflows).toEqual([mockGalaxyWorkflowsItem])
        expect(workflows).toHaveLength(1)
        expect(workflows[0]?.id).toBe('test-workflow-id')
      }),
      Effect.provide(createSuccessLayer([mockGalaxyWorkflowsItem])),
      Effect.runPromise,
    ))

  /**
   * Galaxy's list applies `hidden == show_hidden`: the default omits the
   * stored workflows the account hid in Galaxy's own list, and asking with
   * `show_hidden=true` answers only those. Hidden is a display flag of
   * Galaxy's list and says nothing about whether GaaS can publish or run the
   * workflow, so a caller that wants every stored workflow asks twice.
   */
  describe('the hidden stored workflows', () => {
    const visible = { ...mockGalaxyWorkflowsItem, id: 'wf-visible', hidden: false }
    const hidden = { ...mockGalaxyWorkflowsItem, id: 'wf-hidden', hidden: true }

    type GalaxyFetchService = Context.Tag.Service<GalaxyFetch>

    /** A Galaxy that records every call and answers the list each asks for. */
    function recordingGalaxy() {
      const calls: { url: string, query?: Record<string, unknown> }[] = []
      const fetchMock = async (url: string, options?: { query?: Record<string, unknown> }) => {
        calls.push({ url, query: options?.query })
        return options?.query?.show_hidden === true ? [hidden] : [visible]
      }
      return { calls, layer: Layer.succeed(GalaxyFetch, fetchMock as unknown as GalaxyFetchService) }
    }

    it('asks once and answers the visible ones by default, as before', () =>
      pipe(
        Effect.gen(function* () {
          const galaxy = recordingGalaxy()
          const workflows = yield* getWorkflowsEffect().pipe(Effect.provide(galaxy.layer))

          expect(workflows).toEqual([visible])
          expect(galaxy.calls).toEqual([{ url: 'api/workflows', query: undefined }])
        }),
        Effect.runPromise,
      ))

    it('asks for the hidden ones too when told to, and answers the visible ones first', () =>
      pipe(
        Effect.gen(function* () {
          const galaxy = recordingGalaxy()
          const workflows = yield* getWorkflowsEffect({ includeHidden: true }).pipe(Effect.provide(galaxy.layer))

          expect(workflows).toEqual([visible, hidden])
          expect(galaxy.calls.map(call => call.url)).toEqual(['api/workflows', 'api/workflows'])
          expect(galaxy.calls.map(call => call.query)).toEqual([undefined, { show_hidden: true }])
        }),
        Effect.runPromise,
      ))

    it('takes the option through the Promise wrapper', async () => {
      const galaxy = recordingGalaxy()
      expect(await getWorkflows(galaxy.layer, { includeHidden: true })).toEqual([visible, hidden])
    })
  })

  it('should handle network failures', () =>
    pipe(
      Effect.gen(function* () {
        const exit = yield* Effect.exit(getWorkflowsEffect())

        expectFailure(exit, (error) => {
          expect(error).toBeInstanceOf(WorkflowError)
          expect(error.message).toContain('Error getting workflows')
        })
      }),
      Effect.provide(
        createFailureLayer(new Error(ERROR_MESSAGES.NETWORK_REFUSED)),
      ),
      Effect.runPromise,
    ))
})

describe('getWorkflows (Promise wrapper)', () => {
  it('should resolve with workflows list', async () => {
    const result = await getWorkflows(createSuccessLayer([mockGalaxyWorkflowsItem]))
    expect(result).toEqual([mockGalaxyWorkflowsItem])
  })

  it('should reject on failure', async () => {
    await expect(
      getWorkflows(createFailureLayer(new Error(ERROR_MESSAGES.NETWORK_REFUSED))),
    ).rejects.toThrow()
  })

  it('should map Service Unavailable to GalaxyServiceUnavailable', async () => {
    try {
      await getWorkflows(createServiceUnavailableLayer())
      expect.unreachable('Should have thrown')
    }
    catch (error) {
      const inner = extractFiberFailure(error)
      expect((inner as any)._tag).toBe('GalaxyServiceUnavailable')
    }
  })
})

// ============================================================================
// getWorkflowRevisionsEffect
// ============================================================================

/**
 * What `GET /api/workflows/{id}/versions` answers: one entry per revision,
 * oldest first. `version` is the 0-based index Galaxy indexes the revision
 * by, the same integer `download?version=` and an invocation take (#48); it
 * is read off each entry, never off its position in the list.
 */
const mockRevisions = [
  { version: 0, update_time: '2026-09-01T10:00:00', steps: 3 },
  { version: 1, update_time: '2026-09-10T08:30:00', steps: 4 },
  { version: 2, update_time: '2026-09-20T16:45:00', steps: 4 },
]

describe('getWorkflowRevisionsEffect', () => {
  it('lists the revisions of a stored workflow as Galaxy indexes them', () =>
    pipe(
      Effect.gen(function* () {
        const revisions = yield* getWorkflowRevisionsEffect('wf-123')
        expect(revisions).toEqual(mockRevisions)
        expect(revisions.map(revision => revision.version)).toEqual([0, 1, 2])
      }),
      Effect.provide(createSuccessLayer(mockRevisions)),
      Effect.runPromise,
    ))

  it('asks Galaxy for the versions of that stored workflow', () =>
    pipe(
      Effect.gen(function* () {
        const trackingLayer = createUrlTrackingLayer(mockRevisions)
        yield* getWorkflowRevisionsEffect('wf-123').pipe(
          Effect.provide(trackingLayer),
        )
        expect(trackingLayer.getLastUrl()).toBe('api/workflows/wf-123/versions')
        expect(trackingLayer.getLastOptions()?.method).toBe('GET')
      }),
      Effect.runPromise,
    ))

  it('should handle network failures', () =>
    pipe(
      Effect.gen(function* () {
        const exit = yield* Effect.exit(
          getWorkflowRevisionsEffect('wf-123'),
        )

        expectFailure(exit, (error) => {
          expect(error).toBeInstanceOf(WorkflowError)
          expect(error.message).toContain('Error listing the revisions of workflow wf-123')
          expect(error.workflowId).toBe('wf-123')
        })
      }),
      Effect.provide(
        createFailureLayer(new Error(ERROR_MESSAGES.NETWORK_REFUSED)),
      ),
      Effect.runPromise,
    ))
})

describe('getWorkflowRevisions (Promise wrapper)', () => {
  it('should resolve with the revisions', async () => {
    const result = await getWorkflowRevisions('wf-123', createSuccessLayer(mockRevisions))
    expect(result).toEqual(mockRevisions)
  })

  it('should map Service Unavailable to GalaxyServiceUnavailable', async () => {
    try {
      await getWorkflowRevisions('wf-123', createServiceUnavailableLayer())
      expect.unreachable('Should have thrown')
    }
    catch (error) {
      const inner = extractFiberFailure(error)
      expect((inner as any)._tag).toBe('GalaxyServiceUnavailable')
    }
  })
})

// ============================================================================
// exportWorkflowEffect
// ============================================================================

const mockRawExport = {
  'a_galaxy_workflow': 'true',
  'format-version': '0.1',
  'name': 'Exported Workflow',
  'tags': [],
  'annotation': '',
  'steps': {},
  'version': 1,
  'uuid': 'fa95ecd4-ed11-49e2-b3d6-8f178b807256',
}

describe('exportWorkflowEffect', () => {
  it('should successfully export a workflow', () =>
    pipe(
      Effect.gen(function* () {
        const exported = yield* exportWorkflowEffect('wf-export-id')
        expect(exported.name).toBe('Exported Workflow')
        expect(exported.version).toBe(1)
      }),
      Effect.provide(createSuccessLayer(mockRawExport)),
      Effect.runPromise,
    ))

  // ADR 0004. A published version pins one revision by two things the export
  // carries: `version`, the 0-based index an invocation takes, and `uuid`,
  // the identifier Galaxy gave that revision when it was saved. The index
  // alone cannot tell a rewritten history from a stable one; the uuid is the
  // guard, so an export without one is not an export this client can vouch for.
  it('carries the revision uuid the export names, beside the revision index', () =>
    pipe(
      Effect.gen(function* () {
        const exported = yield* exportWorkflowEffect('wf-export-id')
        expect(exported.uuid).toBe('fa95ecd4-ed11-49e2-b3d6-8f178b807256')
        expect(exported.version).toBe(1)
      }),
      Effect.provide(createSuccessLayer(mockRawExport)),
      Effect.runPromise,
    ))

  it('refuses an export that names no revision uuid as not a Galaxy export', () =>
    pipe(
      Effect.gen(function* () {
        const { uuid: _dropped, ...withoutUuid } = mockRawExport
        const exit = yield* Effect.exit(
          exportWorkflowEffect('wf-export-id').pipe(
            Effect.provide(createSuccessLayer(withoutUuid)),
          ),
        )

        expectFailure(exit, (error) => {
          expect(error).toBeInstanceOf(WorkflowError)
          expect(error.message).toContain('Invalid workflow export format')
        })
      }),
      Effect.runPromise,
    ))

  it('should construct correct API URL with default style', () =>
    pipe(
      Effect.gen(function* () {
        const trackingLayer = createUrlTrackingLayer(mockRawExport)
        yield* exportWorkflowEffect('wf-123').pipe(
          Effect.provide(trackingLayer),
        )
        expect(trackingLayer.getLastUrl()).toBe(
          'api/workflows/wf-123/download?style=export',
        )
      }),
      Effect.runPromise,
    ))

  // ADR 0004, #73. Galaxy exports the latest revision unless `version` names
  // one; a version may pin an older revision, so the export is asked for the
  // one being published and the row's revision, uuid and snapshot are that
  // export's rather than the latest's.
  it('exports the revision it is given, by its index', () =>
    pipe(
      Effect.gen(function* () {
        const trackingLayer = createUrlTrackingLayer({ ...mockRawExport, version: 2 })
        const exported = yield* exportWorkflowEffect('wf-123', 'export', 2).pipe(
          Effect.provide(trackingLayer),
        )
        expect(trackingLayer.getLastUrl()).toBe(
          'api/workflows/wf-123/download?style=export&version=2',
        )
        expect(exported.version).toBe(2)
        expect(exported.uuid).toBe('fa95ecd4-ed11-49e2-b3d6-8f178b807256')
      }),
      Effect.runPromise,
    ))

  it('exports the latest revision when given none, as before', () =>
    pipe(
      Effect.gen(function* () {
        const trackingLayer = createUrlTrackingLayer(mockRawExport)
        yield* exportWorkflowEffect('wf-123', 'export', undefined).pipe(
          Effect.provide(trackingLayer),
        )
        expect(trackingLayer.getLastUrl()).toBe(
          'api/workflows/wf-123/download?style=export',
        )
      }),
      Effect.runPromise,
    ))

  it('asks for revision 0 rather than dropping it as falsy', () =>
    pipe(
      Effect.gen(function* () {
        const trackingLayer = createUrlTrackingLayer({ ...mockRawExport, version: 0 })
        yield* exportWorkflowEffect('wf-123', 'export', 0).pipe(
          Effect.provide(trackingLayer),
        )
        expect(trackingLayer.getLastUrl()).toBe(
          'api/workflows/wf-123/download?style=export&version=0',
        )
      }),
      Effect.runPromise,
    ))

  it('should handle network failures', () =>
    pipe(
      Effect.gen(function* () {
        const exit = yield* Effect.exit(
          exportWorkflowEffect('wf-export-id'),
        )

        expectFailure(exit, (error) => {
          expect(error).toBeInstanceOf(WorkflowError)
          expect(error.message).toContain('Error exporting workflow wf-export-id')
        })
      }),
      Effect.provide(
        createFailureLayer(new Error(ERROR_MESSAGES.NETWORK_REFUSED)),
      ),
      Effect.runPromise,
    ))
})

/**
 * #82. A stored definition exists to be drawn from, so the export's steps
 * have to reach the caller whole. The nested step schema used to strip: the
 * `.loose()` above applies to the outer object only, and the step schema
 * modelled `input_connections` as one optional key literally named
 * `input`. Galaxy keys connections by *input name* and makes the value an
 * array when several outputs feed one input, so every connection of every real
 * workflow was discarded on the way in.
 */
describe('what the step of an export keeps', () => {
  /** A fan-in: two upstream outputs feeding one input of step 2. */
  const fanIn = {
    id: 2,
    annotation: '',
    name: 'Concatenate datasets',
    content_id: 'cat1',
    label: null,
    tool_id: 'cat1',
    type: 'tool',
    uuid: 'step-2-uuid',
    tool_state: '{}',
    tool_version: '1.0.0',
    input_connections: {
      'input1': { id: 0, output_name: 'output' },
      'queries_0|input2': [
        { id: 1, output_name: 'out_file1' },
        { id: 0, output_name: 'output' },
      ],
    },
    inputs: [],
    outputs: [{ name: 'out_file1', type: 'input' }],
    workflow_outputs: [],
    position: { left: 480.5, top: 212 },
    when: '$(inputs.run_it)',
    an_unmodelled_galaxy_key: 'kept',
  }

  /**
   * A step that runs a whole workflow, shaped as Galaxy really writes one.
   *
   * It omits `content_id`, `tool_state`, `tool_version` and `errors` — not
   * `null`, absent — and writes `tool_id` as `null`. Measured on three
   * published workflows on usegalaxy.eu at 26.1.2, where the schema refused
   * every one of them until #89, so no workflow holding a subworkflow step
   * could be published at all.
   */
  const subworkflowStep = {
    id: 3,
    annotation: '',
    name: 'Trim and map',
    label: 'Trim and map',
    tool_id: null,
    type: 'subworkflow',
    uuid: 'step-3-uuid',
    input_connections: { 'Trim and map': { id: 2, output_name: 'out_file1' } },
    inputs: [{ description: '', name: 'Trim and map' }],
    // Galaxy writes `[]` here on a subworkflow step and names its real
    // outputs in `workflow_outputs`.
    outputs: [],
    workflow_outputs: [],
    position: { left: 720, top: 212 },
    when: null,
    subworkflow: {
      'a_galaxy_workflow': 'true',
      'format-version': '0.1',
      'name': 'Trim and map',
      'annotation': '',
      'uuid': 'nested-uuid',
      'steps': {
        0: {
          annotation: '',
          id: 0,
          name: 'Input dataset',
          content_id: null,
          label: 'Nested reads',
          tool_id: null,
          type: 'data_input',
          uuid: 'nested-step-0-uuid',
          tool_state: '{"optional": false}',
          tool_version: null,
          input_connections: {},
          inputs: [{ description: '', name: 'Nested reads' }],
          outputs: [],
          workflow_outputs: [],
        },
      },
    },
  }

  const withFanIn = { ...mockRawExport, steps: { 2: fanIn, 3: subworkflowStep } }

  function exported() {
    return pipe(
      exportWorkflowEffect('wf-export-id'),
      Effect.provide(createSuccessLayer(withFanIn)),
      Effect.runPromise,
    )
  }

  it('keeps a connection under whatever input name Galaxy keyed it by', async () => {
    const step = (await exported()).steps['2']!
    expect(step.input_connections.input1).toEqual({ id: 0, output_name: 'output' })
    expect(step.input_connections['queries_0|input2']).toEqual([
      { id: 1, output_name: 'out_file1' },
      { id: 0, output_name: 'output' },
    ])
  })

  // `_workflow_to_dict_export` collapses a singleton list to a bare dict, a
  // back-compat hack Galaxy's own comment says must never be removed, so both
  // shapes arrive and both have to survive.
  it('keeps both connections when two upstream outputs feed one input', async () => {
    const step = (await exported()).steps['2']!
    const connections = step.input_connections['queries_0|input2']
    expect(Array.isArray(connections)).toBe(true)
    expect(connections).toHaveLength(2)
  })

  it('keeps the position and the condition of a step', async () => {
    const step = (await exported()).steps['2']!
    expect(step.position).toEqual({ left: 480.5, top: 212 })
    expect(step.when).toBe('$(inputs.run_it)')
  })

  it('accepts a subworkflow step, which it refused outright until #89', async () => {
    // Galaxy leaves `content_id`, `tool_state` and `tool_version` out of one
    // and `type` was not in the enum, so the export was refused and the
    // version never stored.
    const step = (await exported()).steps['3']!
    expect(step.type).toBe('subworkflow')
    expect(step.tool_id).toBeNull()
    expect(step.tool_state).toBeUndefined()
    expect(step.tool_version).toBeUndefined()
    expect(step.content_id).toBeUndefined()
  })

  it('keeps the whole nested workflow a subworkflow step embeds', async () => {
    // Its steps and their connections, because something now draws them: a
    // subworkflow is one node that opens onto its own graph (Q19), and the
    // nested export is the only description of it there is — it carries a
    // name and a uuid but no stored workflow id.
    const nested = (await exported()).steps['3']!.subworkflow
    expect(nested?.name).toBe('Trim and map')
    expect(Object.keys(nested?.steps ?? {})).toEqual(['0'])
    expect(nested?.steps['0']!.label).toBe('Nested reads')
    // And what it does not model is kept rather than stripped, one level
    // down as well: this is #82's trap inside a nested export.
    expect(nested).toMatchObject({ 'format-version': '0.1', 'uuid': 'nested-uuid' })
  })

  // The guard for the defect itself: the nested schema must not strip. A key
  // this client does not model is still part of the definition, and a step
  // schema that starts dropping unknown keys again fails here.
  it('keeps a key it does not model rather than stripping it', async () => {
    const step = (await exported()).steps['2']!
    expect(step).toMatchObject({ an_unmodelled_galaxy_key: 'kept' })
  })

  // A workflow built through the API was never laid out, and Galaxy writes
  // that as a null position or leaves it out. Neither is a broken export.
  it('accepts a step that was never laid out, however Galaxy says so', async () => {
    const { position: _dropped, when: _w, ...bare } = fanIn
    const laidOut = await pipe(
      exportWorkflowEffect('wf-export-id'),
      Effect.provide(createSuccessLayer({
        ...mockRawExport,
        steps: { 0: { ...bare, position: null }, 1: bare },
      })),
      Effect.runPromise,
    )

    expect(laidOut.steps['0']!.position).toBeNull()
    expect(laidOut.steps['1']!.position).toBeUndefined()
  })

  it('still refuses a step that is not a step at all', async () => {
    const exit = await pipe(
      exportWorkflowEffect('wf-export-id'),
      Effect.provide(createSuccessLayer({ ...mockRawExport, steps: { 0: { ...fanIn, id: 'two' } } })),
      Effect.exit,
      Effect.runPromise,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(WorkflowError)
      expect(error.message).toContain('Invalid workflow export format')
    })
  })
})

describe('exportWorkflow (Promise wrapper)', () => {
  it('should resolve with exported workflow data', async () => {
    const result = await exportWorkflow('wf-export-id', createSuccessLayer(mockRawExport))
    expect(result.name).toBe('Exported Workflow')
  })

  it('passes the revision on', async () => {
    const trackingLayer = createUrlTrackingLayer({ ...mockRawExport, version: 1 })
    const result = await exportWorkflow('wf-export-id', trackingLayer, 'export', 1)
    expect(trackingLayer.getLastUrl()).toBe('api/workflows/wf-export-id/download?style=export&version=1')
    expect(result.version).toBe(1)
  })

  it('should map Service Unavailable to GalaxyServiceUnavailable', async () => {
    try {
      await exportWorkflow('wf-export-id', createServiceUnavailableLayer())
      expect.unreachable('Should have thrown')
    }
    catch (error) {
      const inner = extractFiberFailure(error)
      expect((inner as any)._tag).toBe('GalaxyServiceUnavailable')
    }
  })
})

// ============================================================================
// invokeWorkflowEffect
// ============================================================================

const mockInvocation = {
  model_class: 'WorkflowInvocation' as const,
  id: 'invocation-1',
  state: 'new' as const,
  update_time: '2024-01-01T00:00:00Z',
  create_time: '2024-01-01T00:00:00Z',
  workflow_id: 'wf-1',
  history_id: 'hist-1',
  uuid: 'uuid-inv-1',
}

describe('invokeWorkflowEffect', () => {
  it('should successfully invoke a workflow', () =>
    pipe(
      Effect.gen(function* () {
        const result = yield* invokeWorkflowEffect(
          'hist-1',
          'wf-1',
          { 0: { id: 'ds-1', src: 'hda' } },
          {},
        )
        expect(result.id).toBe('invocation-1')
        expect(result.state).toBe('new')
      }),
      Effect.provide(createSuccessLayer(mockInvocation)),
      Effect.runPromise,
    ))

  // #48. Without `version` Galaxy invokes the latest revision of the stored
  // workflow, so a save in its editor after publish changed what the next
  // analysis ran. `InvokeWorkflowPayload.version` names the revision to run.
  it('names the revision to run when given one', () =>
    pipe(
      Effect.gen(function* () {
        const trackingLayer = createUrlTrackingLayer(mockInvocation)
        yield* invokeWorkflowEffect(
          'hist-1',
          'wf-1',
          { 0: { id: 'ds-1', src: 'hda' } },
          {},
          3,
        ).pipe(Effect.provide(trackingLayer))

        expect(trackingLayer.getLastUrl()).toBe('api/workflows/wf-1/invocations')
        expect(trackingLayer.getLastOptions()?.body).toEqual({
          history_id: 'hist-1',
          inputs: { 0: { id: 'ds-1', src: 'hda' } },
          parameters: {},
          version: 3,
        })
      }),
      Effect.runPromise,
    ))

  it('leaves the revision to Galaxy when given none, as before', () =>
    pipe(
      Effect.gen(function* () {
        const trackingLayer = createUrlTrackingLayer(mockInvocation)
        yield* invokeWorkflowEffect('hist-1', 'wf-1', {}, {}).pipe(
          Effect.provide(trackingLayer),
        )

        expect(trackingLayer.getLastOptions()?.body).not.toHaveProperty('version')
      }),
      Effect.runPromise,
    ))

  it('should handle network failures', () =>
    pipe(
      Effect.gen(function* () {
        const exit = yield* Effect.exit(
          invokeWorkflowEffect('hist-1', 'wf-1', {}, {}),
        )

        expectFailure(exit, (error) => {
          expect(error).toBeInstanceOf(WorkflowError)
          expect(error.message).toContain('Error invoking workflow wf-1')
          expect(error.workflowId).toBe('wf-1')
        })
      }),
      Effect.provide(
        createFailureLayer(new Error(ERROR_MESSAGES.NETWORK_REFUSED)),
      ),
      Effect.runPromise,
    ))
})

describe('invokeWorkflow (Promise wrapper)', () => {
  it('should resolve with invocation data', async () => {
    const result = await invokeWorkflow(
      'hist-1',
      'wf-1',
      { 0: { id: 'ds-1', src: 'hda' } },
      {},
      createSuccessLayer(mockInvocation),
    )
    expect(result.id).toBe('invocation-1')
  })

  it('should map Service Unavailable to GalaxyServiceUnavailable', async () => {
    try {
      await invokeWorkflow('hist-1', 'wf-1', {}, {}, createServiceUnavailableLayer())
      expect.unreachable('Should have thrown')
    }
    catch (error) {
      const inner = extractFiberFailure(error)
      expect((inner as any)._tag).toBe('GalaxyServiceUnavailable')
    }
  })
})

// ============================================================================
// getWorkflowTagVersion / getWorkflowTagName
// ============================================================================

describe('getWorkflowTagVersion', () => {
  it('should extract version from tags', () => {
    const result = getWorkflowTagVersion(['version:1.2.3', 'other:tag'])
    expect(result).toBe('1.2.3')
  })

  it('should return null when no version tag exists', () => {
    const result = getWorkflowTagVersion(['name:my-workflow', 'other:tag'])
    expect(result).toBeNull()
  })

  it('should return null for empty tags', () => {
    const result = getWorkflowTagVersion([])
    expect(result).toBeNull()
  })
})

describe('getWorkflowTagName', () => {
  it('should extract name from tags', () => {
    const result = getWorkflowTagName(['name:my-workflow', 'version:1.0'])
    expect(result).toBe('my-workflow')
  })

  it('should return null when no name tag exists', () => {
    const result = getWorkflowTagName(['version:1.0', 'other:tag'])
    expect(result).toBeNull()
  })

  it('should return null for empty tags', () => {
    const result = getWorkflowTagName([])
    expect(result).toBeNull()
  })
})

// ============================================================================
// galaxyRevisionNumber
// ============================================================================

describe('galaxyRevisionNumber', () => {
  // Galaxy's editor labels a revision `version + 1` while the API, the export,
  // the download and an invocation carry the 0-based index; a person reads
  // the editor's number, a request carries the index
  it('gives the number Galaxy\'s editor shows for an index', () => {
    expect(galaxyRevisionNumber(0)).toBe(1)
    expect(galaxyRevisionNumber(3)).toBe(4)
  })
})
