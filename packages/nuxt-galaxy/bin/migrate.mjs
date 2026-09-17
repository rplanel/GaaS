#!/usr/bin/env node

/**
 * CLI to run nuxt-galaxy database migrations.
 *
 * Usage:
 *   npx nuxt-galaxy-migrate
 *   npx nuxt-galaxy-migrate postgres://user:pass@host:port/db
 *
 * Environment variables:
 *   GALAXY_DRIZZLE_DATABASE_URL - PostgreSQL connection string
 *
 * The CLI automatically loads variables from a .env file in the current directory.
 * Use --env-file to specify a custom path.
 */

import { resolve } from 'node:path'
import process from 'node:process'
import dotenvx from '@dotenvx/dotenvx'
import { defineCommand, runMain } from 'citty'
import { getEnvironment, initLogger, log } from 'evlog'
import { getMigrationsFolder, runMigrations } from '../dist/runtime/server/lib/migrate.js'

if (getEnvironment().service === 'app') {
  initLogger({ env: { service: 'nuxt-galaxy' } })
}

const main = defineCommand({
  meta: {
    name: 'nuxt-galaxy-migrate',
    description: 'Run nuxt-galaxy database migrations',
  },
  args: {
    databaseUrl: {
      type: 'positional',
      description: 'PostgreSQL connection string (optional if GALAXY_DRIZZLE_DATABASE_URL is set)',
      required: false,
    },
    envFile: {
      type: 'string',
      description: 'Path to .env file (default: .env in current directory)',
    },
    table: {
      type: 'string',
      description: 'Custom migrations tracking table name (default: __drizzle_migrations)',
    },
    schema: {
      type: 'string',
      description: 'Custom migrations tracking schema name (default: drizzle)',
    },
  },
  run({ args }) {
    // Load environment variables from .env file using dotenvx
    const envFilePath = args.envFile
      ? resolve(args.envFile)
      : resolve(process.cwd(), '.env')

    try {
      dotenvx.config({ path: envFilePath, quiet: true })
      log.info({ message: 'Loaded env file', path: envFilePath })
    }
    catch (err) {
      if (args.envFile) {
        log.warn({ message: 'Failed to load env file', path: envFilePath, error: err.message })
      }
    }

    const databaseUrl = args.databaseUrl || process.env.GALAXY_DRIZZLE_DATABASE_URL

    if (!databaseUrl) {
      log.error('migrate', 'Database URL is required')
      log.error('migrate', 'Set GALAXY_DRIZZLE_DATABASE_URL environment variable or pass it as an argument:')
      log.error('migrate', '  npx nuxt-galaxy-migrate postgres://user:pass@host:port/db')
      log.error('migrate', 'Run with --help for more options.')
      process.exit(1)
    }

    log.info({ message: 'Running database migrations', operation: 'migrate', migrationsFolder: getMigrationsFolder() })

    return runMigrations(databaseUrl, {
      migrationsTable: args.table,
      migrationsSchema: args.schema,
    })
  },
})

runMain(main)
