import { relations } from 'drizzle-orm'
import { integer, json, primaryKey, serial, unique, varchar } from 'drizzle-orm/pg-core'

import { galaxy, galaxyItem } from '../galaxy'
import { analyses } from './analyses'
import { tags } from './tags'
import { users } from './users'

/**
 * Workflows
 */
export const workflows = galaxy.table('workflows', {
  id: serial('id').primaryKey(),
  autoVersion: integer('auto_version').notNull().default(1),
  versionKey: varchar('version_key', { length: 255 }).notNull(),
  nameKey: varchar('name_key', { length: 255 }).notNull(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  definition: json('definition').notNull(),
  ...galaxyItem,
}, t => ({
  unique: unique().on(t.versionKey, t.nameKey),
  galaxyIdUnique: unique().on(t.galaxyId),
}))

/**
 * workflowsToTags
 */
export const workflowsToTags = galaxy.table('workflows_to_tags', {
  workflowId: integer('workflow_id').notNull().references(() => workflows.id),
  tagId: integer('tag_id').notNull().references(() => tags.id),
}, t => ({
  pk: primaryKey({ columns: [t.workflowId, t.tagId] }),
}))

export const workflowsRelations = relations(workflows, ({ one, many }) => {
  return {
    user: one(users, {
      fields: [workflows.userId],
      references: [users.id],
    }),
    workflowTags: many(workflowsToTags),
    analyses: many(analyses),
  }
})

export const workflowsToTagsRelations = relations(
  workflowsToTags,
  ({ one }) => {
    return {
      workflow: one(workflows, {
        fields: [workflowsToTags.workflowId],
        references: [workflows.id],
      }),
      tag: one(tags, {
        fields: [workflowsToTags.tagId],
        references: [tags.id],
      }),
    }
  },
)
