import { eq, sql } from 'drizzle-orm'
import {
  index,
  integer,
  pgPolicy,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { authenticatedRole, authUid } from 'drizzle-orm/supabase'
import { users as owners } from '../auth/users'
import { galaxy } from '../galaxy'
import { analyses } from './analyses'

export const monitoringOutcome = galaxy.enum('monitoring_outcome', [
  'pending',
  'success',
  'error',
  'cancelled',
])

export const analysisMonitoring = galaxy.table(
  'analysis_monitoring',
  {
    id: serial('id').primaryKey(),
    analysisId: integer('analysis_id').references(() => analyses.id, { onDelete: 'set null' }),
    ownerId: uuid('owner_id').notNull().references(() => owners.id),
    workflowId: integer('workflow_id').notNull(),
    name: varchar('name', { length: 256 }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    outcome: monitoringOutcome('outcome').notNull().default('pending'),
    galaxyInvocationId: varchar('galaxy_invocation_id', { length: 256 }).notNull(),
    errorMessage: text('error_message'),
    // Snapshot of the workflow this analysis ran against (D-02..D-05). These are
    // nullable so per-workflow stats survive workflow deletion: unresolved values
    // stay NULL, surfaced as the "unknown" bucket downstream. Populated at write
    // time (Phase 13) and backfilled from the local workflows table (D-10).
    workflowName: varchar('workflow_name', { length: 256 }),
    galaxyWorkflowId: varchar('galaxy_workflow_id', { length: 256 }),
    workflowVersion: varchar('workflow_version', { length: 255 }),
  },
  table => [
    index('idx_analysis_monitoring_owner_outcome').on(table.ownerId, table.outcome),
    index('idx_analysis_monitoring_outcome').on(table.outcome),
    index('idx_analysis_monitoring_galaxy_invocation_id').on(table.galaxyInvocationId),
    index('idx_analysis_monitoring_owner_workflow').on(table.ownerId, table.workflowId),
    index('idx_analysis_monitoring_owner_started_at').on(table.ownerId, table.startedAt),
    uniqueIndex('idx_analysis_monitoring_analysis_id_unique')
      .on(table.analysisId)
      .where(sql`${table.analysisId} IS NOT NULL`),
    pgPolicy('Authenticated users can view their own monitoring rows', {
      for: 'select',
      to: authenticatedRole,
      using: eq(table.ownerId, authUid),
    }),
    pgPolicy('Admin can view all monitoring rows', {
      for: 'select',
      to: authenticatedRole,
      using: sql`(SELECT galaxy_rbac.is_admin()) = TRUE`,
    }),
    pgPolicy('Authenticated users can create their own monitoring rows', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: eq(table.ownerId, authUid),
    }),
    pgPolicy('Authenticated users can update their own monitoring rows', {
      for: 'update',
      to: authenticatedRole,
      using: eq(table.ownerId, authUid),
      withCheck: eq(table.ownerId, authUid),
    }),
  ],
)
