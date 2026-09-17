import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { getEnvironment, initLogger, log } from 'evlog'
import postgres from 'postgres'
import { z } from 'zod'
import { RolePermissions, RoleTypes } from '../../types/nuxt-galaxy'
import { relations } from '../db/relations'
import { instances } from '../db/schema/galaxy/instances'
import { users } from '../db/schema/galaxy/users'
import { rolePermissions } from '../db/schema/galaxyRbac/rolePermissions'
import { roles } from '../db/schema/galaxyRbac/roles'

if (getEnvironment().service === 'app') {
  initLogger({ env: { service: 'nuxt-galaxy' } })
}

/**
 * Zod schema for seed configuration
 */
export const seedConfigSchema = z.object({
  instances: z.array(
    z.object({
      url: z.string().url('Instance URL must be a valid URL'),
      name: z.string().min(1, 'Instance name is required'),
    }),
  ).min(1, 'At least one instance is required'),

  users: z.array(
    z.object({
      email: z.string().email('Invalid email format'),
      instanceUrl: z.string().url('Instance URL must be a valid URL'),
    }),
  ).optional().default([]),

  rolePermissions: z.array(
    z.object({
      roleName: z.enum(RoleTypes, { message: `Role must be one of: ${RoleTypes.join(', ')}` }),
      permissions: z.array(
        z.enum(RolePermissions, { message: `Invalid permission` }),
      ).min(1, 'At least one permission is required'),
    }),
  ).optional().default([]),
})

export type SeedConfig = z.infer<typeof seedConfigSchema>

/**
 * Exit codes for CLI
 */
export const ExitCodes = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  VALIDATION_ERROR: 2,
  CONFIG_ERROR: 3,
  DATABASE_ERROR: 4,
  REFERENCE_ERROR: 5,
} as const

/**
 * Validate seed configuration
 * @throws {z.ZodError} if validation fails
 */
export function validateSeedConfig(config: unknown): SeedConfig {
  return seedConfigSchema.parse(config)
}

/**
 * Seed the database with instance, user, and role permission data
 * @param config - Seed configuration object
 * @param databaseUrl - PostgreSQL connection string
 */
export async function runSeed(config: SeedConfig, databaseUrl: string): Promise<void> {
  log.info('seed', 'Seeding database')

  const client = postgres(databaseUrl)
  const db = drizzle({ client, relations })

  try {
    // Insert instances (idempotent via unique constraint on url)
    log.info({ message: 'Seeding instances', operation: 'seed', count: config.instances.length })
    for (const instance of config.instances) {
      await db.insert(instances)
        .values({
          url: instance.url,
          name: instance.name,
        })
        .onConflictDoNothing()
      log.info({ message: 'Seeded instance', operation: 'seed', name: instance.name, url: instance.url })
    }

    // Insert users (linked to instances by URL lookup)
    if (config.users.length > 0) {
      log.info({ message: 'Seeding users', operation: 'seed', count: config.users.length })
      for (const user of config.users) {
        const [instance] = await db.select()
          .from(instances)
          .where(eq(instances.url, user.instanceUrl))

        if (!instance) {
          throw new Error(`Instance not found: ${user.instanceUrl}`)
        }

        await db.insert(users)
          .values({
            email: user.email,
            instanceId: instance.id,
          })
          .onConflictDoNothing()

        log.info({ message: 'Seeded user', operation: 'seed', email: user.email, instance: instance.name })
      }
    }

    // Insert role permissions (linked to roles by name lookup)
    if (config.rolePermissions.length > 0) {
      log.info('seed', 'Seeding role permissions')
      for (const rp of config.rolePermissions) {
        const [role] = await db.select()
          .from(roles)
          .where(eq(roles.name, rp.roleName))

        if (!role) {
          throw new Error(`Role not found: ${rp.roleName}`)
        }

        const permissionsToInsert = rp.permissions.map(p => ({
          roleId: role.id,
          permission: p,
        }))

        await db.insert(rolePermissions)
          .values(permissionsToInsert)
          .onConflictDoNothing()

        log.info({ message: 'Seeded role permissions', operation: 'seed', role: rp.roleName, count: rp.permissions.length })
      }
    }

    log.info('seed', 'Seeding completed successfully')
  }
  catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        throw new ReferenceError(error.message)
      }
    }
    throw error
  }
  finally {
    await client.end()
  }
}
