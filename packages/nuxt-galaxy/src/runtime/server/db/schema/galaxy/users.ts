import { integer, serial, unique, varchar } from 'drizzle-orm/pg-core'
import { galaxy } from '../galaxy'
import { instances } from './instances'

/**
 * Users
 *
 * The Galaxy service account the server runs every job as, which the server
 * reads with Drizzle. Row security with no policy: the API roles read no row
 * of it.
 */

export const users = galaxy.table.withRLS(
  'user',
  {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 100 }).notNull(),
    instanceId: integer('instance_id').notNull().references(() => instances.id, { onDelete: 'cascade' }),
  },
  t => [
    unique().on(t.email, t.instanceId),
  ],
)
