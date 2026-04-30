import { Effect, Layer } from 'effect'
import { describe, expect, it, vi } from 'vitest'

const mockTool = {
  id: 'test-tool-id',
  name: 'Test Tool',
  version: '1.0.0',
  inputs: [],
  outputs: [],
}

// Mock blendtype
vi.mock('blendtype', () => ({
  getToolEffect: vi.fn((_toolId: string, _version: string) =>
    Effect.succeed(mockTool),
  ),
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

  it('should return undefined when toolId is missing', async () => {
    const h3 = await import('h3')
    const getRouterParamSpy = h3.getRouterParam as ReturnType<typeof vi.fn>
    getRouterParamSpy.mockImplementation((_event: unknown, param: string) => {
      if (param === 'toolId')
        return undefined
      if (param === 'toolVersion')
        return '1.0.0'
      return undefined
    })

    const handler = (await import('../../../../src/runtime/server/api/galaxy/tools/[toolId]/[toolVersion].get')).default
    const result = await handler({} as any)

    expect(result).toBeUndefined()

    // Restore
    getRouterParamSpy.mockImplementation((_event: unknown, param: string) => {
      const params: Record<string, string> = {
        toolId: 'test-tool-id',
        toolVersion: '1.0.0',
      }
      return params[param]
    })
  })
})
