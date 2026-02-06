import { sql } from 'drizzle-orm'
import { integer, pgPolicy, serial, unique, varchar } from 'drizzle-orm/pg-core'
import { authenticatedRole } from 'drizzle-orm/supabase'
import { galaxy } from '../galaxy'
import { instances } from './instances'

/**
 * Users
 */

export const users = galaxy.table(
  'user',
  {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 100 }).notNull(),
    instanceId: integer('instance_id').notNull().references(() => instances.id, { onDelete: 'cascade' }),
  },
  t => [
    unique().on(t.email, t.instanceId),
    pgPolicy('Admin can view user', {
      for: 'select',
      to: authenticatedRole,
      using: sql`(SELECT galaxy_rbac.authorize('users.select')) = TRUE`,
    }),
  ],
)
