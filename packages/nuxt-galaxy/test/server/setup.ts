import { vi } from 'vitest'

// Mock #imports (Nuxt auto-imports used by server code)
vi.mock('#imports', () => ({
  useRuntimeConfig: vi.fn(() => ({
    public: {
      galaxy: { url: 'https://galaxy.example.com' },
      supabaseUrl: 'http://localhost:54321',
    },
    galaxy: {
      apiKey: 'test-api-key',
      email: 'admin@example.org',
      drizzle: {
        databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
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
}))

// Mock #supabase/server (Nuxt Supabase module auto-imports)
vi.mock('#supabase/server', () => ({
  serverSupabaseClient: vi.fn(),
  serverSupabaseUser: vi.fn(),
}))
