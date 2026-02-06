import { sql } from 'drizzle-orm'
import { pgPolicy, serial, varchar } from 'drizzle-orm/pg-core'
import { authenticatedRole } from 'drizzle-orm/supabase'

import { galaxy } from '../galaxy'

/**
 * Instances
 */

export const instances = galaxy.table(
  'instances',
  {
    id: serial('id').primaryKey(),
    url: varchar('url', { length: 256 }).unique().notNull(),
    name: varchar('name', { length: 100 }).notNull(),
  },
  () => [
    pgPolicy('Users can query instances', {
      for: 'select',
      to: authenticatedRole,
      using: sql`true`,
    }),
    pgPolicy('Admin can insert instances', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`(SELECT galaxy_rbac.authorize('instances.insert')) = TRUE`,
    }),
  ],
)
