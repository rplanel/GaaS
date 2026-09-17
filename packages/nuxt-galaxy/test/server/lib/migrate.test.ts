import { describe, expect, it, vi } from 'vitest'

const mockLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}))

vi.mock('evlog', () => ({
  log: mockLog,
  getEnvironment: vi.fn(() => ({ service: 'nuxt-galaxy' })),
}))

vi.mock('postgres', () => ({
  default: vi.fn(() => ({
    end: vi.fn(),
  })),
}))

vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: vi.fn(() => ({})),
}))

vi.mock('drizzle-orm/postgres-js/migrator', () => ({
  migrate: vi.fn(),
}))

const { runMigrations } = await import('../../../src/runtime/server/lib/migrate')

describe('runMigrations', () => {
  it('logs migration success via evlog', async () => {
    mockLog.info.mockClear()

    await runMigrations('postgres://localhost/db')

    expect(mockLog.info).toHaveBeenCalledWith(
      'migrations',
      'Database migrations applied successfully',
    )
  })
})
