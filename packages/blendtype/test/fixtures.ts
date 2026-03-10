import type { Context } from 'effect'
import type { GalaxyDataset, GalaxyTool } from '../src/types'
import { Effect, Exit, Layer } from 'effect'
import { GalaxyFetch } from '../src/galaxy'

// ============================================================================
// Test Fixtures - Reusable Mock Data
// ============================================================================

export const mockGalaxyTool: GalaxyTool = {
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

export const mockGalaxyDataset: GalaxyDataset = {
  dataset_id: 'test-dataset-id',
  type: 'txt',
  extension: 'txt',
  purged: false,
  deleted: false,
  name: 'Test Dataset',
  file_size: 1024,
  tags: [],
  resubmitted: false,
  create_time: '2024-01-01T00:00:00.000Z',
  state: 'ok',
  creating_job: 'test-job-id',
  visible: true,
  history_id: 'test-history-id',
  accessible: true,
  uuid: 'test-uuid',
  metadata_comment_lines: 0,
  metadata_data_lines: 100,
  misc_blurb: null,
}

export const mockComplexTool: GalaxyTool = {
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

// ============================================================================
// Layer Factories - Reusable Test Dependencies
// ============================================================================

/**
 * Type alias for the GalaxyFetch service
 */
type GalaxyFetchService = Context.Tag.Service<GalaxyFetch>

/**
 * Creates a mock GalaxyFetch layer that returns a successful response.
 */
export function createSuccessLayer<T>(response: T): Layer.Layer<GalaxyFetch> {
  return Layer.effect(
    GalaxyFetch,
    Effect.sync(() =>
      (async () => response) as unknown as GalaxyFetchService,
    ),
  )
}

/**
 * Creates a mock GalaxyFetch layer that fails with an error.
 */
export function createFailureLayer(error: Error): Layer.Layer<GalaxyFetch> {
  return Layer.succeed(
    GalaxyFetch,
    (async () => {
      throw error
    }) as unknown as GalaxyFetchService,
  )
}

/**
 * Creates a mock GalaxyFetch layer that fails with a specific HTTP status code.
 */
export function createHttpErrorLayer(
  statusCode: number,
  statusText: string,
): Layer.Layer<GalaxyFetch> {
  const error = Object.assign(new Error(`${statusCode} ${statusText}`), {
    statusCode,
  })
  return createFailureLayer(error)
}

/**
 * Creates a mock GalaxyFetch layer that tracks the last request URL.
 * Useful for verifying correct API calls.
 */
export function createUrlTrackingLayer<T>(
  response: T,
): Layer.Layer<GalaxyFetch> & { getLastUrl: () => string } {
  let lastUrl = ''

  const fetchMock = async (url: string, _options?: unknown) => {
    lastUrl = url
    return response
  }

  const layer = Layer.succeed(
    GalaxyFetch,
    fetchMock as unknown as GalaxyFetchService,
  )

  return Object.assign(layer, {
    getLastUrl: () => lastUrl,
  })
}

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Asserts that an Effect exits with a failure containing the expected error.
 * More idiomatic than Effect.runPromiseExit + manual Exit.isFailure check.
 */
export function expectFailure<E, A>(
  exit: Exit.Exit<A, E>,
  assertionFn: (error: E) => void,
): void {
  if (Exit.isSuccess(exit)) {
    throw new Error('Expected failure but got success')
  }
  if (exit.cause._tag === 'Fail') {
    assertionFn(exit.cause.error)
  }
  else if (exit.cause._tag === 'Die') {
    throw new Error(`Effect died with defect: ${exit.cause.defect}`)
  }
  else {
    throw new Error(`Unexpected cause: ${exit.cause._tag}`)
  }
}

/**
 * Asserts that an Effect exits with success containing the expected value.
 */
export function expectSuccess<E, A>(
  exit: Exit.Exit<A, E>,
  assertionFn: (value: A) => void,
): void {
  if (Exit.isFailure(exit)) {
    const error = Exit.match(exit, {
      onFailure: cause =>
        cause._tag === 'Fail'
          ? cause.error
          : new Error(`Unexpected cause: ${cause._tag}`),
      onSuccess: () => undefined,
    })
    throw new Error(`Expected success but got failure: ${error}`)
  }
  assertionFn(exit.value)
}

// ============================================================================
// Constants for Common Error Messages
// ============================================================================

export const ERROR_MESSAGES = {
  NETWORK_REFUSED: 'Network error: Connection refused',
  TIMEOUT: 'Request timeout after 5000ms',
  NOT_FOUND: '404 Not Found',
  FORBIDDEN: '403 Forbidden',
  SERVER_ERROR: '500 Internal Server Error',
} as const

export const HTTP_STATUS_CODES = {
  OK: 200,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  SERVER_ERROR: 500,
} as const
