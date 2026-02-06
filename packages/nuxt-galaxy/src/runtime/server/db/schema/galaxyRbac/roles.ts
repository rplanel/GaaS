import type { RoleType } from '../../../../types/nuxt-galaxy'
import { sql } from 'drizzle-orm'
import { pgPolicy, serial } from 'drizzle-orm/pg-core'
import { supabaseAuthAdminRole } from 'drizzle-orm/supabase'
import { galaxyRbac, roleTypeEnum } from './index'

/**
 * Roles table in galaxy_rbac schema
 */
export const roles = galaxyRbac.table(
  'roles',
  {
    id: serial('id').primaryKey(),
    name: roleTypeEnum('name').$type<RoleType>().notNull(),
  },
  () => [
    pgPolicy('Allow auth admin to read roles', {
      for: 'select',
      to: supabaseAuthAdminRole,
      using: sql`true`,
    }),
  ],
)
