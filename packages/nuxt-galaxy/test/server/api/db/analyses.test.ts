import type { H3Event } from 'h3'
import { Context, Data, Effect, Layer } from 'effect'
import { useLogger } from 'evlog'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockRequestLogger } from '../../setup'
import { dataInputStep, workflowDefinition } from '../../workflowDefinition'

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
  // The column the refusal in #43 is read off. It declares the two inputs the
  // default datamap below supplies, so the happy path stays the happy path.
  definition: workflowDefinition({
    0: dataInputStep(0, 'Input FASTQ'),
    1: dataInputStep(1, 'Input reference'),
  }),
}

/** A workflow that asks for nothing, for which an empty datamap is correct. */
const mockDbWorkflowWithoutInputs = {
  ...mockDbWorkflow,
  definition: workflowDefinition({}),
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
  discardPreparedHistoryEffect: vi.fn(),
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
  discardPreparedHistoryEffect: mocks.discardPreparedHistoryEffect,
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
    mocks.discardPreparedHistoryEffect.mockReturnValue(Effect.void)
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

    const callArgs = mocks.runAnalysis.mock.calls[0]!
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

    // the body is asserted, not just the status: this handler's own
    // `GetSupabaseUserError` says 'No user found', so a 401 that passed the
    // error's message through would fail here. Every other handler's fixture
    // happens to carry 'Unauthorized' already, which makes the same assertion
    // unable to tell the two apart.
    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })
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

  // #39. `addHistoryEffect` runs before anything is uploaded, so everything
  // below it has a container on Galaxy and a row recording it to take back
  // out. The compensation that existed hung off a single upload, and
  // `uploadDatasetsEffect` for an empty datamap is `Effect.all([])`: no
  // upload runs, so nothing carrying it runs either.
  describe('a request that strands the analysis it prepared', () => {
    beforeEach(() => {
      // An empty datamap for a workflow that declares nothing. It used to be
      // an empty datamap for a workflow that declares inputs — the shape the
      // unselected input submitted — but #43 refuses that before anything is
      // prepared, so it can no longer reach the compensation. What #39 cares
      // about is that no upload ran, and `Effect.all([])` is still how that
      // happens: a workflow with nothing to upload reaches the invocation
      // with the same empty `inputs`.
      mocks.getWorkflowEffect.mockReturnValue(Effect.succeed(mockDbWorkflowWithoutInputs))
      mocks.readBody.mockResolvedValue({
        name: 'Test Analysis',
        datamap: {},
        parameters: {},
        workflowId: 1,
      })
      mocks.uploadDatasetsEffect.mockReturnValue(Effect.succeed([]))
    })

    it('takes it back out when the run fails and nothing was uploaded', async () => {
      mocks.runAnalysis.mockReturnValue(
        Effect.fail(new Error('Galaxy refused the invocation')),
      )
      const handler = await loadHandler()

      await expect(handler(event)).rejects.toMatchObject({ statusCode: 500 })
      expect(mocks.discardPreparedHistoryEffect).toHaveBeenCalledWith(
        mockDbHistory.galaxyId,
        mockDbHistory.id,
      )
    })

    it('takes it back out when an upload fails', async () => {
      mocks.uploadDatasetsEffect.mockReturnValue(
        Effect.fail(new Error('the dataset could not be uploaded')),
      )
      const handler = await loadHandler()

      await expect(handler(event)).rejects.toMatchObject({ statusCode: 500 })
      expect(mocks.discardPreparedHistoryEffect).toHaveBeenCalledWith(
        mockDbHistory.galaxyId,
        mockDbHistory.id,
      )
      expect(mocks.runAnalysis).not.toHaveBeenCalled()
    })

    it('leaves it alone when the analysis started', async () => {
      const handler = await loadHandler()

      expect(await handler(event)).toEqual(mockAnalysisResult)
      expect(mocks.discardPreparedHistoryEffect).not.toHaveBeenCalled()
    })

    // Nothing was prepared yet, so there is nothing to unwind: unwinding
    // anyway would delete by whatever identifiers the failed call left.
    it('has nothing to take back out when preparing it is what failed', async () => {
      mocks.addHistoryEffect.mockReturnValue(
        Effect.fail(new CreateGalaxyHistoryError({ message: 'The analysis could not be prepared on Galaxy' })),
      )
      const handler = await loadHandler()

      await expect(handler(event)).rejects.toMatchObject({ statusCode: 503 })
      expect(mocks.discardPreparedHistoryEffect).not.toHaveBeenCalled()
    })
  })

  /**
   * #43. #39 made the form refuse an unselected input, which left the guard
   * client-side only: the endpoint went on accepting a datamap that named no
   * input for a workflow that declares one, prepared a history, asked Galaxy
   * to invoke with no inputs, and recorded an analysis that cannot have run.
   *
   * The information to refuse it was already loaded — `getWorkflowEffect`
   * does `select()`, so `definition` is in scope one line before the first
   * thing that gets created. These assert that it is now read there.
   */
  describe('a datamap that does not match the workflow it names', () => {
    it('refuses 400 and names the input that was left out', async () => {
      mocks.readBody.mockResolvedValue({
        name: 'Test Analysis',
        datamap: { 0: { storage_object_id: 'so-1' } },
        parameters: {},
        workflowId: 1,
      })
      const handler = await loadHandler()

      // the input's own label, not a restatement of the request: the reader
      // is told which field to go back and fill in
      await expect(handler(event)).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: 'No dataset was provided for the input "Input reference"',
      })
    })

    it('refuses before anything is prepared, on Galaxy or in the database', async () => {
      mocks.readBody.mockResolvedValue({
        name: 'Test Analysis',
        datamap: {},
        parameters: {},
        workflowId: 1,
      })
      const handler = await loadHandler()

      await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
      // the ordering the refusal depends on: no container, no row, no upload,
      // no invocation — and so nothing to unwind either
      expect(mocks.addHistoryEffect).not.toHaveBeenCalled()
      expect(mocks.uploadDatasetsEffect).not.toHaveBeenCalled()
      expect(mocks.runAnalysis).not.toHaveBeenCalled()
      expect(mocks.discardPreparedHistoryEffect).not.toHaveBeenCalled()
    })

    it('accepts an empty datamap for a workflow that declares no inputs', async () => {
      mocks.getWorkflowEffect.mockReturnValue(Effect.succeed(mockDbWorkflowWithoutInputs))
      mocks.readBody.mockResolvedValue({
        name: 'Test Analysis',
        datamap: {},
        parameters: {},
        workflowId: 1,
      })
      mocks.uploadDatasetsEffect.mockReturnValue(Effect.succeed([]))
      const handler = await loadHandler()

      expect(await handler(event)).toEqual(mockAnalysisResult)
      expect(mocks.runAnalysis).toHaveBeenCalled()
    })

    it('refuses a datamap naming a step the workflow does not declare', async () => {
      // Refused although Galaxy would ignore it, for the reason argued in
      // `workflowInputs.ts`: the upload happens before Galaxy sees anything.
      mocks.readBody.mockResolvedValue({
        name: 'Test Analysis',
        datamap: {
          0: { storage_object_id: 'so-1' },
          1: { storage_object_id: 'so-2' },
          7: { storage_object_id: 'so-7' },
        },
        parameters: {},
        workflowId: 1,
      })
      const handler = await loadHandler()

      await expect(handler(event)).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: 'This workflow declares no dataset input at step 7',
      })
      expect(mocks.uploadDatasetsEffect).not.toHaveBeenCalled()
    })

    it('reconciles the datamap against the definition\'s own step keys', async () => {
      // The two shapes are keyed the same way and that is the whole
      // reconciliation: `definition.steps` is keyed by step index, and Galaxy
      // resolves an invocation's `inputs` by `step_index` because
      // `invokeWorkflowEffect` sends no `inputs_by`. A definition whose only
      // input sits at step 4 is supplied by a datamap key of '4' and by
      // nothing else — so the same datamap that satisfies it here would be
      // refused against the default fixture's steps 0 and 1.
      mocks.getWorkflowEffect.mockReturnValue(Effect.succeed({
        ...mockDbWorkflow,
        definition: workflowDefinition({ 4: dataInputStep(4, 'Input FASTQ') }),
      }))
      mocks.readBody.mockResolvedValue({
        name: 'Test Analysis',
        datamap: { 4: { storage_object_id: 'so-4' } },
        parameters: {},
        workflowId: 1,
      })
      const handler = await loadHandler()

      expect(await handler(event)).toEqual(mockAnalysisResult)
    })

    it('says nothing about a mismatch when the workflow could not be resolved', async () => {
      // the 404 comes first: there is no definition to reconcile against
      mocks.getWorkflowEffect.mockReturnValue(
        Effect.fail(new WorkflowNotFoundError({ message: 'No workflow 999 is available' })),
      )
      mocks.readBody.mockResolvedValue({
        name: 'Test Analysis',
        datamap: {},
        parameters: {},
        workflowId: 999,
      })
      const handler = await loadHandler()

      await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 })
    })
  })
})
