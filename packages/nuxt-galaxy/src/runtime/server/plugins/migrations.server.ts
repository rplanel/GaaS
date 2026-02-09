import { useRuntimeConfig } from '#imports'
import { defineNitroPlugin } from 'nitropack/runtime'
import { runMigrations } from '../lib/migrate'

/**
 * Nitro server plugin that automatically runs database migrations on startup.
 * Only added when `galaxy.runMigrations` is enabled in the module options.
 */
export default defineNitroPlugin(async () => {
  const { galaxy } = useRuntimeConfig()
  const databaseUrl = galaxy?.drizzle?.databaseUrl

  if (!databaseUrl) {
    console.warn('⚠️ nuxt-galaxy: Cannot run migrations — GALAXY_DRIZZLE_DATABASE_URL is not configured')
    return
  }

  try {
    // eslint-disable-next-line no-console
    console.log('🔄 nuxt-galaxy: Running database migrations on startup...')
    await runMigrations(databaseUrl)
  }
  catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`❌ nuxt-galaxy: Migration failed on startup: ${message}`)
    // Don't throw — let the server start even if migrations fail.
    // The app can handle the missing schema gracefully.
  }
})
