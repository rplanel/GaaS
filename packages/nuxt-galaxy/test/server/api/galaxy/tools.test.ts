import { Effect, Layer } from 'effect'
import { describe, expect, it, vi } from 'vitest'

const mockTool = {
  id: 'test-tool-id',
  name: 'Test Tool',
  version: '1.0.0',
  inputs: [],
  outputs: [],
}

/** What Galaxy answers. Set per test so one mock covers success and outage. */
let resolveTool: () => Effect.Effect<unknown, unknown> = () => Effect.succeed(mockTool)

// Mock blendtype
vi.mock('blendtype', async () => ({
  // The real tag, not a stand-in: `evlog-effect` builds a Layer keyed on it.
  BlendTypeLogger: (await vi.importActual<typeof import('blendtype')>('blendtype')).BlendTypeLogger,
  getToolEffect: vi.fn((_toolId: string, _version: string) => resolveTool()),
  toGalaxyServiceUnavailable: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  makeGalaxyLayer: vi.fn(() => Layer.empty),
}))

// Mock the galaxy utility
vi.mock('../../../../src/runtime/server/utils/galaxy', () => ({
  useGalaxyLayer: vi.fn(() => Layer.empty),
}))

// Mock h3
vi.mock('h3', async (importOriginal) => {
  const original = await importOriginal<typeof import('h3')>()
  return {
    ...original,
    getRouterParam: vi.fn((_event: unknown, param: string) => {
      const params: Record<string, string> = {
        toolId: 'test-tool-id',
        toolVersion: '1.0.0',
      }
      return params[param]
    }),
  }
})

// Mock ufo
vi.mock('ufo', () => ({
  decode: (s: string) => s,
}))

describe('gET /api/galaxy/tools/:toolId/:toolVersion', () => {
  it('should return a tool when both params are provided', async () => {
    const handler = (await import('../../../../src/runtime/server/api/galaxy/tools/[toolId]/[toolVersion].get')).default

    const result = await handler({} as any)

    expect(result).toEqual(mockTool)
  })

  // `/api/galaxy/tools//1.0` matches this route with an empty `toolId`: an
  // empty path segment satisfies any parameter that is not the final one.
  // The handler used to fall off its `if` and answer 200 with no body.
  it('refuses an empty toolId with 404 rather than an empty 200', async () => {
    const h3 = await import('h3')
    const getRouterParamSpy = h3.getRouterParam as ReturnType<typeof vi.fn>
    getRouterParamSpy.mockImplementation((_event: unknown, param: string) => {
      if (param === 'toolId')
        return ''
      if (param === 'toolVersion')
        return '1.0.0'
      return undefined
    })

    const handler = (await import('../../../../src/runtime/server/api/galaxy/tools/[toolId]/[toolVersion].get')).default

    await expect(handler({} as any)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Tool not found',
    })

    // Restore
    getRouterParamSpy.mockImplementation((_event: unknown, param: string) => {
      const params: Record<string, string> = {
        toolId: 'test-tool-id',
        toolVersion: '1.0.0',
      }
      return params[param]
    })
  })

  it('answers 503 rather than 500 when Galaxy is unavailable', async () => {
    resolveTool = () => Effect.fail({
      _tag: 'GalaxyServiceUnavailable',
      message: 'Galaxy is unavailable',
    })

    const handler = (await import('../../../../src/runtime/server/api/galaxy/tools/[toolId]/[toolVersion].get')).default

    await expect(handler({} as any)).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'Galaxy is unavailable',
    })

    resolveTool = () => Effect.succeed(mockTool)
  })
})
