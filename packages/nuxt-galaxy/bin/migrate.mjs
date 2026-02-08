#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * CLI to run nuxt-galaxy database migrations.
 *
 * Usage:
 *   npx nuxt-galaxy-migrate
 *   npx nuxt-galaxy-migrate postgres://user:pass@host:port/db
 *
 * Environment variables:
 *   GALAXY_DRIZZLE_DATABASE_URL - PostgreSQL connection string
 */

import process from 'node:process'
import { getMigrationsFolder, runMigrations } from '../dist/runtime/server/lib/migrate.js'

const args = process.argv.slice(2)

// Handle --help
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
nuxt-galaxy-migrate - Run nuxt-galaxy database migrations

Usage:
  npx nuxt-galaxy-migrate [database-url]

Arguments:
  database-url    PostgreSQL connection string (optional if GALAXY_DRIZZLE_DATABASE_URL is set)

Options:
  --help, -h      Show this help message
  --table <name>  Custom migrations tracking table name (default: __drizzle_migrations)
  --schema <name> Custom migrations tracking schema name (default: drizzle)

Environment variables:
  GALAXY_DRIZZLE_DATABASE_URL   PostgreSQL connection string

Examples:
  GALAXY_DRIZZLE_DATABASE_URL=postgres://localhost:5432/mydb npx nuxt-galaxy-migrate
  npx nuxt-galaxy-migrate postgres://user:pass@localhost:5432/mydb
  npx nuxt-galaxy-migrate postgres://localhost/mydb --table my_migrations --schema public
`)
  process.exit(0)
}

// Parse options
const tableIdx = args.indexOf('--table')
const schemaIdx = args.indexOf('--schema')

const migrationsTable = tableIdx !== -1 ? args[tableIdx + 1] : undefined
const migrationsSchema = schemaIdx !== -1 ? args[schemaIdx + 1] : undefined

// Remove option flags and their values from args to find the database URL
const positionalArgs = args.filter((_, i) => {
  if (i === tableIdx || i === tableIdx + 1)
    return false
  if (i === schemaIdx || i === schemaIdx + 1)
    return false
  return true
})

const databaseUrl = positionalArgs[0] || process.env.GALAXY_DRIZZLE_DATABASE_URL

if (!databaseUrl) {
  console.error('❌ Error: Database URL is required.\n')
  console.error('Set GALAXY_DRIZZLE_DATABASE_URL environment variable or pass it as an argument:')
  console.error('  npx nuxt-galaxy-migrate postgres://user:pass@host:port/db\n')
  console.error('Run with --help for more options.')
  process.exit(1)
}

console.log(`📂 Migrations folder: ${getMigrationsFolder()}`)
console.log(`🔄 Running nuxt-galaxy database migrations...\n`)

runMigrations(databaseUrl, { migrationsTable, migrationsSchema })
  .then(() => {
    process.exit(0)
  })
  .catch((err) => {
    console.error('❌ Migration failed:', err.message || err)
    process.exit(1)
  })
