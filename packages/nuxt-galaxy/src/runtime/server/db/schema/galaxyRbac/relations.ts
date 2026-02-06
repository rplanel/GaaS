import { defineRelations } from 'drizzle-orm'
import { users } from '../auth/users'
import { rolePermissions } from './rolePermissions'
import { roles } from './roles'
import { userRoles } from './userRoles'

export const rolePermissionsRelations = defineRelations({ rolePermissions, roles }, r => ({
  rolePermissions: {
    role: r.one.roles({
      from: r.rolePermissions.roleId,
      to: r.roles.id,
    }),
  },
}))

export const rolesRelations = defineRelations({ roles, userRoles, rolePermissions }, r => ({
  roles: {
    userRoles: r.many.userRoles({
      from: r.roles.id,
      to: r.userRoles.roleId,
    }),
    rolePermissions: r.many.rolePermissions({
      from: r.roles.id,
      to: r.rolePermissions.roleId,
    }),
  },
}))
export const userRolesRelations = defineRelations({ userRoles, roles, users }, r => ({
  userRoles: {
    role: r.one.roles({
      from: r.userRoles.roleId,
      to: r.roles.id,
    }),
    user: r.one.users({
      from: r.userRoles.userId,
      to: r.users.id,
    }),
  },
}))
