import { Effect, pipe } from 'effect'
import { describe, expect, it } from 'vitest'
import { ToolError } from '../src/errors'
import { getTool, getToolEffect } from '../src/tools'
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
  mockComplexTool,
  mockGalaxyTool,
} from './fixtures'

describe('getToolEffect', () => {
  describe('success cases', () => {
    it('should successfully retrieve a tool', () =>
      pipe(
        Effect.gen(function* () {
          const tool = yield* getToolEffect('test-tool-id', '1.0.0')

          expect(tool).toEqual(mockGalaxyTool)
          expect(tool.id).toBe('test-tool-id')
          expect(tool.version).toBe('1.0.0')
        }),
        Effect.provide(createSuccessLayer(mockGalaxyTool)),
        Effect.runPromise,
      ))

    it('should construct correct API URL with tool ID and version', () =>
      pipe(
        Effect.gen(function* () {
          const trackingLayer = createUrlTrackingLayer(mockGalaxyTool)
          const tool = yield* getToolEffect('test-tool-id', '1.0.0').pipe(
            Effect.provide(trackingLayer),
          )

          expect(tool).toEqual(mockGalaxyTool)
          expect(trackingLayer.getLastUrl()).toBe(
            'api/tools/test-tool-id?io_details=true&version=1.0.0',
          )
        }),
        Effect.runPromise,
      ))

    it('should handle tools with complex inputs and outputs', () =>
      pipe(
        Effect.gen(function* () {
          const tool = yield* getToolEffect('complex-tool', '2.0.0')

          expect(tool.inputs).toHaveLength(1)
          expect(tool.outputs).toHaveLength(1)
          expect(tool.inputs[0]?.name).toBe('input_file')
          expect(tool.outputs[0]?.name).toBe('output_file')
        }),
        Effect.provide(createSuccessLayer(mockComplexTool)),
        Effect.runPromise,
      ))
  })

  describe('error cases', () => {
    it('should handle network failures', () =>
      pipe(
        Effect.gen(function* () {
          const exit = yield* Effect.exit(
            getToolEffect('test-tool-id', '1.0.0'),
          )

          expectFailure(exit, (error) => {
            expect(error).toBeInstanceOf(ToolError)
            expect(error.message).toContain('Error getting tool test-tool-id')
            expect(error.message).toContain(ERROR_MESSAGES.NETWORK_REFUSED)
            expect(error.toolId).toBe('test-tool-id')
            expect(error.cause).toBeInstanceOf(Error)
            expect((error.cause as Error).message).toBe(
              ERROR_MESSAGES.NETWORK_REFUSED,
            )
          })
        }),
        Effect.provide(
          createFailureLayer(new Error(ERROR_MESSAGES.NETWORK_REFUSED)),
        ),
        Effect.runPromise,
      ))

    it('should handle timeout errors', () =>
      pipe(
        Effect.gen(function* () {
          const exit = yield* Effect.exit(
            getToolEffect('slow-tool', '2.0.0'),
          )

          expectFailure(exit, (error) => {
            expect(error).toBeInstanceOf(ToolError)
            expect(error.message).toContain('Error getting tool slow-tool')
            expect(error.toolId).toBe('slow-tool')
          })
        }),
        Effect.provide(
          createFailureLayer(new Error(ERROR_MESSAGES.TIMEOUT)),
        ),
        Effect.runPromise,
      ))

    it('should include tool ID in error', () =>
      pipe(
        Effect.gen(function* () {
          const exit = yield* Effect.exit(
            getToolEffect('my-specific-tool', '3.1.4'),
          )

          expectFailure(exit, (error) => {
            expect(error).toBeInstanceOf(ToolError)
            expect(error.toolId).toBe('my-specific-tool')
            expect(error.message).toContain('my-specific-tool')
          })
        }),
        Effect.provide(createFailureLayer(new Error('Custom network failure'))),
        Effect.runPromise,
      ))

    it('should handle 404 not found error', () =>
      pipe(
        Effect.gen(function* () {
          const exit = yield* Effect.exit(
            getToolEffect('non-existent-tool', '1.0.0'),
          )

          expectFailure(exit, (error) => {
            expect(error).toBeInstanceOf(ToolError)
            expect(error.statusCode).toBe(HTTP_STATUS_CODES.NOT_FOUND)
            expect(error.message).toContain('404')
          })
        }),
        Effect.provide(
          createHttpErrorLayer(
            HTTP_STATUS_CODES.NOT_FOUND,
            'Not Found',
          ),
        ),
        Effect.runPromise,
      ))

    it('should handle 403 forbidden error', () =>
      pipe(
        Effect.gen(function* () {
          const exit = yield* Effect.exit(
            getToolEffect('restricted-tool', '1.0.0'),
          )

          expectFailure(exit, (error) => {
            expect(error).toBeInstanceOf(ToolError)
            expect(error.statusCode).toBe(HTTP_STATUS_CODES.FORBIDDEN)
            expect(error.message).toContain('403')
          })
        }),
        Effect.provide(
          createHttpErrorLayer(HTTP_STATUS_CODES.FORBIDDEN, 'Forbidden'),
        ),
        Effect.runPromise,
      ))

    it('should handle 500 server error', () =>
      pipe(
        Effect.gen(function* () {
          const exit = yield* Effect.exit(
            getToolEffect('broken-tool', '1.0.0'),
          )

          expectFailure(exit, (error) => {
            expect(error).toBeInstanceOf(ToolError)
            expect(error.statusCode).toBe(HTTP_STATUS_CODES.SERVER_ERROR)
            expect(error.message).toContain('500')
          })
        }),
        Effect.provide(
          createHttpErrorLayer(
            HTTP_STATUS_CODES.SERVER_ERROR,
            'Internal Server Error',
          ),
        ),
        Effect.runPromise,
      ))
  })
})

describe('getTool (Promise wrapper)', () => {
  it('should resolve with tool data when given a success layer', async () => {
    const result = await getTool('test-tool-id', '1.0.0', createSuccessLayer(mockGalaxyTool))
    expect(result).toEqual(mockGalaxyTool)
    expect(result.id).toBe('test-tool-id')
  })

  it('should reject when given a failure layer', async () => {
    await expect(
      getTool('test-tool-id', '1.0.0', createFailureLayer(new Error(ERROR_MESSAGES.NETWORK_REFUSED))),
    ).rejects.toThrow()
  })

  it('should map Service Unavailable to GalaxyServiceUnavailable', async () => {
    try {
      await getTool('test-tool-id', '1.0.0', createServiceUnavailableLayer())
      expect.unreachable('Should have thrown')
    }
    catch (error) {
      const inner = extractFiberFailure(error)
      expect((inner as any)._tag).toBe('GalaxyServiceUnavailable')
    }
  })

  it('should propagate HTTP status codes through the wrapper', async () => {
    try {
      await getTool('test-tool-id', '1.0.0', createHttpErrorLayer(HTTP_STATUS_CODES.NOT_FOUND, 'Not Found'))
      expect.unreachable('Should have thrown')
    }
    catch (error) {
      const inner = extractFiberFailure(error)
      expect(inner).toBeInstanceOf(ToolError)
      expect((inner as ToolError).statusCode).toBe(HTTP_STATUS_CODES.NOT_FOUND)
    }
  })
})
