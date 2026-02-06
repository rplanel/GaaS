import type { $Fetch } from 'ofetch'
import type { GalaxyTool } from '../src/types'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'
import { GalaxyFetch, HttpError } from '../src/galaxy'
import { getToolEffect } from '../src/tools'

// Minimal mock GalaxyTool for testing
const mockGalaxyTool: GalaxyTool = {
  model_class: 'Tool',
  id: 'test-tool-id',
  name: 'Test Tool',
  version: '1.0.0',
  description: 'A test tool',
  edam_operations: [],
  edam_topics: [],
  tool_shed_repository: {
    name: 'test-repo',
    owner: 'test-owner',
    changeset_revision: 'abc123',
    tool_shed: 'toolshed.g2.bx.psu.edu',
  },
  inputs: [],
  outputs: [],
}

// Create a minimal mock $Fetch that only implements what we need
function createMockGalaxyFetch(response: any): Layer.Layer<GalaxyFetch> {
  return Layer.succeed(
    GalaxyFetch,
    (async <T>(_url: string, _options?: any) => response as T) as unknown as $Fetch,
  )
}

// Create a mock that simulates network failures
function createFailingMockGalaxyFetch(error: Error): Layer.Layer<GalaxyFetch> {
  return Layer.succeed(
    GalaxyFetch,
    (async <_T>(_url: string, _options?: any) => {
      throw error
    }) as unknown as $Fetch,
  )
}

describe('getToolEffect', () => {
  it('should successfully retrieve a tool', async () => {
    const mockFetch = createMockGalaxyFetch(mockGalaxyTool)

    const effect = getToolEffect('test-tool-id', '1.0.0').pipe(
      Effect.provide(mockFetch),
    )

    const result = await Effect.runPromise(effect)

    expect(result).toEqual(mockGalaxyTool)
    expect(result.id).toBe('test-tool-id')
    expect(result.version).toBe('1.0.0')
  })

  it('should handle network failures', async () => {
    const networkError = new Error('Network error: Connection refused')
    const mockFetch = createFailingMockGalaxyFetch(networkError)

    const effect = getToolEffect('test-tool-id', '1.0.0').pipe(
      Effect.provide(mockFetch),
    )

    const exit = await Effect.runPromiseExit(effect)

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const error = exit.cause._tag === 'Fail' ? exit.cause.error : null
      expect(error).toBeInstanceOf(HttpError)
      expect((error as HttpError).message).toContain('Error getting tool test-tool-id')
      expect((error as HttpError).message).toContain('Network error')
    }
  })

  it('should handle timeout errors', async () => {
    const timeoutError = new Error('Request timeout after 5000ms')
    const mockFetch = createFailingMockGalaxyFetch(timeoutError)

    const effect = getToolEffect('slow-tool', '2.0.0').pipe(
      Effect.provide(mockFetch),
    )

    const exit = await Effect.runPromiseExit(effect)

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const error = exit.cause._tag === 'Fail' ? exit.cause.error : null
      expect(error).toBeInstanceOf(HttpError)
      expect((error as HttpError).message).toContain('Error getting tool slow-tool')
    }
  })

  it('should include tool ID and version in error message', async () => {
    const customError = new Error('Custom network failure')
    const mockFetch = createFailingMockGalaxyFetch(customError)

    const effect = getToolEffect('my-specific-tool', '3.1.4').pipe(
      Effect.provide(mockFetch),
    )

    const exit = await Effect.runPromiseExit(effect)

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const error = exit.cause._tag === 'Fail' ? exit.cause.error : null
      expect(error).toBeInstanceOf(HttpError)
      const errorMessage = (error as HttpError).message
      expect(errorMessage).toContain('my-specific-tool')
    }
  })

  it('should construct correct API URL with tool ID and version', async () => {
    let capturedUrl = ''
    const mockFetch = Layer.succeed(
      GalaxyFetch,
      (async (url: string, _options?: any) => {
        capturedUrl = url
        return mockGalaxyTool
      }) as unknown as $Fetch,
    )

    const effect = getToolEffect('test-tool-id', '1.0.0').pipe(
      Effect.provide(mockFetch),
    )

    await Effect.runPromise(effect)

    expect(capturedUrl).toBe('api/tools/test-tool-id?io_details=true&version=1.0.0')
  })

  it('should handle tools with complex inputs and outputs', async () => {
    const complexTool: GalaxyTool = {
      ...mockGalaxyTool,
      id: 'complex-tool',
      name: 'Complex Analysis Tool',
      inputs: [
        {
          model_class: 'DataToolParameter',
          name: 'input_file',
          label: 'Input dataset',
          argument: '',
          help: 'Select an input file',
          refresh_on_change: false,
          optional: false,
          hidden: false,
          is_dynamic: false,
          type: 'data',
          value: { values: [] },
          extensions: ['fasta', 'fastq'],
          edam: { edam_formats: [], edam_data: [] },
          multiple: false,
          options: { hda: [], hdca: [] },
        },
      ],
      outputs: [
        {
          model_class: 'ToolOutput',
          name: 'output_file',
          format: 'tabular',
          label: 'Results',
          hidden: false,
          output_type: 'data',
          count: 1,
        },
      ],
    }
    const mockFetch = createMockGalaxyFetch(complexTool)

    const effect = getToolEffect('complex-tool', '2.0.0').pipe(
      Effect.provide(mockFetch),
    )

    const result = await Effect.runPromise(effect)

    expect(result.inputs).toHaveLength(1)
    expect(result.outputs).toHaveLength(1)
    expect(result.inputs[0]?.name).toBe('input_file')
    expect(result.outputs[0]?.name).toBe('output_file')
  })

  it('should handle 404 not found error', async () => {
    const notFoundError = new Error('404 Not Found')
    const mockFetch = createFailingMockGalaxyFetch(notFoundError)

    const effect = getToolEffect('non-existent-tool', '1.0.0').pipe(
      Effect.provide(mockFetch),
    )

    const exit = await Effect.runPromiseExit(effect)

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const error = exit.cause._tag === 'Fail' ? exit.cause.error : null
      expect(error).toBeInstanceOf(HttpError)
      expect((error as HttpError).message).toContain('404')
    }
  })

  it('should handle 403 forbidden error', async () => {
    const forbiddenError = new Error('403 Forbidden')
    const mockFetch = createFailingMockGalaxyFetch(forbiddenError)

    const effect = getToolEffect('restricted-tool', '1.0.0').pipe(
      Effect.provide(mockFetch),
    )

    const exit = await Effect.runPromiseExit(effect)

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const error = exit.cause._tag === 'Fail' ? exit.cause.error : null
      expect(error).toBeInstanceOf(HttpError)
      expect((error as HttpError).message).toContain('403')
    }
  })

  it('should handle 500 server error', async () => {
    const serverError = new Error('500 Internal Server Error')
    const mockFetch = createFailingMockGalaxyFetch(serverError)

    const effect = getToolEffect('broken-tool', '1.0.0').pipe(
      Effect.provide(mockFetch),
    )

    const exit = await Effect.runPromiseExit(effect)

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const error = exit.cause._tag === 'Fail' ? exit.cause.error : null
      expect(error).toBeInstanceOf(HttpError)
      expect((error as HttpError).message).toContain('500')
    }
  })
})
