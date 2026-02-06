import type { RolePermission } from '../../../../types/nuxt-galaxy'
import { index, integer, serial, unique } from 'drizzle-orm/pg-core'
import { galaxyRbac, rolePermissionEnum } from './index'
import { roles } from './roles'

/**
 * Role permissions table in galaxy_rbac schema
 */
export const rolePermissions = galaxyRbac.table(
  'role_permissions',
  {
    id: serial('id').primaryKey(),
    permission: rolePermissionEnum('permission').$type<RolePermission>().notNull(),
    roleId: integer('role_id').notNull().references(() => roles.id),
  },
  table => [
    unique().on(table.permission, table.roleId),
    index().on(table.roleId),
    index().on(table.permission),
  ],
)
