import { integer, serial, timestamp } from 'drizzle-orm/pg-core'
import { galaxy } from '../galaxy'
import { analyses } from './analyses'

// Taken and dropped only by the service-role scheduled task
// (galaxy:sync-analyses), through `galaxy.acquire_sync_lock`. Row security
// with no policy: the API roles neither read nor write a lock.
export const syncLocks = galaxy.table.withRLS(
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
)
