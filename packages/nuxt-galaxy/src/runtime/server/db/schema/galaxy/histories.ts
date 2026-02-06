import type { HistoryState } from 'blendtype'
import { eq } from 'drizzle-orm'
import { boolean, index, integer, pgPolicy, serial, timestamp, uuid } from 'drizzle-orm/pg-core'
import { authenticatedRole, authUid } from 'drizzle-orm/supabase'
import { users as owners } from '../auth/users'
import { galaxy, galaxyItem, historyStateEnum } from '../galaxy'
import { users } from './users'

export const histories = galaxy.table(
  'histories',
  {
    id: serial('id').primaryKey(),
    state: historyStateEnum('state').$type<HistoryState>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    userId: integer('user_id').notNull().references(() => users.id),
    ownerId: uuid('owner_id').notNull().references(() => owners.id, { onDelete: 'cascade' }),
    isDeleted: boolean('is_deleted').notNull().default(false),
    isSync: boolean('is_sync').notNull().default(false),
    ...galaxyItem,
  },
  t => [
    index().on(t.userId),
    index().on(t.ownerId),
    index().on(t.galaxyId),
    pgPolicy('Authenticated users can create their own history', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: eq(t.ownerId, authUid),
    }),
    pgPolicy('Users can view their own history', {
      for: 'select',
      to: authenticatedRole,
      using: eq(t.ownerId, authUid),
    }),
    pgPolicy('Users can update their own history', {
      for: 'update',
      to: authenticatedRole,
      using: eq(t.ownerId, authUid),
      withCheck: eq(t.ownerId, authUid),
    }),
    pgPolicy('Users can delete their own history', {
      for: 'delete',
      to: authenticatedRole,
      using: eq(t.ownerId, authUid),
    }),
  ],
)
