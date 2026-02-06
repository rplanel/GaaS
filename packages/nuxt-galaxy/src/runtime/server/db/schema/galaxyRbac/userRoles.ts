import { sql } from 'drizzle-orm'
import { integer, pgPolicy, serial, unique, uuid } from 'drizzle-orm/pg-core'
import { supabaseAuthAdminRole } from 'drizzle-orm/supabase'
import { users } from '../auth/users'
import { galaxyRbac } from './index'
import { roles } from './roles'

/**
 * User roles junction table in galaxy_rbac schema
 */
export const userRoles = galaxyRbac.table(
  'user_roles',
  {
    id: serial('id').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    roleId: integer('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  },
  table => [
    unique().on(table.userId, table.roleId),
    pgPolicy('Allow auth admin to read user roles', {
      for: 'select',
      to: supabaseAuthAdminRole,
      using: sql`true`,
    }),
  ],
)
