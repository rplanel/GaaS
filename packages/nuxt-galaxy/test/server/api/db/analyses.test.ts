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

  /**
   * #47. The handler's type annotation is erased at build time, so nothing
   * checked that a body arrived or had the shape the handler destructures:
   * `undefined` threw a `TypeError` into a 500 before the program existed —
   * and so before `toHttpError`, so it reached no log — `workflowId: "abc"`
   * reached Postgres, a missing `name` bought two Galaxy round trips before
   * the `varchar(256)` refused it, and `datamap: "f"` passed #43's key
   * comparison because `Object.keys("f")` is `["0"]`.
   *
   * These assert the body is read and refused before the program is built:
   * nothing looked up, nothing prepared, nothing to unwind. `getSupabaseUser`
   * is the first thing the program does, so it standing untouched is what
   * "before the program" means here.
   */
  describe('a body that is not an analysis request', () => {
    const validBody = {
      name: 'Test Analysis',
      datamap: {
        0: { storage_object_id: 'so-1' },
        1: { storage_object_id: 'so-2' },
      },
      parameters: {},
      workflowId: 1,
    }

    function expectNothingPrepared() {
      expect(mocks.getSupabaseUser).not.toHaveBeenCalled()
      expect(mocks.getWorkflowEffect).not.toHaveBeenCalled()
      expect(mocks.addHistoryEffect).not.toHaveBeenCalled()
      expect(mocks.uploadDatasetsEffect).not.toHaveBeenCalled()
      expect(mocks.runAnalysis).not.toHaveBeenCalled()
      expect(mocks.discardPreparedHistoryEffect).not.toHaveBeenCalled()
    }

    it('refuses a request with no body with 400, and names what a body must carry', async () => {
      // h3 1.15.11's `_parseJSON` resolves `undefined` for an empty body;
      // this used to be the destructure's `TypeError`, a 500 with no log
      mocks.readBody.mockResolvedValue(undefined)
      const handler = await loadHandler()

      await expect(handler(event)).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: expect.stringMatching(/`name`.*`workflowId`.*`datamap`/),
      })
      expectNothingPrepared()
    })

    it('refuses an unparseable body with its own 400, so h3\'s does not reach the caller', async () => {
      // `readBody` throws for a body that is not JSON; left uncaught that was
      // h3's `400 Bad Request` with `Invalid JSON body`, a caller-facing
      // message this handler never wrote
      mocks.readBody.mockRejectedValue(new Error('Invalid JSON body'))
      const handler = await loadHandler()

      await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
      await expect(handler(event)).rejects.toSatisfy(
        (error: { statusMessage?: string }) =>
          error.statusMessage !== 'Bad Request' && !error.statusMessage?.includes('Invalid JSON'),
      )
      expectNothingPrepared()
    })

    it('refuses a `workflowId` that is not a number before the workflow is looked up', async () => {
      // `eq(workflows.id, 'abc')` against an integer column was a Postgres
      // error, and a `GetWorkflowError` this handler does not map: a 500
      mocks.readBody.mockResolvedValue({ ...validBody, workflowId: 'abc' })
      const handler = await loadHandler()

      await expect(handler(event)).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: expect.stringContaining('`workflowId`'),
      })
      expectNothingPrepared()
    })

    // decided in the ticket: the form sends a number, and a client sending
    // "1" has a bug worth being told about, so it is not coerced
    it('does not coerce a numeric string into a `workflowId`', async () => {
      mocks.readBody.mockResolvedValue({ ...validBody, workflowId: '1' })
      const handler = await loadHandler()

      await expect(handler(event)).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: expect.stringContaining('`workflowId`'),
      })
      expectNothingPrepared()
    })

    // `analyses.name` is `varchar(256) notNull`, so each of these used to
    // create a Galaxy history and insert a row before Postgres refused the
    // insert with a 500. #39's compensation unwound the history; the two
    // round trips were still spent.
    describe.each([
      ['absent', undefined],
      ['empty', ''],
      ['blank', '   '],
      ['over 256 characters', 'a'.repeat(257)],
    ])('a `name` that is %s', (_label, name) => {
      it('is refused with 400 before anything is prepared on Galaxy or in the database', async () => {
        mocks.readBody.mockResolvedValue({ ...validBody, name })
        const handler = await loadHandler()

        await expect(handler(event)).rejects.toMatchObject({
          statusCode: 400,
          statusMessage: expect.stringContaining('`name`'),
        })
        expectNothingPrepared()
      })
    })

    it('accepts a `name` of exactly 256 characters, the column\'s width', async () => {
      mocks.readBody.mockResolvedValue({ ...validBody, name: 'a'.repeat(256) })
      const handler = await loadHandler()

      expect(await handler(event)).toEqual(mockAnalysisResult)
    })

    // #43's guard compares `Object.keys(datamap)` against the declared steps,
    // and `Object.keys` answers for a non-object: `"f"` gives `["0"]`, which
    // satisfies a workflow declaring an input at step 0 and reaches
    // `uploadDatasetsEffect` with `storage_object_id: undefined`; `{ 0: null }`
    // is a `TypeError` inside its destructure, a logged 500. Both are named
    // in the ticket and both are named here.
    describe.each([
      ['the string "f"', 'f'],
      ['a number', 42],
      ['an array', ['a']],
      ['null', null],
      ['an entry that is null, { "0": null }', { 0: null }],
      ['an entry that is a string', { 0: 'so-1' }],
      ['an entry carrying no `storage_object_id`', { 0: { id: 1, dataset_name: 'reads.fastq' } }],
      ['an entry whose `storage_object_id` is not a string', { 0: { storage_object_id: 7 } }],
    ])('a `datamap` that is %s', (_label, datamap) => {
      it('is refused with 400 naming the field and what its entries must carry', async () => {
        mocks.readBody.mockResolvedValue({ ...validBody, datamap })
        const handler = await loadHandler()

        await expect(handler(event)).rejects.toMatchObject({
          statusCode: 400,
          statusMessage: expect.stringMatching(/`datamap`.*`storage_object_id`/),
        })
        expectNothingPrepared()
      })
    })

    it('refuses `parameters` that is not an object', async () => {
      mocks.readBody.mockResolvedValue({ ...validBody, parameters: 'not parameters' })
      const handler = await loadHandler()

      await expect(handler(event)).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: expect.stringContaining('`parameters`'),
      })
      expectNothingPrepared()
    })

    it('accepts a body with no `parameters`, as the handler always has', async () => {
      const { parameters: _parameters, ...bodyWithoutParameters } = validBody
      mocks.readBody.mockResolvedValue(bodyWithoutParameters)
      const handler = await loadHandler()

      expect(await handler(event)).toEqual(mockAnalysisResult)
      // runAnalysis(name, galaxyHistoryId, galaxyWorkflowId, historyId,
      //             workflowId, ownerId, inputs, parameters, datamap, snapshot)
      expect(mocks.runAnalysis.mock.calls[0]![7]).toEqual({})
    })

    // decided in the ticket: refuse on the fields the handler uses and ignore
    // the rest, so an additive client change is not a 400. The form sends the
    // whole `uploaded_datasets` row it picked as each datamap entry, and the
    // stored datamap is what copying an analysis later reads back, so those
    // keys have to survive the check too.
    it('passes a valid body through unchanged, unknown keys included', async () => {
      const datamap = {
        0: { storage_object_id: 'so-1', id: 1, dataset_name: 'reads.fastq', owner_id: 'owner-1' },
        1: { storage_object_id: 'so-2', id: 2, dataset_name: 'genome.fasta', owner_id: 'owner-1' },
      }
      const parameters = { 2: { threshold: '0.5', verbose: true } }
      mocks.readBody.mockResolvedValue({
        name: '  Test Analysis  ',
        datamap,
        parameters,
        workflowId: 1,
        clientVersion: '2.0.0',
      })
      const handler = await loadHandler()

      expect(await handler(event)).toEqual(mockAnalysisResult)
      expect(mocks.uploadDatasetsEffect).toHaveBeenCalledWith(expect.objectContaining({ datamap }))
      const [name, , , , , , , passedParameters, passedDatamap] = mocks.runAnalysis.mock.calls[0]!
      // the name is the reader's, spaces and all: checked, not rewritten
      expect(name).toBe('  Test Analysis  ')
      expect(passedParameters).toEqual(parameters)
      expect(passedDatamap).toEqual(datamap)
    })
  })
})
