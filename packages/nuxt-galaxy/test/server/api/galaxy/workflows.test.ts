import { Effect, Layer } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockWorkflows = [
  { id: 'wf-1', name: 'Workflow 1' },
  { id: 'wf-2', name: 'Workflow 2' },
]

/** What Galaxy answers. Set per test so one mock covers success and outage. */
let resolveWorkflows: () => Effect.Effect<unknown, unknown> = () => Effect.succeed(mockWorkflows)

// Mock blendtype. `toGalaxyServiceUnavailable` is the identity so the real
// `.pipe` chain runs — stubbing `pipe` itself would skip `Effect.either` and
// test nothing.
vi.mock('blendtype', () => ({
  getWorkflowsEffect: vi.fn(() => resolveWorkflows()),
  toGalaxyServiceUnavailable: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  makeGalaxyLayer: vi.fn(() => Layer.empty),
}))

// Mock the galaxy utility
vi.mock('../../../../src/runtime/server/utils/galaxy', () => ({
  useGalaxyLayer: vi.fn(() => Layer.empty),
}))

async function callHandler() {
  const handler = (await import('../../../../src/runtime/server/api/galaxy/workflows.get')).default
  return handler({} as any)
}

describe('gET /api/galaxy/workflows', () => {
  beforeEach(() => {
    resolveWorkflows = () => Effect.succeed(mockWorkflows)
  })

  it('should return a list of workflows', async () => {
    expect(await callHandler()).toEqual(mockWorkflows)
  })

  // Galaxy's default list omits the stored workflows the account hid in
  // Galaxy's own list; hidden says nothing about publishing or running, and
  // the admin page reads a stored workflow absent from this list as one
  // Galaxy no longer has. So the proxy asks for the hidden ones too.
  it('asks blendtype for the hidden stored workflows as well', async () => {
    const bt = await import('blendtype')
    await callHandler()

    expect(bt.getWorkflowsEffect).toHaveBeenLastCalledWith({ includeHidden: true })
  })

  it('answers 503 rather than 500 when Galaxy is unavailable', async () => {
    resolveWorkflows = () => Effect.fail({
      _tag: 'GalaxyServiceUnavailable',
      message: 'Galaxy is unavailable',
    })

    await expect(callHandler()).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'Galaxy is unavailable',
    })
  })
})
