import type { Datamap, GalaxyToolParameters, GalaxyWorkflowParameters, HistoryState, InvocationState, JobState, WorkflowStep } from 'blendtype'
import type { Database } from './database'

export interface WorkflowToolsParameters {
  step: WorkflowStep
  parameters?: GalaxyToolParameters[] | undefined
  id: string
}

export type RowAnalysis = Database['galaxy']['Tables']['analyses']['Row']
export type RowAnalysisInput = Database['galaxy']['Tables']['analysis_inputs']['Row']
export type RowAnalysisOutputs = Database['galaxy']['Tables']['analysis_outputs']['Row']
export type RowAnalysisJob = Database['galaxy']['Tables']['jobs']['Row']
export type RowAnalaysisDataset = Database['galaxy']['Tables']['datasets']['Row']
export type RowWorkflow = Database['galaxy']['Tables']['workflows']['Row']
export type RowHistory = Database['galaxy']['Tables']['histories']['Row']
export interface AnalysisInputsWithDatasets extends RowAnalysisInput {
  datasets: RowAnalaysisDataset
}
export interface AnalysisOutputsWithDatasets extends RowAnalysisOutputs {
  datasets: RowAnalaysisDataset
}

export type AnalysisIOWithDatasets = AnalysisInputsWithDatasets | AnalysisOutputsWithDatasets

export interface AnalysisDetail extends RowAnalysis {
  workflows: RowWorkflow
  histories: RowHistory
  jobs?: RowAnalysisJob[]
}
export interface AnalysisJobs extends RowAnalysisJob {
  analysis: RowAnalysis
}

export type AnalysisInputsWithStoratePath = Database['galaxy']['Views']['analysis_inputs_with_storage_path']['Row']
export type AnalysisOutputsWithStoratePath = Database['galaxy']['Views']['analysis_outputs_with_storage_path']['Row']
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
  'workflows.delete',
  'instances.insert',
  'instances.delete',
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
  analyses: RowAnalysis
}

export interface GalaxyInstanceDetails {
  version_major: string
  version_minor: string
  url: string
}
