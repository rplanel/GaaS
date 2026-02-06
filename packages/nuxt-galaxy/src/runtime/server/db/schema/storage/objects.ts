import { eq, sql } from 'drizzle-orm'
import { jsonb, pgPolicy, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { authenticatedRole, authUid } from 'drizzle-orm/supabase'

const storageSchema = pgSchema('storage')

export const objects = storageSchema.table(
  'objects',
  {
    id: uuid('id').primaryKey(),
    name: text('name'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    bucketId: text('bucket_id').notNull(),
    owner: uuid('owner').notNull(),
  },
  table => [
    pgPolicy('Authenticated users can upload files', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`${table.bucketId} = 'analysis_files' AND ${eq(table.owner, authUid)}`,
    }),
    pgPolicy('Users can view their own files', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${table.bucketId} = 'analysis_files' AND ${eq(table.owner, authUid)}`,
    }),
    pgPolicy('Users can update their own files', {
      for: 'update',
      to: authenticatedRole,
      withCheck: sql`${table.bucketId} = 'analysis_files' AND ${eq(table.owner, authUid)}`,
    }),
    pgPolicy('Users can delete their own files', {
      for: 'delete',
      to: authenticatedRole,
      using: sql`${table.bucketId} = 'analysis_files' AND ${eq(table.owner, authUid)}`,
    }),
  ],
)
