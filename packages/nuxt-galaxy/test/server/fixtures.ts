import type { GalaxyDataset, GalaxyHistoryDetailed, GalaxyInvocation, GalaxyVersion, GalaxyWorkflow, GalaxyWorkflowExport, ShowFullJobResponse } from 'blendtype'
import type { Context } from 'effect'
import type { EventHandlerRequest, H3Event } from 'h3'
import { GalaxyFetch } from 'blendtype'
import { Effect, Exit, Layer } from 'effect'
import { vi } from 'vitest'
import { Drizzle } from '../../src/runtime/server/utils/drizzle'
import { ServerSupabaseClaims, ServerSupabaseClient } from '../../src/runtime/server/utils/grizzle/supabase'

// ============================================================================
// Galaxy Mock Data (reusable across all tests)
// ============================================================================

export const mockGalaxyVersion: GalaxyVersion = {
  version_major: '23',
  version_minor: '1',
}

export const mockGalaxyHistory: GalaxyHistoryDetailed = {
  model_class: 'History',
  id: 'galaxy-history-1',
  name: 'Test History',
  deleted: false,
  purged: false,
  published: false,
  annotation: '',
  tags: [],
  contents_url: '/api/histories/galaxy-history-1/contents',
  size: 0,
  user_id: 'galaxy-user-1',
  create_time: '2024-01-01T00:00:00.000Z',
  update_time: '2024-01-01T00:00:00.000Z',
  importable: false,
  slug: null,
  username_and_slug: null,
  genome_build: null,
  state: 'ok',
  state_ids: {
    new: [],
    upload: [],
    queued: [],
    running: [],
    ok: [],
    empty: [],
    error: [],
    paused: [],
    setting_metadata: [],
    failed_metadata: [],
    deferred: [],
    discarded: [],
  },
  state_details: {
    new: 0,
    upload: 0,
    queued: 0,
    running: 0,
    ok: 0,
    empty: 0,
    error: 0,
    paused: 0,
    setting_metadata: 0,
    failed_metadata: 0,
    deferred: 0,
    discarded: 0,
  },
  hid_counter: 1,
  empty: true,
}

export const mockGalaxyWorkflow: GalaxyWorkflow = {
  model_class: 'StoredWorkflow',
  id: 'galaxy-workflow-1',
  name: 'Test Workflow',
  create_time: new Date('2024-01-01'),
  update_time: new Date('2024-01-01'),
  published: false,
  importable: false,
  deleted: false,
  hidden: false,
  tags: ['name:test-workflow', 'version:1.0'],
  latest_workflow_uuid: 'uuid-123',
  url: '/api/workflows/galaxy-workflow-1',
  owner: 'test-owner',
  inputs: {},
  annotation: null,
  license: null,
  creator: null,
  source_metadata: null,
  steps: {},
  version: 1,
}

export const mockGalaxyWorkflowExport: GalaxyWorkflowExport = {
  'a_]galaxy_id': 'galaxy-workflow-1',
  'name': 'Test Workflow',
  'annotation': '',
  'format-version': '0.1',
  'creator': [],
  'license': '',
  'release': '',
  'tags': ['name:test-workflow', 'version:1.0'],
  'uuid': 'uuid-123',
  'steps': {},
  'version': 1,
}

export const mockGalaxyDataset: GalaxyDataset = {
  dataset_id: 'galaxy-dataset-1',
  type: 'txt',
  extension: 'txt',
  purged: false,
  deleted: false,
  name: 'Test Dataset',
  file_size: 1024,
  tags: ['tag1', 'tag2'],
  resubmitted: false,
  create_time: '2024-01-01T00:00:00.000Z',
  state: 'ok',
  creating_job: 'galaxy-job-1',
  visible: true,
  history_id: 'galaxy-history-1',
  accessible: true,
  uuid: 'dataset-uuid-1',
  metadata_comment_lines: 0,
  metadata_data_lines: 100,
  misc_blurb: '100 lines',
  peek: 'first line of data',
}

export const mockGalaxyInvocation: GalaxyInvocation = {
  model_class: 'WorkflowInvocation',
  id: 'galaxy-invocation-1',
  state: 'scheduled',
  update_time: '2024-01-01T00:00:00.000Z',
  create_time: '2024-01-01T00:00:00.000Z',
  workflow_id: 'galaxy-workflow-1',
  history_id: 'galaxy-history-1',
  uuid: 'invocation-uuid-1',
  steps: [],
}

export const mockGalaxyJob: ShowFullJobResponse = {
  model_class: 'Job',
  id: 'galaxy-job-1',
  state: 'ok',
  create_time: '2024-01-01T00:00:00.000Z',
  update_time: '2024-01-01T00:00:00.000Z',
  tool_id: 'test-tool-id',
  exit_code: 0,
  stderr: '',
  stdout: 'Job completed',
  params: {} as Record<string, never>,
}

// ============================================================================
// Database Mock Data (matches Drizzle schema shapes)
// ============================================================================

export const mockDbUser = {
  user: {
    id: 1,
    email: 'admin@example.org',
    instanceId: 1,
    createdAt: new Date('2024-01-01'),
  },
  instance: {
    id: 1,
    url: 'https://galaxy.example.com',
    name: 'Test Galaxy',
    createdAt: new Date('2024-01-01'),
  },
}

export const mockDbHistory = {
  id: 1,
  name: 'Test History',
  galaxyId: 'galaxy-history-1',
  ownerId: 'owner-uuid-1',
  userId: 1,
  state: 'new' as const,
  isSync: false,
  createdAt: new Date('2024-01-01'),
}

export const mockDbWorkflow = {
  id: 1,
  name: 'Test Workflow',
  galaxyId: 'galaxy-workflow-1',
  userId: 1,
  versionKey: '1.0',
  nameKey: 'test-workflow',
  autoVersion: 1,
  definition: {},
  createdAt: new Date('2024-01-01'),
}

export const mockDbAnalysis = {
  id: 1,
  name: 'Test Analysis',
  historyId: 1,
  workflowId: 1,
  state: 'scheduled' as const,
  galaxyId: 'galaxy-invocation-1',
  ownerId: 'owner-uuid-1',
  isSync: false,
  parameters: {},
  datamap: {},
  invocation: mockGalaxyInvocation as unknown,
  createdAt: new Date('2024-01-01'),
}

export const mockDbDataset = {
  id: 1,
  datasetName: 'Test Dataset',
  galaxyId: 'galaxy-dataset-1',
  ownerId: 'owner-uuid-1',
  storageObjectId: 'storage-object-1',
  storagePath: 'path/to/file.txt',
  historyId: 1,
  uuid: 'dataset-uuid-1',
  createdAt: new Date('2024-01-01'),
  galaxyMetadata: {
    extension: 'txt',
    data_lines: 100,
    misc_blurb: '100 lines',
    peek: 'first line',
  },
}

export const mockDbJob = {
  id: 1,
  galaxyId: 'galaxy-job-1',
  stepId: 0,
  state: 'ok' as const,
  toolId: 'test-tool-id',
  ownerId: 'owner-uuid-1',
  analysisId: 1,
  stderr: '',
  stdout: 'Job completed',
  exitCode: 0,
  createdAt: new Date('2024-01-01'),
}

export const mockDbTag = {
  id: 1,
  label: 'tag1',
}

export const mockDbAnalysisInput = {
  id: 1,
  analysisId: 1,
  datasetId: 1,
  state: 'ok' as const,
}

export const mockDbAnalysisOutput = {
  id: 1,
  analysisId: 1,
  datasetId: 1,
  jobId: 1,
  state: 'ok' as const,
}

export const mockSupabaseUser = {
  id: 'owner-uuid-1',
  email: 'user@example.com',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  created_at: '2024-01-01T00:00:00.000Z',
}

// ============================================================================
// Mock Layer Factories
// ============================================================================

type GalaxyFetchService = Context.Tag.Service<typeof GalaxyFetch>

/**
 * Creates a mock GalaxyFetch layer that returns a configured response.
 * Supports providing different responses per URL pattern.
 */
export function createMockGalaxyLayer<T>(response: T): Layer.Layer<typeof GalaxyFetch> {
  return Layer.effect(
    GalaxyFetch,
    Effect.sync(() =>
      (async () => response) as unknown as GalaxyFetchService,
    ),
  )
}

/**
 * Creates a GalaxyFetch layer with URL-based routing for different responses.
 */
export function createRoutedGalaxyLayer(
  routes: Record<string, unknown>,
): Layer.Layer<typeof GalaxyFetch> {
  return Layer.effect(
    GalaxyFetch,
    Effect.sync(() =>
      (async (url: string) => {
        for (const [pattern, response] of Object.entries(routes)) {
          if (url.includes(pattern))
            return response
        }
        throw new Error(`No mock route for URL: ${url}`)
      }) as unknown as GalaxyFetchService,
    ),
  )
}

/**
 * Creates a GalaxyFetch layer that always throws.
 */
export function createFailingGalaxyLayer(error: Error): Layer.Layer<typeof GalaxyFetch> {
  return Layer.succeed(
    GalaxyFetch,
    (async () => { throw error }) as unknown as GalaxyFetchService,
  )
}

// ============================================================================
// Drizzle Mock Utilities
// ============================================================================

/**
 * Creates a mock Drizzle query builder chain.
 * Each method returns `this` for chaining, and terminal methods return the configured result.
 */
export function createMockDrizzleResult(result: unknown) {
  const chainable: Record<string, unknown> = {}
  const chainMethods = [
    'select',
    'from',
    'where',
    'innerJoin',
    'leftJoin',
    'insert',
    'values',
    'returning',
    'onConflictDoUpdate',
    'onConflictDoNothing',
    'update',
    'set',
    'delete',
    'limit',
    'orderBy',
    'groupBy',
  ]

  for (const method of chainMethods) {
    chainable[method] = vi.fn(() => chainable)
  }

  // Terminal method: .then() resolves with the mock result
  chainable.then = vi.fn((resolve: (v: unknown) => unknown) => Promise.resolve(resolve(result)))

  return chainable
}

/**
 * Creates a mock Drizzle instance that returns configurable results.
 * Use `setResult()` to change the returned data between test cases.
 */
export function createMockDrizzle() {
  let currentResult: unknown = []

  const mock = {
    select: vi.fn(() => createMockDrizzleResult(currentResult)),
    insert: vi.fn(() => createMockDrizzleResult(currentResult)),
    update: vi.fn(() => createMockDrizzleResult(currentResult)),
    delete: vi.fn(() => createMockDrizzleResult(currentResult)),
  }

  return {
    mock,
    setResult: (result: unknown) => { currentResult = result },
    layer: Layer.succeed(Drizzle, mock as any),
  }
}

// ============================================================================
// Supabase Mock Utilities
// ============================================================================

/**
 * Creates a mock Supabase client with chainable query builder.
 */
export function createMockSupabaseClient(overrides?: {
  authUser?: { user: typeof mockSupabaseUser } | null
  authError?: { message: string, code: string } | null
  queryResult?: { data: unknown, error: unknown }
  storageResult?: { data: unknown, error: unknown }
}) {
  const defaults = {
    authUser: { user: mockSupabaseUser },
    authError: null,
    queryResult: { data: [], error: null },
    storageResult: { data: { id: 'storage-id', path: 'path/to/file' }, error: null },
  }
  const opts = { ...defaults, ...overrides }

  const queryChain: Record<string, unknown> = {}
  const queryMethods = ['from', 'select', 'insert', 'update', 'delete', 'eq', 'where', 'single', 'maybeSingle']
  for (const method of queryMethods) {
    queryChain[method] = vi.fn(() => queryChain)
  }
  queryChain.then = vi.fn((resolve: (v: unknown) => unknown) =>
    Promise.resolve(resolve(opts.queryResult)),
  )

  const storageChain: Record<string, unknown> = {}
  const storageMethods = ['upload', 'createSignedUrl', 'download', 'remove']
  for (const method of storageMethods) {
    storageChain[method] = vi.fn(() =>
      Promise.resolve(opts.storageResult),
    )
  }

  return {
    schema: vi.fn(() => queryChain),
    from: vi.fn(() => queryChain),
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({
          data: opts.authUser,
          error: opts.authError,
        }),
      ),
    },
    storage: {
      from: vi.fn(() => storageChain),
    },
  }
}

/**
 * Creates a mock ServerSupabaseClient layer.
 */
export function createMockServerSupabaseClientLayer(clientOverrides?: Parameters<typeof createMockSupabaseClient>[0]) {
  const mockClient = createMockSupabaseClient(clientOverrides)
  return {
    mockClient,
    layer: Layer.succeed(
      ServerSupabaseClient,
      (_event: H3Event<EventHandlerRequest>) => Effect.succeed(mockClient as any),
    ),
  }
}

/**
 * Creates a mock ServerSupabaseClaims layer.
 */
export function createMockServerSupabaseClaimsLayer(user: typeof mockSupabaseUser | null = mockSupabaseUser) {
  return Layer.succeed(
    ServerSupabaseClaims,
    (_event: H3Event<EventHandlerRequest>) => Effect.succeed(user as any),
  )
}

// ============================================================================
// H3 Event Mock
// ============================================================================

/**
 * Creates a minimal mock H3 event for testing server handlers.
 */
export function createMockEvent(overrides?: {
  params?: Record<string, string>
  body?: unknown
  method?: string
}): H3Event<EventHandlerRequest> {
  return {
    node: {
      req: { method: overrides?.method || 'GET', url: '/test', headers: {} },
      res: { statusCode: 200, setHeader: vi.fn(), end: vi.fn() },
    },
    context: {
      params: overrides?.params || {},
    },
    _body: overrides?.body,
  } as unknown as H3Event<EventHandlerRequest>
}

// ============================================================================
// Effect Test Utilities
// ============================================================================

/**
 * Asserts that an Effect exits with a failure.
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
 * Asserts that an Effect exits with success.
 */
export function expectSuccess<E, A>(
  exit: Exit.Exit<A, E>,
  assertionFn: (value: A) => void,
): void {
  if (Exit.isFailure(exit)) {
    throw new Error(`Expected success but got failure: ${JSON.stringify(exit.cause)}`)
  }
  assertionFn(exit.value)
}
