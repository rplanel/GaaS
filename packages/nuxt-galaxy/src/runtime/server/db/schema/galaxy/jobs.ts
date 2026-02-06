import type { JobState } from 'blendtype'
import { eq } from 'drizzle-orm'
import { boolean, index, integer, pgPolicy, serial, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import { authenticatedRole, authUid } from 'drizzle-orm/supabase'
import { users as owners } from '../auth/users'
import { galaxy, jobStateEnum } from '../galaxy'
import { analyses } from './analyses'

export const jobs = galaxy.table(
  'jobs',
  {
    id: serial('id').primaryKey(),
    state: jobStateEnum('state').$type<JobState>().notNull(),
    toolId: varchar('tool_id', { length: 256 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    exitCode: integer('exit_code'),
    stdout: text('stdout'),
    stderr: text('stderr'),
    ownerId: uuid('owner_id').notNull().references(() => owners.id, { onDelete: 'cascade' }),
    galaxyId: varchar('galaxy_id', { length: 256 }).notNull().unique(),
    stepId: integer('step_id').notNull(),
    analysisId: integer('analysis_id').notNull().references(() => analyses.id, { onDelete: 'cascade' }),
    isSync: boolean('is_sync').notNull().default(false),
  },
  t => [
    unique().on(t.galaxyId, t.analysisId),
    index().on(t.ownerId),
    index().on(t.analysisId),
    index().on(t.galaxyId),
    pgPolicy('Authenticated users can create their own jobs', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: eq(t.ownerId, authUid),
    }),
    pgPolicy('Users can view their own jobs', {
      for: 'select',
      to: authenticatedRole,
      using: eq(t.ownerId, authUid),
    }),
    pgPolicy('Users can update their own jobs', {
      for: 'update',
      to: authenticatedRole,
      using: eq(t.ownerId, authUid),
      withCheck: eq(t.ownerId, authUid),
    }),
    pgPolicy('Users can delete their own jobs', {
      for: 'delete',
      to: authenticatedRole,
      using: eq(t.ownerId, authUid),
    }),
  ],
)
