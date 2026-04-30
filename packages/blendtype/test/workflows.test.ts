import { Effect, pipe } from 'effect'
import { describe, expect, it } from 'vitest'
import { WorkflowError } from '../src/errors'
import {
  exportWorkflow,
  exportWorkflowEffect,
  getWorkflow,
  getWorkflowEffect,
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

describe('exportWorkflow (Promise wrapper)', () => {
  it('should resolve with exported workflow data', async () => {
    const result = await exportWorkflow('wf-export-id', createSuccessLayer(mockRawExport))
    expect(result.name).toBe('Exported Workflow')
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
