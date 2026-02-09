/* eslint-disable no-console */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate as drizzleMigrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

/**
 * Get the absolute path to the bundled migration files.
 * Works both in development (src/) and production (dist/).
 */
export function getMigrationsFolder(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url))
  return resolve(currentDir, '..', 'db', 'migrations')
}

export interface MigrateOptions {
  /**
   * Custom name for the migrations tracking table.
   * @default '__drizzle_migrations'
   */
  migrationsTable?: string
  /**
   * Custom schema for the migrations tracking table (PostgreSQL only).
   * @default 'drizzle'
   */
  migrationsSchema?: string
}

/**
 * Run all pending database migrations bundled with nuxt-galaxy.
 *
 * Uses drizzle-orm's programmatic migrate() under the hood.
 * No drizzle-kit installation required.
 *
 * @param databaseUrl - PostgreSQL connection string
 * @param options - Optional migration configuration
 *
 * @example
 * ```ts
 * import { runMigrations } from 'nuxt-galaxy/migrate'
 *
 * await runMigrations('postgres://user:pass@localhost:5432/mydb')
 * ```
 */
export async function runMigrations(
  databaseUrl: string,
  options?: MigrateOptions,
): Promise<void> {
  const migrationsFolder = getMigrationsFolder()

  // Use max: 1 connection for migrations as recommended by drizzle
  const client = postgres(databaseUrl, { max: 1 })
  const db = drizzle({ client })

  try {
    await drizzleMigrate(db, {
      migrationsFolder,
      ...(options?.migrationsTable && { migrationsTable: options.migrationsTable }),
      ...(options?.migrationsSchema && { migrationsSchema: options.migrationsSchema }),
    })
    console.log('✅ nuxt-galaxy: Database migrations applied successfully')
  }
  finally {
    await client.end()
  }
}
