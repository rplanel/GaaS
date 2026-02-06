import { serial, varchar } from 'drizzle-orm/pg-core'
import { galaxy } from '../galaxy'

/**
 * Tags
 */
export const tags = galaxy.table('tags', {
  id: serial('id').primaryKey(),
  label: varchar('label', { length: 75 }).notNull().unique(),
})
