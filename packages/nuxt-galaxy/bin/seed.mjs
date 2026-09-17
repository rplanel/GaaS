#!/usr/bin/env node

/**
 * CLI to seed nuxt-galaxy database.
 *
 * Usage:
 *   npx nuxt-galaxy-seed seed.config.json
 *   npx nuxt-galaxy-seed seed.config.json --dry-run
 *
 * Environment variables:
 *   GALAXY_DRIZZLE_DATABASE_URL - PostgreSQL connection string
 *
 * The CLI automatically loads variables from a .env file in the current directory.
 * Use --env-file to specify a custom path.
 *
 * Exit codes:
 *   0 - Success
 *   1 - General error
 *   2 - Validation error (Zod)
 *   3 - Config error (JSON parse, file not found)
 *   4 - Database error (connection, query)
 *   5 - Reference error (instance/role not found)
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import dotenvx from '@dotenvx/dotenvx'
import { defineCommand, runMain } from 'citty'
import { getEnvironment, initLogger, log } from 'evlog'
import { z } from 'zod'
import { ExitCodes, runSeed, validateSeedConfig } from '../dist/runtime/server/lib/seed.js'

if (getEnvironment().service === 'app') {
  initLogger({ env: { service: 'nuxt-galaxy' } })
}

const main = defineCommand({
  meta: {
    name: 'nuxt-galaxy-seed',
    version: '1.0.0',
    description: 'Seed Galaxy database with instance, user, and role permission data',
  },
  args: {
    configFile: {
      type: 'positional',
      description: 'Path to seed config JSON file',
      required: true,
    },
    envFile: {
      type: 'string',
      description: 'Path to .env file (default: .env)',
    },
    databaseUrl: {
      type: 'string',
      description: 'PostgreSQL connection string (overrides env var)',
    },
    dryRun: {
      type: 'boolean',
      description: 'Validate config without applying to database',
      alias: 'd',
    },
  },
  async run({ args }) {
    // Load environment variables from .env file using dotenvx
    const envFilePath = args.envFile
      ? resolve(args.envFile)
      : resolve(process.cwd(), '.env')

    try {
      dotenvx.config({ path: envFilePath, quiet: true })
      if (!args.dryRun) {
        log.info({ message: 'Loaded env file', path: envFilePath })
      }
    }
    catch (err) {
      if (args.envFile) {
        log.warn({ message: 'Failed to load env file', path: envFilePath, error: err.message })
      }
    }

    // Read and parse config file
    const configPath = resolve(args.configFile)
    if (!existsSync(configPath)) {
      log.error({ message: 'Config file not found', operation: 'seed', path: configPath })
      process.exit(ExitCodes.CONFIG_ERROR)
    }

    let config
    try {
      const fileContent = readFileSync(configPath, 'utf-8')
      config = JSON.parse(fileContent)
    }
    catch (err) {
      log.error({ message: 'Failed to parse config file', operation: 'seed', path: configPath, error: err.message })
      process.exit(ExitCodes.CONFIG_ERROR)
    }

    // Validate config with Zod
    let validatedConfig
    try {
      validatedConfig = validateSeedConfig(config)
      if (!args.dryRun) {
        log.info('seed', 'Config validation passed')
      }
    }
    catch (err) {
      if (err instanceof z.ZodError) {
        log.error('Validation error')
        const issues = err.issues || err.errors || []
        issues.forEach((e) => {
          const path = e.path && e.path.length > 0 ? e.path.join('.') : 'root'
          log.error({ message: 'Config validation issue', operation: 'seed', path, issue: e.message })
        })
        process.exit(ExitCodes.VALIDATION_ERROR)
      }
      throw err
    }

    // Dry run mode
    if (args.dryRun) {
      log.info({
        message: 'Dry run: Config is valid',
        operation: 'seed',
        instances: validatedConfig.instances.length,
        users: validatedConfig.users.length,
        rolePermissions: validatedConfig.rolePermissions.length,
      })
      process.exit(ExitCodes.SUCCESS)
    }

    // Get database URL
    const databaseUrl = args.databaseUrl || process.env.GALAXY_DRIZZLE_DATABASE_URL

    if (!databaseUrl) {
      log.error('seed', 'Database URL is required')
      log.error('seed', 'Set GALAXY_DRIZZLE_DATABASE_URL environment variable or pass --database-url:')
      log.error('seed', '  npx nuxt-galaxy-seed seed.config.json --database-url postgres://user:pass@host:port/db')
      log.error('seed', 'Run with --help for more options.')
      process.exit(ExitCodes.DATABASE_ERROR)
    }

    // Run seeding
    try {
      await runSeed(validatedConfig, databaseUrl)
      process.exit(ExitCodes.SUCCESS)
    }
    catch (err) {
      if (err instanceof ReferenceError) {
        log.error({ message: 'Reference error', operation: 'seed', error: err.message })
        process.exit(ExitCodes.REFERENCE_ERROR)
      }
      if (err instanceof z.ZodError) {
        log.error({ message: 'Validation error', operation: 'seed', error: err.message })
        process.exit(ExitCodes.VALIDATION_ERROR)
      }
      if ((err instanceof Error && err.message.includes('database')) || err.message.includes('connection')) {
        log.error({ message: 'Database error', operation: 'seed', error: err.message })
        process.exit(ExitCodes.DATABASE_ERROR)
      }
      log.error({ message: 'General error', operation: 'seed', error: err.message })
      process.exit(ExitCodes.GENERAL_ERROR)
    }
  },
})

runMain(main)
