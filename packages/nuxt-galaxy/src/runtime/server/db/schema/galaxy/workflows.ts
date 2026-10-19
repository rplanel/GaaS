import { sql } from 'drizzle-orm'
import { boolean, integer, json, pgPolicy, primaryKey, serial, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import { authenticatedRole } from 'drizzle-orm/supabase'

import { users as owners } from '../auth/users'
import { galaxy, galaxyItem } from '../galaxy'
import { tags } from './tags'
import { users } from './users'

/**
 * Versions: one row per label an administrator has published for one revision
 * of one Galaxy stored workflow (ADR 0004). `galaxy_id` names the stored
 * workflow, `name_key` and `version_key` are the name and the label a results
 * view directory is found by (ADR 0003), and `definition` is the export taken
 * at publish, never refreshed.
 */
export const workflows = galaxy.table(
  'workflows',
  {
    id: serial('id').primaryKey(),
    // The revision this version pins: the 0-based index the export carries as
    // `version`, which is the integer an invocation takes to run it (#48).
    revision: integer('revision').notNull(),
    // The identifier Galaxy gave that revision when it was saved, as the
    // export carries it. Galaxy neither rewrites a revision nor reuses an id,
    // so this is what tells a stable history from one that was replaced;
    // the index alone cannot.
    revisionUuid: uuid('revision_uuid').notNull(),
    versionKey: varchar('version_key', { length: 255 }).notNull(),
    nameKey: varchar('name_key', { length: 255 }).notNull(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    definition: json('definition').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }).defaultNow().notNull(),
    // Who published, as the auth user the server read off the session. Set
    // to null rather than cascading if that account is ever deleted: a
    // version outlives the administrator who published it.
    publishedBy: uuid('published_by').references(() => owners.id, { onDelete: 'set null' }),
    // Whether users may start an analysis on this version; false is retired.
    // Published means active, and nothing but an administrator changes it.
    active: boolean('active').notNull().default(true),
    ...galaxyItem,
  },
  t => [
    unique().on(t.versionKey, t.nameKey),
    // One row per revision of one stored workflow: `user_id` names the Galaxy
    // service user, hence the instance, so the same stored workflow id on two
    // instances could still both be published.
    unique().on(t.userId, t.galaxyId, t.revision),
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
    // Retiring a version and making it active again (ADR 0004, #71). The
    // policy says who may update; the column-level grant in the migration
    // that carries it says what: `active`, and nothing else, so that even an
    // administrator writing through the API cannot move a label or a
    // revision. Drizzle has no declaration for a column grant, so the
    // migration is hand-written after this policy is generated.
    pgPolicy('Admin can update workflows', {
      for: 'update',
      to: authenticatedRole,
      using: sql`(SELECT galaxy_rbac.authorize('workflows.update')) = TRUE`,
      withCheck: sql`(SELECT galaxy_rbac.authorize('workflows.update')) = TRUE`,
    }),
    // Deleting a version no analysis references (ADR 0004, #72): the
    // mistaken publish. The policy says who may delete; which versions may
    // go is the foreign key's decision, since `analyses.workflow_id` carries
    // no ON DELETE clause and refuses while an analysis references the row.
    pgPolicy('Admin can delete workflows', {
      for: 'delete',
      to: authenticatedRole,
      using: sql`(SELECT galaxy_rbac.authorize('workflows.delete')) = TRUE`,
    }),
  ],
)

/**
 * workflowsToTags. Nothing has written this table since ADR 0004 made tags a
 * pre-fill, but a development database may still hold associations from
 * before; they go with the version they were attached to (#72), so that a
 * stale one never stands in the way of a delete the way an analysis does.
 * Row security with no policy: nothing reads it either.
 */
export const workflowsToTags = galaxy.table.withRLS('workflows_to_tags', {
  workflowId: integer('workflow_id').notNull().references(() => workflows.id, { onDelete: 'cascade' }),
  tagId: integer('tag_id').notNull().references(() => tags.id),
}, t => [
  primaryKey({ columns: [t.workflowId, t.tagId] }),
])
