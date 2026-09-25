import { Effect, Layer } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #87, Q13(a). One revision described in one call, for the invoke form and
 * the analysis panel: steps, inputs, tool definitions, and the tools that
 * came back as something other than themselves.
 *
 * The description itself has its own tests; here it is the request — which
 * revision is refused before Galaxy is asked, and which status each failure
 * answers with.
 */

const FOO = 'toolshed.g2.bx.psu.edu/repos/iuc/foo/foo/1.2.3+galaxy0'

/** What the description effect answers for the revision asked for. */
const mockDescription = {
  steps: { 1: { id: 1, type: 'tool', tool_id: FOO, tool_version: '1.2.3+galaxy0' } },
  inputs: { 0: { label: 'Input FASTQ', value: '', uuid: 'input-uuid' } },
  tools: { [`${FOO}@1.2.3+galaxy0`]: { model_class: 'Tool', id: FOO, version: '1.2.3+galaxy0' } },
  unavailable: [],
}

class MockGalaxyServiceUnavailable extends Error {
  readonly _tag = 'GalaxyServiceUnavailable'
  constructor(opts: { message: string }) {
    super(opts.message)
  }
}

class MockWorkflowRevisionNotFound extends Error {
  readonly _tag = 'WorkflowRevisionNotFound'
  constructor(opts: { message: string }) {
    super(opts.message)
  }
}

const mocks = vi.hoisted(() => ({
  workflowDescriptionEffect: vi.fn(),
  useGalaxyCache: vi.fn(),
  /** The route parameters of the request under test. */
  params: { workflowId: 'galaxy-workflow-1', revision: '3' } as Record<string, string | undefined>,
}))

vi.mock('blendtype', () => ({
  toGalaxyServiceUnavailable: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  GalaxyServiceUnavailable: MockGalaxyServiceUnavailable,
  makeGalaxyLayer: vi.fn(() => Layer.empty),
}))

vi.mock('../../../../src/runtime/server/utils/grizzle/workflowDescription', () => ({
  workflowDescriptionEffect: mocks.workflowDescriptionEffect,
  WorkflowRevisionNotFound: MockWorkflowRevisionNotFound,
}))

vi.mock('../../../../src/runtime/server/utils/galaxyCache', () => ({
  useGalaxyCache: mocks.useGalaxyCache,
}))

vi.mock('../../../../src/runtime/server/utils/galaxy', () => ({
  useGalaxyLayer: vi.fn(() => Layer.empty),
}))

vi.mock('h3', async (importOriginal) => {
  const original = await importOriginal<typeof import('h3')>()
  return {
    ...original,
    getRouterParam: vi.fn((_event: unknown, param: string) => mocks.params[param]),
  }
})

async function loadHandler() {
  return (await import('../../../../src/runtime/server/api/galaxy/workflows/[workflowId]/revisions/[revision]/description.get')).default
}

describe('get /api/galaxy/workflows/:workflowId/revisions/:revision/description', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.params = { workflowId: 'galaxy-workflow-1', revision: '3' }
    mocks.workflowDescriptionEffect.mockReturnValue(Effect.succeed(mockDescription))
    mocks.useGalaxyCache.mockReturnValue({})
  })

  it('describes the revision asked for, in one answer with no envelope', async () => {
    const handler = await loadHandler()

    const result = await handler({} as any)

    expect(mocks.workflowDescriptionEffect).toHaveBeenLastCalledWith(
      'galaxy-workflow-1',
      3,
      expect.anything(),
      'https://galaxy.example.com',
    )
    expect(result).toEqual(mockDescription)
  })

  it('names the tools that came back as something else, rather than leaving them out', async () => {
    mocks.workflowDescriptionEffect.mockReturnValue(Effect.succeed({
      ...mockDescription,
      tools: {},
      unavailable: [
        { toolId: FOO, toolVersion: '1.2.3+galaxy0', reason: 'version_mismatch', servedVersion: '1.3.0' },
      ],
    }))

    const handler = await loadHandler()
    const result = await handler({} as any)

    expect(result.unavailable).toEqual([
      { toolId: FOO, toolVersion: '1.2.3+galaxy0', reason: 'version_mismatch', servedVersion: '1.3.0' },
    ])
  })

  // Galaxy's `get_internal_version` indexes a list, so only a non-negative
  // integer names a revision. It is mandatory here on purpose (Q15): the
  // unpinned read answers whatever Galaxy's latest is, which must not be
  // cached, so it is given no route at all.
  it.each([
    ['a word', 'abc'],
    ['a negative index', '-1'],
    ['a fraction', '1.5'],
    ['an empty segment', ''],
    // `Number('10000000000000000001')` is 1e19: not an integer Galaxy can
    // index a list with, and two such requests one apart would build the
    // same cache key and share one permanent entry.
    ['an index past what a number holds exactly', '10000000000000000001'],
  ])('refuses %s as a revision with 400 before asking Galaxy', async (_label, revision) => {
    mocks.params = { workflowId: 'galaxy-workflow-1', revision }

    const handler = await loadHandler()

    await expect(handler({} as any)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.workflowDescriptionEffect).not.toHaveBeenCalled()
  })

  it('answers 404 for an empty workflow id, which a middle segment lets through', async () => {
    mocks.params = { workflowId: '', revision: '3' }

    const handler = await loadHandler()

    await expect(handler({} as any)).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.workflowDescriptionEffect).not.toHaveBeenCalled()
  })

  it('answers 404 when Galaxy holds no such workflow or revision', async () => {
    mocks.workflowDescriptionEffect.mockReturnValue(
      Effect.fail(new MockWorkflowRevisionNotFound({ message: 'Galaxy holds no revision 3 of workflow galaxy-workflow-1' })),
    )

    const handler = await loadHandler()

    await expect(handler({} as any)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('answers 503 when Galaxy is unavailable, as the other Galaxy proxies do', async () => {
    mocks.workflowDescriptionEffect.mockReturnValue(
      Effect.fail(new MockGalaxyServiceUnavailable({ message: 'down' })),
    )

    const handler = await loadHandler()

    await expect(handler({} as any)).rejects.toMatchObject({ statusCode: 503 })
  })

  it('answers a logged 500 for any other failure, which is this server\'s fault rather than the caller\'s', async () => {
    mocks.workflowDescriptionEffect.mockReturnValue(
      Effect.fail(Object.assign(new Error('Galaxy answered 500'), { _tag: 'WorkflowError' })),
    )

    const handler = await loadHandler()

    await expect(handler({} as any)).rejects.toMatchObject({ statusCode: 500 })
  })
})
