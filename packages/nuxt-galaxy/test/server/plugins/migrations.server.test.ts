import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockRequestLogger } from '../setup'

const mockRunMigrations = vi.hoisted(() => vi.fn())
const mockUseRuntimeConfig = vi.hoisted(() => vi.fn())
const mockCreateRequestLogger = vi.hoisted(() => vi.fn(() => createMockRequestLogger()))

vi.mock('nitropack/runtime', () => ({
  defineNitroPlugin: vi.fn(fn => fn),
}))

vi.mock('#imports', () => ({
  useRuntimeConfig: mockUseRuntimeConfig,
}))

vi.mock('../../../src/runtime/server/lib/migrate', () => ({
  runMigrations: mockRunMigrations,
}))

vi.mock('evlog', () => ({
  createRequestLogger: mockCreateRequestLogger,
}))

const plugin = (await import('../../../src/runtime/server/plugins/migrations.server')).default

describe('migrations.server plugin', () => {
  beforeEach(() => {
    mockUseRuntimeConfig.mockClear().mockReturnValue({
      galaxy: {
        drizzle: {
          databaseUrl: 'postgres://localhost/db',
        },
      },
    })
    mockRunMigrations.mockClear().mockResolvedValue(undefined)
    mockCreateRequestLogger.mockClear().mockReturnValue(createMockRequestLogger())
  })

  it('creates a request logger for the migration operation', async () => {
    const log = createMockRequestLogger()
    mockCreateRequestLogger.mockReturnValue(log)

    await plugin()
    expect(mockCreateRequestLogger).toHaveBeenCalledWith(expect.objectContaining({ requestId: expect.any(String) }))
    expect(log.set).toHaveBeenCalledWith({ operation: 'migrations' })
  })

  it('logs startup, success, and emits status 200 when migrations complete', async () => {
    const log = createMockRequestLogger()
    mockCreateRequestLogger.mockReturnValue(log)

    await plugin()

    expect(log.info).toHaveBeenCalledWith('Running database migrations on startup')
    expect(log.info).toHaveBeenCalledWith('Database migrations applied successfully')
    expect(log.emit).toHaveBeenCalledWith({ status: 200 })
  })

  it('logs a warning and emits without status when database URL is missing', async () => {
    mockUseRuntimeConfig.mockReturnValue({ galaxy: { drizzle: { databaseUrl: undefined } } })
    const log = createMockRequestLogger()
    mockCreateRequestLogger.mockReturnValue(log)

    await plugin()

    expect(mockRunMigrations).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalledWith(
      'Cannot run migrations — GALAXY_DRIZZLE_DATABASE_URL is not configured',
    )
    expect(log.emit).toHaveBeenCalledWith()
  })

  it('logs an error and emits status 500 when migrations fail', async () => {
    mockRunMigrations.mockRejectedValue(new Error('connection refused'))
    const log = createMockRequestLogger()
    mockCreateRequestLogger.mockReturnValue(log)

    await plugin()

    expect(log.error).toHaveBeenCalledWith(
      'Migration failed on startup',
      expect.objectContaining({ error: 'connection refused' }),
    )
    expect(log.emit).toHaveBeenCalledWith({ status: 500 })
  })
})
