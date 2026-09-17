import { useRuntimeConfig } from '#imports'
import { createRequestLogger } from 'evlog'
import { defineNitroPlugin } from 'nitropack/runtime'
import { runMigrations } from '../lib/migrate'

/**
 * Nitro server plugin that automatically runs database migrations on startup.
 * Only added when `galaxy.runMigrations` is enabled in the module options.
 */
export default defineNitroPlugin(async () => {
  const { galaxy } = useRuntimeConfig()
  const databaseUrl = galaxy?.drizzle?.databaseUrl

  const log = createRequestLogger({ requestId: crypto.randomUUID() })
  log.set({ operation: 'migrations' })

  if (!databaseUrl) {
    log.warn('Cannot run migrations — GALAXY_DRIZZLE_DATABASE_URL is not configured')
    log.emit()
    return
  }

  try {
    log.info('Running database migrations on startup')
    await runMigrations(databaseUrl)
    log.info('Database migrations applied successfully')
    log.emit({ status: 200 })
  }
  catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    log.error('Migration failed on startup', { error: message })
    log.emit({ status: 500 })
    // Don't throw — let the server start even if migrations fail.
    // The app can handle the missing schema gracefully.
  }
})
