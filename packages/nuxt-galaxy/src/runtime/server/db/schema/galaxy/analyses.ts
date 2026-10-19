import type { InvocationState } from 'blendtype'
import { eq } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  json,
  pgPolicy,
  serial,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { authenticatedRole, authUid } from 'drizzle-orm/supabase'
import { users as owners } from '../auth/users'
import { galaxy, invocationStateEnum } from '../galaxy'
import { histories } from './histories'
import { workflows } from './workflows'

export const analyses = galaxy.table(
  'analyses',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 256 }).notNull(),
    state: invocationStateEnum('state').$type<InvocationState>().notNull(),
    parameters: json('parameters').notNull(),
    datamap: json('datamap').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    ownerId: uuid('owner_id').notNull().references(() => owners.id, { onDelete: 'cascade' }),
    historyId: integer('history_id').notNull().unique().references(() => histories.id, { onDelete: 'cascade' }),
    workflowId: integer('workflow_id').notNull().references(() => workflows.id),
    // The Galaxy revision this analysis was started against: the 0-based index
    // `POST /api/workflows/{id}/invocations` took as `version`, read off the
    // workflow row's `revision` at start (#48). Nullable because analyses
    // started before #48 ran whatever revision was latest at the time, and
    // `NULL` says so rather than guessing.
    workflowRevision: integer('workflow_revision'),
    galaxyId: varchar('galaxy_id', { length: 256 }).notNull(),
    stderr: text('stderr'),
    stdout: text('stdout'),
    invocation: json('invocation').notNull(),
    isSync: boolean('is_sync').default(false),
    syncAttempts: integer('sync_attempts').default(0).notNull(),
    lastSyncErrorAt: timestamp('last_sync_error_at', { withTimezone: true }),
    nextSyncAt: timestamp('next_sync_at', { withTimezone: true }),
  },
  table => [
    index().on(table.ownerId),
    index().on(table.historyId),
    index().on(table.workflowId),
    index().on(table.galaxyId),
    pgPolicy('Users can view their own analysis', {
      for: 'select',
      to: authenticatedRole,
      using: eq(table.ownerId, authUid),
    }),
    pgPolicy('Users can update their own analysis', {
      for: 'update',
      to: authenticatedRole,
      using: eq(table.ownerId, authUid),
      withCheck: eq(table.ownerId, authUid),
    }),
  ],
)
