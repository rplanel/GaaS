import { usersRelations as authUsersRelations } from './schema/auth/relations'
import {
  analysesRelations,
  analysisInputsRelations,
  analysisOutputsRelations,
  datasetsRelations,
  datasetsToTagsRelations,
  usersRelations as galaxyUsersRelations,
  historiesRelations,
  instancesRelations,
  jobsRelations,
  tagsRelations,
  uploadedDatasetsRelations,
  workflowsRelations,
  workflowsToTagsRelations,
} from './schema/galaxy/relations'
import {
  rolePermissionsRelations,
  rolesRelations,
  userRolesRelations,

} from './schema/galaxyRbac/relations'
import { bucketsRelations, objectsRelations } from './schema/storage/relations'

export const relations = {
  ...analysesRelations,
  ...analysisInputsRelations,
  ...analysisOutputsRelations,
  ...datasetsRelations,
  ...datasetsToTagsRelations,
  ...historiesRelations,
  ...instancesRelations,
  ...jobsRelations,
  ...rolePermissionsRelations,
  ...rolesRelations,
  ...tagsRelations,
  ...uploadedDatasetsRelations,
  ...userRolesRelations,
  ...galaxyUsersRelations,
  ...workflowsRelations,
  ...workflowsToTagsRelations,
  ...authUsersRelations,
  ...objectsRelations,
  ...bucketsRelations,
}
