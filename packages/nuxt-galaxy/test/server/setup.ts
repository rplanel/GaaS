import { vi } from 'vitest'

export function createMockRequestLogger() {
  return {
    set: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    emit: vi.fn(() => null),
    getContext: vi.fn(() => ({})),
  }
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
      sync: {
        lockTtlSeconds: 900,
        batchSize: 20,
        maxRetries: 3,
        retryBaseDelayMs: 200,
        retryMaxDelayMs: 2000,
      },
    },
  })),
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
