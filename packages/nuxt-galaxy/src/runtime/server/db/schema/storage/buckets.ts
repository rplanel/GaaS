import { bigint, boolean, text, timestamp } from 'drizzle-orm/pg-core'
import { storageSchema } from '.'

export const buckets = storageSchema.table('buckets', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  public: boolean('public').notNull().default(false),
  fileSizeLimit: bigint('file_size_limit', { mode: 'number' }),
})
