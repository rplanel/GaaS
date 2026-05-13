import { sql } from 'drizzle-orm'
import { pgPolicy, serial, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { authenticatedRole } from 'drizzle-orm/supabase'
import { users as owners } from '../auth/users'

import { galaxy } from '../galaxy'

/**
 * Maintenance Windows
 */
export const maintenanceWindows = galaxy.table(
  'maintenance_windows',
  {
    id: serial('id').primaryKey(),
    message: text('message').notNull(),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    createdBy: uuid('created_by').notNull().references(() => owners.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  () => [
    pgPolicy('Users can query maintenance windows', {
      for: 'select',
      to: authenticatedRole,
      using: sql`true`,
    }),
    pgPolicy('Users can insert maintenance windows', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`true`,
    }),
  ],
)
