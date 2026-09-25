import type { AuditableLogger } from 'evlog'
import { vi } from 'vitest'

/**
 * Stand-in for the request logger handed to server handlers.
 *
 * `debug` is deliberately not part of `RequestLogger`; it is here only so tests
 * can assert the request logger is *not* used for debug output.
 */
export function createMockRequestLogger() {
  const audit = Object.assign(vi.fn(), { deny: vi.fn() })
  const logger = {
    set: vi.fn(),
    setLevel: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    emit: vi.fn(() => null),
    getContext: vi.fn(() => ({})),
    audit,
  }
  // Pin the double to the real interface here, so a new required member on
  // `RequestLogger` is one error at the fixture rather than one per call site.
  return logger satisfies AuditableLogger<object>
}

vi.mock('evlog', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  createRequestLogger: vi.fn(() => createMockRequestLogger()),
  useLogger: vi.fn(() => createMockRequestLogger()),
}))

/**
 * The Nitro storage mounts the mocked `useStorage` hands out, one per mount
 * name and shared for the life of the test file, since a cache that forgot
 * between two reads would pass every test about caching.
 *
 * `resetMockStorages()` empties them; a test file that cares calls it in a
 * `beforeEach`.
 */
const mockStorages = new Map<string, Map<string, unknown>>()

export function resetMockStorages(): void {
  mockStorages.clear()
}

/** A stand-in for one mount, with the two methods the Galaxy cache uses. */
function mockStorage(mount: string) {
  let items = mockStorages.get(mount)
  if (!items) {
    items = new Map<string, unknown>()
    mockStorages.set(mount, items)
  }
  const store = items
  return {
    getItem: vi.fn(async (key: string) => store.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value)
    }),
    removeItem: vi.fn(async (key: string) => {
      store.delete(key)
    }),
    getKeys: vi.fn(async () => [...store.keys()]),
  }
}

// Mock #imports (Nuxt auto-imports used by server code)
vi.mock('#imports', () => ({
  useRuntimeConfig: vi.fn(() => ({
    public: {
      galaxy: { url: 'https://galaxy.example.com' },
      supabaseUrl: 'https://remote.supabase.co',
    },
    galaxy: {
      apiKey: 'test-api-key',
      email: 'admin@example.org',
      drizzle: {
        databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      },
      cache: {
        enabled: true,
      },
      sync: {
        lockTtlSeconds: 900,
        batchSize: 20,
        maxRetries: 3,
        retryBaseDelayMs: 200,
        retryMaxDelayMs: 2000,
      },
    },
  })),
  useStorage: vi.fn((mount: string) => mockStorage(mount)),
  createError: vi.fn((opts: string | { statusCode?: number, statusMessage?: string }) => {
    if (typeof opts === 'string')
      return new Error(opts)
    return Object.assign(new Error(opts.statusMessage || 'Error'), {
      statusCode: opts.statusCode,
      statusMessage: opts.statusMessage,
    })
  }),
  useLogger: vi.fn(() => createMockRequestLogger()),
}))

// Mock #supabase/server (Nuxt Supabase module auto-imports)
vi.mock('#supabase/server', () => ({
  serverSupabaseClient: vi.fn(),
  serverSupabaseUser: vi.fn(),
}))
