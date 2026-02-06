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
    datamap: json('datamap').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    ownerId: uuid('owner_id').notNull().references(() => owners.id, { onDelete: 'cascade' }),
    historyId: integer('history_id').notNull().unique().references(() => histories.id, { onDelete: 'cascade' }),
    workflowId: integer('workflow_id').notNull().references(() => workflows.id),
    galaxyId: varchar('galaxy_id', { length: 256 }).notNull(),
    stderr: text('stderr'),
    stdout: text('stdout'),
    invocation: json('invocation').notNull(),
    isSync: boolean('is_sync').notNull().default(false),
  },
  table => [
    index().on(table.ownerId),
    index().on(table.historyId),
    index().on(table.workflowId),
    index().on(table.galaxyId),
    pgPolicy('Authenticated users can create their own analysis', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: eq(table.ownerId, authUid),
    }),
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
    pgPolicy('Users can delete their own analysis', {
      for: 'delete',
      to: authenticatedRole,
      using: eq(table.ownerId, authUid),
    }),
  ],
)
