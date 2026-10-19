import { sql } from 'drizzle-orm'
import { pgPolicy, serial, varchar } from 'drizzle-orm/pg-core'
import { authenticatedRole } from 'drizzle-orm/supabase'
import { galaxy } from '../galaxy'

/**
 * Tags. Only the sync writes them, through the service role. A label can
 * carry a sample name, so a reader sees a tag only when a link row they may
 * read names it: the two link tables' own policies decide which, through the
 * reader's datasets. The link tables are named rather than imported, since
 * both import this one.
 */
export const tags = galaxy.table(
  'tags',
  {
    id: serial('id').primaryKey(),
    label: varchar('label', { length: 75 }).notNull().unique(),
  },
  table => [
    pgPolicy('Users can view the tags of their own datasets and outputs', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${table.id} IN (SELECT tag_id FROM galaxy.datasets_to_tags) OR ${table.id} IN (SELECT tag_id FROM galaxy.analysis_outputs_to_tags)`,
    }),
  ],
)
