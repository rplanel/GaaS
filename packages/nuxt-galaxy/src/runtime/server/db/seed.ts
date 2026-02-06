/* eslint-disable no-console */
import { defineCommand, runMain } from 'citty'
import { eq } from 'drizzle-orm'
import { client, db } from './index'
import { instances } from './schema/galaxy/instances'
import { users } from './schema/galaxy/users'
import { rolePermissions } from './schema/galaxyRbac/rolePermissions'
import { roles } from './schema/galaxyRbac/roles'

interface SeedOptions {
  url: string
  name: string
  userEmail?: string
}

async function seed(options: SeedOptions) {
  console.log('🌱 Seeding database...')
  console.log(`   Galaxy Instance: ${options.name}`)
  console.log(`   URL: ${options.url}`)

  try {
    // Insert instances (idempotent)
    await db.insert(instances)
      .values({
        url: options.url,
        name: options.name,
      })
      .onConflictDoNothing()

    console.log('✅ Instances seeded')

    // Get the instance for user creation
    const [instance] = await db.select()
      .from(instances)
      .where(eq(instances.url, options.url))

    if (!instance) {
      throw new Error('Instance not found, cannot seed users')
    }

    // Insert galaxy users (idempotent via unique constraint on email+instanceId)
    if (options.userEmail) {
      await db.insert(users)
        .values({
          email: options.userEmail,
          instanceId: instance.id,
        })
        .onConflictDoNothing()

      console.log('✅ Users seeded')
    }

    // Get admin role for permissions
    const [adminRole] = await db.select()
      .from(roles)
      .where(eq(roles.name, 'admin'))

    if (!adminRole) {
      throw new Error('Admin role not found, cannot seed role permissions')
    }

    // Insert role permissions (idempotent)
    await db.insert(rolePermissions)
      .values([
        { roleId: adminRole.id, permission: 'workflows.insert' },
        { roleId: adminRole.id, permission: 'workflows.delete' },
        { roleId: adminRole.id, permission: 'instances.insert' },
        { roleId: adminRole.id, permission: 'instances.delete' },
        { roleId: adminRole.id, permission: 'users.delete' },
      ])
      .onConflictDoNothing()

    console.log('✅ Role permissions seeded')

    console.log('🎉 Seeding completed!')
  }
  catch (error) {
    console.error('❌ Seeding failed:', error)
    throw error
  }
}

const main = defineCommand({
  meta: {
    name: 'db-seed',
    version: '1.0.0',
    description: 'Seed the database with Galaxy instance data',
  },
  args: {
    url: {
      type: 'string',
      description: 'Galaxy instance URL',
      required: true,
      alias: 'u',
    },
    name: {
      type: 'string',
      description: 'Galaxy instance name',
      required: true,
      alias: 'n',
    },
    userEmail: {
      type: 'string',
      description: 'User email to seed (optional)',
      required: false,
      alias: 'e',
    },
  },
  async run({ args }) {
    try {
      await seed({
        url: args.url,
        name: args.name,
        userEmail: args.userEmail,
      })
    }
    finally {
      await client.end()
    }
  },
})

runMain(main)
