import { sql } from 'drizzle-orm'
import { integer, pgPolicy, serial, timestamp } from 'drizzle-orm/pg-core'
import { authenticatedRole } from 'drizzle-orm/supabase'
import { galaxy } from '../galaxy'
import { analyses } from './analyses'

export const syncLocks = galaxy.table(
  'sync_locks',
  {
    id: serial('id').primaryKey(),
    analysisId: integer('analysis_id')
      .notNull()
      .unique()
      .references(() => analyses.id, { onDelete: 'cascade' }),
    lockedAt: timestamp('locked_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  () => [
    // This table is managed by the service-role scheduled task (galaxy:sync-analyses).
    // The permissive policy is intentional: sync locks are an internal operational
    // concern, not user data, and are only touched by server-side service-role code.
    pgPolicy('Authenticated users can manage sync locks', {
      for: 'all',
      to: authenticatedRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
)
