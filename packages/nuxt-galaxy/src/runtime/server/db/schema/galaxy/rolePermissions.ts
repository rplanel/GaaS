import type { RolePermission } from '../../../../types/nuxt-galaxy'
import { relations } from 'drizzle-orm'
import { index, integer, serial, unique } from 'drizzle-orm/pg-core'
import { RolePermissions } from '../../../../types/nuxt-galaxy'
import { galaxy } from '../galaxy'
import { roles } from './roles'

export const rolePermissionsTypeEnum = galaxy.enum(
  'role_permissions_type',
  RolePermissions,
)

export const rolePermissions = galaxy.table('role_permissions', {
  id: serial('id').primaryKey(),
  permission: rolePermissionsTypeEnum('permission').$type<RolePermission>().notNull(),
  roleId: integer('role_id').notNull().references(() => roles.id),
}, table => [
  unique().on(table.permission, table.roleId),
  index().on(table.roleId),
  index().on(table.permission),
])

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => {
  return {
    role: one(roles, {
      fields: [rolePermissions.roleId],
      references: [roles.id],
    }),
  }
})
