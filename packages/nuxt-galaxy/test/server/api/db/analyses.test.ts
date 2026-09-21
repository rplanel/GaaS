import type { H3Event } from 'h3'
import { Context, Data, Effect, Layer } from 'effect'
import { useLogger } from 'evlog'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockRequestLogger } from '../../setup'

const mockAnalysisResult = {
  id: 1,
  inputIds: [1, 2],
}

const mockSupabaseUser = {
  id: 'owner-uuid-1',
  email: 'user@example.com',
}

const mockDbWorkflow = {
  id: 1,
  name: 'Test Workflow',
  galaxyId: 'galaxy-wf-1',
  versionKey: '1.0',
}

const mockDbHistory = {
  id: 1,
  galaxyId: 'galaxy-history-1',
}

// The real tagged errors this endpoint has to tell apart, restated with the
// shape production gives them. A renamed tag is caught by `vue-tsc` on the
// handler's own union, not from here.
class GetSupabaseUserError extends Data.TaggedError('GetSupabaseUserError')<{ readonly message: string }> {}
class GalaxyUserNotFoundError extends Data.TaggedError('GalaxyUserNotFoundError')<{ readonly message: string }> {}
class WorkflowNotFoundError extends Data.TaggedError('WorkflowNotFoundError')<{ readonly message: string }> {}
class CreateGalaxyHistoryError extends Data.TaggedError('CreateGalaxyHistoryError')<{ readonly message: string }> {}
class GalaxyServiceUnavailable extends Data.TaggedError('GalaxyServiceUnavailable')<{ readonly message: string }> {}
class CheckGalaxyHealthError extends Data.TaggedError('CheckGalaxyHealthError')<{ readonly message: string }> {}

const mocks = vi.hoisted(() => ({
  getSupabaseUser: vi.fn(),
  getWorkflowEffect: vi.fn(),
  addHistoryEffect: vi.fn(),
  runAnalysis: vi.fn(),
  uploadDatasetsEffect: vi.fn(),
  checkGalaxyHealthEffect: vi.fn(),
  readBody: vi.fn(),
}))

// Hoisted mock service classes using real Effect imports (available at top-level)
class MockDrizzle extends Context.Tag('@nuxt-galaxy/Drizzle')<MockDrizzle, any>() {
  static readonly Live = Layer.succeed(MockDrizzle, {})
}

class MockServerSupabaseClient extends Context.Tag('@nuxt-galaxy/ServerSupabaseClient')<MockServerSupabaseClient, any>() {
  static readonly Live = Layer.succeed(MockServerSupabaseClient, () => Effect.succeed({}))
}

class MockServerSupabaseClaims extends Context.Tag('@nuxt-galaxy/ServerSupabaseClaims')<MockServerSupabaseClaims, any>() {
  static readonly Live = Layer.succeed(MockServerSupabaseClaims, () => Effect.succeed(null))
}

// Mock blendtype
vi.mock('blendtype', () => ({
  toGalaxyServiceUnavailable: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  makeGalaxyLayer: vi.fn(() => Layer.empty),
  DatasetStates: [
    'ok',
    'empty',
    'error',
    'discarded',
    'failed_metadata',
    'new',
    'upload',
    'queued',
    'running',
    'paused',
    'setting_metadata',
    'deferred',
  ],
  HistoryStates: [
    'new',
    'upload',
    'queued',
    'running',
    'ok',
    'empty',
    'error',
    'paused',
    'setting_metadata',
    'failed_metadata',
    'deferred',
    'discarded',
  ],
  JobStates: [
    'ok',
    'error',
    'deleted',
    'new',
    'resubmitted',
    'upload',
    'waiting',
    'queued',
    'running',
    'failed',
    'paused',
    'stop',
    'stopped',
    'skipped',
  ],
  InvocationStates: [
    'scheduled',
    'cancelling',
    'cancelled',
    'failed',
    'new',
    'ready',
  ],
}))

// Mock galaxy utility
vi.mock('../../../../src/runtime/server/utils/galaxy.js', () => ({
  useGalaxyLayer: vi.fn(() => Layer.empty),
}))

// Mock drizzle
vi.mock('../../../../src/runtime/server/utils/drizzle.js', () => ({
  Drizzle: MockDrizzle,
}))

// Mock supabase
vi.mock('../../../../src/runtime/server/utils/grizzle/supabase.js', () => ({
  ServerSupabaseClient: MockServerSupabaseClient,
  ServerSupabaseClaims: MockServerSupabaseClaims,
  getSupabaseUser: mocks.getSupabaseUser,
  GetSupabaseUserError,
}))

// Mock grizzle utilities
vi.mock('../../../../src/runtime/server/utils/grizzle/workflows', () => ({
  getWorkflowEffect: mocks.getWorkflowEffect,
}))

vi.mock('../../../../src/runtime/server/utils/grizzle/histories', () => ({
  addHistoryEffect: mocks.addHistoryEffect,
}))

vi.mock('../../../../src/runtime/server/utils/grizzle/datasets', () => ({
  uploadDatasetsEffect: mocks.uploadDatasetsEffect,
}))

vi.mock('../../../../src/runtime/server/utils/grizzle/analyses.js', () => ({
  runAnalysis: mocks.runAnalysis,
}))

// Mock health check to bypass Drizzle dependency
vi.mock('../../../../src/runtime/server/utils/health.js', () => ({
  checkGalaxyHealthEffect: mocks.checkGalaxyHealthEffect,
  CheckGalaxyHealthError,
}))

// Mock h3
vi.mock('h3', async (importOriginal) => {
  const original = await importOriginal<typeof import('h3')>()
  return {
    ...original,
    readBody: mocks.readBody,
  }
})

const event = { path: '/api/db/analyses', method: 'POST' } as H3Event

async function loadHandler() {
  return (await import('../../../../src/runtime/server/api/db/analyses.post')).default
}

describe('post /api/db/analyses', () => {
  beforeEach(() => {
    // call history outlives a test otherwise, so "creates nothing" would pass
    // on the calls an earlier test made
    vi.clearAllMocks()
    mocks.getSupabaseUser.mockReturnValue(Effect.succeed(mockSupabaseUser))
    mocks.getWorkflowEffect.mockReturnValue(Effect.succeed(mockDbWorkflow))
    mocks.addHistoryEffect.mockReturnValue(Effect.succeed(mockDbHistory))
    mocks.runAnalysis.mockReturnValue(Effect.succeed(mockAnalysisResult))
    mocks.uploadDatasetsEffect.mockReturnValue(Effect.succeed([
      { step: '0', insertedId: 1, galaxyId: 'galaxy-ds-1' },
      { step: '1', insertedId: 2, galaxyId: 'galaxy-ds-2' },
    ]))
    mocks.checkGalaxyHealthEffect.mockReturnValue(Effect.succeed({ status: 'up', maintenance: null }))
    mocks.readBody.mockResolvedValue({
      name: 'Test Analysis',
      datamap: {
        0: { storage_object_id: 'so-1' },
        1: { storage_object_id: 'so-2' },
      },
      parameters: {},
      workflowId: 1,
    })
  })

  it('should orchestrate analysis creation and return result', async () => {
    const handler = await loadHandler()

    expect(await handler(event)).toEqual(mockAnalysisResult)
  })

  it('should thread the resolved workflow snapshot into runAnalysis', async () => {
    const handler = await loadHandler()
    await handler(event)

    const callArgs = mocks.runAnalysis.mock.calls[0]
    // runAnalysis(name, galaxyHistoryId, galaxyWorkflowId, historyId, workflowId,
    //             ownerId, inputs, parameters, datamap, workflowSnapshot)
    const workflowSnapshot = callArgs[9]
    expect(workflowSnapshot).toEqual({
      workflowName: mockDbWorkflow.name,
      galaxyWorkflowId: mockDbWorkflow.galaxyId,
      workflowVersion: mockDbWorkflow.versionKey,
    })
  })

  it('refuses an unauthenticated caller with 401, as its siblings do', async () => {
    // this branch answered 500 before the fold existed: the handler failed
    // with GetSupabaseUserError and nothing mapped it to a status
    mocks.getSupabaseUser.mockReturnValue(Effect.succeed(null))
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.addHistoryEffect).not.toHaveBeenCalled()
  })

  it('answers 404 for a workflow the caller named that does not exist', async () => {
    mocks.getWorkflowEffect.mockReturnValue(
      Effect.fail(new WorkflowNotFoundError({ message: 'No workflow 999 is available' })),
    )
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 })
    // the workflow is resolved before anything is created, so an identifier
    // nobody can act on costs a round trip and nothing on Galaxy
    expect(mocks.addHistoryEffect).not.toHaveBeenCalled()
  })

  it('answers 503 when Galaxy did not prepare the analysis', async () => {
    mocks.addHistoryEffect.mockReturnValue(
      Effect.fail(new CreateGalaxyHistoryError({ message: 'The analysis could not be prepared on Galaxy' })),
    )
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'The analysis could not be prepared on Galaxy',
    })
    expect(mocks.runAnalysis).not.toHaveBeenCalled()
  })

  it('says nothing about Galaxy containers in what the caller reads', async () => {
    mocks.addHistoryEffect.mockReturnValue(
      Effect.fail(new CreateGalaxyHistoryError({ message: 'The analysis could not be prepared on Galaxy' })),
    )
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toSatisfy(
      (error: { statusMessage?: string }) =>
        !error.statusMessage?.toLowerCase().includes('history'),
    )
  })

  it('answers 503 when Galaxy is unavailable, as its siblings do', async () => {
    mocks.addHistoryEffect.mockReturnValue(
      Effect.fail(new GalaxyServiceUnavailable({ message: 'Galaxy service is unavailable' })),
    )
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 503 })
  })

  it('answers 503 when the health check refuses to start the analysis', async () => {
    mocks.checkGalaxyHealthEffect.mockReturnValue(
      Effect.succeed({ status: 'maintenance', maintenance: { message: 'back at 18:00' } }),
    )
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 503 })
    expect(mocks.getWorkflowEffect).not.toHaveBeenCalled()
  })

  it('answers 500 when this deployment has no Galaxy user row, and says so in the log', async () => {
    // an unseeded database or a changed GALAXY_URL/GALAXY_EMAIL: nothing the
    // caller can act on, so the reason stays in the log
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)
    mocks.getWorkflowEffect.mockReturnValue(
      Effect.fail(new GalaxyUserNotFoundError({ message: 'No Galaxy user registered for admin@example.org' })),
    )
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
    })
    expect(requestLog.error).toHaveBeenCalledWith(
      'create analysis handler failed',
      expect.objectContaining({ cause: expect.stringContaining('No Galaxy user registered') }),
    )
  })

  it('answers 500 for anything else, and says so in the log', async () => {
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)
    mocks.runAnalysis.mockReturnValue(
      Effect.fail(new Error('the run could not be started')),
    )
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 500 })
    expect(requestLog.error).toHaveBeenCalledWith(
      'create analysis handler failed',
      expect.objectContaining({ cause: expect.stringContaining('the run could not be started') }),
    )
  })
})
