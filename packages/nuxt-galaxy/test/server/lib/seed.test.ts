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
  drizzle: vi.fn(() => ({
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => [{ id: 1, name: 'test-instance' }]),
      })),
    })),
  })),
}))

const { runSeed } = await import('../../../src/runtime/server/lib/seed')

describe('runSeed', () => {
  it('logs seeding progress via evlog', async () => {
    mockLog.info.mockClear()

    const config: Parameters<typeof runSeed>[0] = {
      instances: [{ url: 'https://galaxy.example.com', name: 'test' }],
      users: [{ email: 'user@example.com', instanceUrl: 'https://galaxy.example.com' }],
      rolePermissions: [{ roleName: 'admin', permissions: ['workflows.select', 'workflows.insert'] }],
    }

    await runSeed(config, 'postgres://localhost/db')

    expect(mockLog.info).toHaveBeenCalledWith('seed', 'Seeding database')
    expect(mockLog.info).toHaveBeenCalledWith({ message: 'Seeding instances', operation: 'seed', count: 1 })
    expect(mockLog.info).toHaveBeenCalledWith({ message: 'Seeding users', operation: 'seed', count: 1 })
    expect(mockLog.info).toHaveBeenCalledWith('seed', 'Seeding role permissions')
    expect(mockLog.info).toHaveBeenCalledWith({ message: 'Seeded role permissions', operation: 'seed', role: 'admin', count: 2 })
    expect(mockLog.info).toHaveBeenCalledWith('seed', 'Seeding completed successfully')
  })
})
