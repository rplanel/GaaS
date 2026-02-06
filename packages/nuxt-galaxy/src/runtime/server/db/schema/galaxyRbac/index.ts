import { pgSchema, varchar } from 'drizzle-orm/pg-core'
import { RolePermissions, RoleTypes } from '../../../../types/nuxt-galaxy'

/**
 * Galaxy RBAC Schema
 * Contains role-based access control tables and functions
 */
export const galaxyRbac = pgSchema('galaxy_rbac')

/**
 * Role enum
 */
export const roleTypeEnum = galaxyRbac.enum('role_type', RoleTypes)

/**
 * Permission enum
 */
export const rolePermissionEnum = galaxyRbac.enum('role_permissions_type', RolePermissions)

/**
 * GalaxyItem base for RBAC tables
 */
export const galaxyRbacItem = {
  galaxyId: varchar('galaxy_id', { length: 256 }).notNull(),
  name: varchar('name', { length: 256 }).notNull(),
  annotation: varchar('annotation', { length: 200 }),
} as const
