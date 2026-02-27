import type { Datamap, GalaxyToolParameters, GalaxyWorkflowParameters, HistoryState, InvocationState, JobState, WorkflowStep } from 'blendtype'
import type { analyses } from '../server/db/schema/galaxy/analyses'
import type { datasets } from '../server/db/schema/galaxy/datasets'
import type { histories } from '../server/db/schema/galaxy/histories'
import type { jobs } from '../server/db/schema/galaxy/jobs'
import type { tags } from '../server/db/schema/galaxy/tags'
import type { workflows } from '../server/db/schema/galaxy/workflows'
import type { Database } from './database'

export type AnalysisRow = Database['galaxy']['Tables']['analyses']['Row']
export type AnalysisInputRow = Database['galaxy']['Tables']['analysis_inputs']['Row']
export type AnalysisOutputRow = Database['galaxy']['Tables']['analysis_outputs']['Row']
export type JobRow = Database['galaxy']['Tables']['jobs']['Row']
export type DatasetRow = Database['galaxy']['Tables']['datasets']['Row']
export type UploadedDatasetRow = Database['galaxy']['Tables']['uploaded_datasets']['Row']
export type WorkflowRow = Database['galaxy']['Tables']['workflows']['Row']
export type HistoryRow = Database['galaxy']['Tables']['histories']['Row']
export type AnalysisInputWithStoragePathRow = Database['galaxy']['Views']['analysis_inputs_with_storage_path']['Row']
export type AnalysisOutputWithStoragePathRow = Database['galaxy']['Views']['analysis_outputs_with_storage_path']['Row']
export type TagRow = Database['galaxy']['Tables']['tags']['Row']

export type NewDataset = typeof datasets.$inferInsert
export type GetTag = typeof tags.$inferSelect
export type NewJob = typeof jobs.$inferInsert
export type NewHistory = typeof histories.$inferInsert
export type NewAnalysis = typeof analyses.$inferInsert
export type NewWorkflow = typeof workflows.$inferInsert

// export type AnalysisIOWithDatasets = AnalysisInputsWithDatasets | AnalysisOutputsWithDatasets

export interface DatasetWithTags {
  tags: TagRow[] | undefined
  datasets: DatasetRow
}

export interface WorkflowToolsParameters {
  step: WorkflowStep
  parameters?: GalaxyToolParameters[] | undefined
  id: string
}

export interface AnalysisDetail extends AnalysisRow {
  workflows: WorkflowRow
  histories: HistoryRow
  jobs?: JobRow[]
}

export interface AnalysisWithJobs extends AnalysisRow {
  jobs: JobRow[]
}

export interface AnalysisJobs extends JobRow {
  analysis: AnalysisRow
}

// export type AnalysisDetail = Database['galaxy']['Views']['analyses_details']['Row']

export interface Sync {
  isTerminalState: boolean
  updated: boolean

}

export interface SyncDatasets extends Sync {
  datasetId: number
}

export interface SyncJob extends Sync {
  state: JobState
  jobId: number
  isSync: boolean
  stderr?: string | null
  stdout?: string | null
  outputs?: SyncDatasets[]
}

export interface SyncHistory extends Sync {
  state: HistoryState
  historyId: number
  isSync: boolean
  jobs?: SyncJob[]
  outputs?: SyncDatasets[]
}

export interface UpdatedAnalysisLog extends Sync {
  analysisId: number
  state: InvocationState
  // jobs?: Array<SyncJob>,
  history: SyncHistory
  isSync: boolean
}

export interface AnalysisBody {
  name: string
  datamap: Datamap
  parameters: GalaxyWorkflowParameters
  workflowId: number
}

// Drizzle Database type related

export const RoleTypes = [
  'admin',
  'user',
] as const

export type RoleType = typeof RoleTypes[number]

export const RolePermissions = [
  'workflows.insert',
  'workflows.update',
  'workflows.select',
  'workflows.delete',
  'instances.insert',
  'instances.delete',
  'instances.update',
  'instances.select',
  'users.select',
  'users.insert',
  'users.update',
  'users.delete',
  'roles.select',
  'roles.insert',
  'roles.update',
  'roles.delete',
  'role_permissions.select',
  'role_permissions.insert',
  'role_permissions.update',
  'role_permissions.delete',
  'tags.select',
  'tags.insert',
  'tags.update',
  'tags.delete',
  'user_roles.select',
  'user_roles.insert',
  'user_roles.update',
  'user_roles.delete',
] as const
export type RolePermission = typeof RolePermissions[number]

// export type AnalysisDb = typeof analyses.$inferSelect
// export type User = typeof users.$inferSelect
// export type NewUser = typeof users.$inferInsert
// export type UploadedDatasetDb = typeof uploadedDatasets.$inferSelect
// export type Instance = typeof instances.$inferSelect
// export type NewInstance = typeof instances.$inferInsert
export type HistoryDb = Database['galaxy']['Tables']['histories']['Row']
// export type DatasetDb = typeof datasets.$inferSelect

export interface HistoryWithAnalysisDB {
  histories: HistoryDb
  analyses: AnalysisRow
}

export interface GalaxyInstanceDetails {
  version_major: string
  version_minor: string
  url: string
}
