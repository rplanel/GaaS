import type { HistoryState } from 'blendtype'
import { relations } from 'drizzle-orm'
import { boolean, index, integer, serial, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users as owners } from '../auth/users'
import { galaxy, galaxyItem, historyStateEnum } from '../galaxy'
import { analyses } from './analyses'
import { datasets } from './datasets'
import { users } from './users'

export const histories = galaxy.table('histories', {
  id: serial('id').primaryKey(),
  state: historyStateEnum('state').$type<HistoryState>().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  userId: integer('user_id').notNull().references(() => users.id),
  ownerId: uuid('owner_id').notNull().references(() => owners.id, { onDelete: 'cascade' }),
  isDeleted: boolean('is_deleted').notNull().default(false),
  isSync: boolean('is_sync').notNull().default(false),
  ...galaxyItem,
}, t => [
  index().on(t.userId),
  index().on(t.ownerId),
  index().on(t.galaxyId),

])

export const historiesRelations = relations(histories, ({ one, many }) => {
  return {
    user: one(users, {
      fields: [histories.userId],
      references: [users.id],
    }),
    owner: one(owners, {
      fields: [histories.ownerId],
      references: [owners.id],
    }),
    analysis: one(analyses),
    datasets: many(datasets),
  }
})
