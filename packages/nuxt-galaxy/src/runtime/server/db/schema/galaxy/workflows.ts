import { sql } from 'drizzle-orm'
import { integer, json, pgPolicy, primaryKey, serial, unique, varchar } from 'drizzle-orm/pg-core'
import { authenticatedRole } from 'drizzle-orm/supabase'

import { galaxy, galaxyItem } from '../galaxy'
import { tags } from './tags'
import { users } from './users'

/**
 * Workflows
 */
export const workflows = galaxy.table(
  'workflows',
  {
    id: serial('id').primaryKey(),
    autoVersion: integer('auto_version').notNull().default(1),
    versionKey: varchar('version_key', { length: 255 }).notNull(),
    nameKey: varchar('name_key', { length: 255 }).notNull(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    definition: json('definition').notNull(),
    ...galaxyItem,
  },
  t => [
    unique().on(t.versionKey, t.nameKey),
    unique().on(t.galaxyId),
    pgPolicy('Users can query workflows', {
      for: 'select',
      to: authenticatedRole,
      using: sql`true`,
    }),
    pgPolicy('Admin can insert workflows', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`(SELECT galaxy_rbac.authorize('workflows.insert')) = TRUE`,
    }),
  ],
)

/**
 * workflowsToTags
 */
export const workflowsToTags = galaxy.table('workflows_to_tags', {
  workflowId: integer('workflow_id').notNull().references(() => workflows.id),
  tagId: integer('tag_id').notNull().references(() => tags.id),
}, t => [
  primaryKey({ columns: [t.workflowId, t.tagId] }),
])
