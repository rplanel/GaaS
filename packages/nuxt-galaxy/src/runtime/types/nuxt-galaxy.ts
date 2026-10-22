import type { GalaxyToolParameters, HistoryState, InvocationState, JobState, WorkflowStep } from 'blendtype'
import type { analyses } from '../server/db/schema/galaxy/analyses'
import type { datasets } from '../server/db/schema/galaxy/datasets'
import type { histories } from '../server/db/schema/galaxy/histories'
import type { jobs } from '../server/db/schema/galaxy/jobs'
import type { tags } from '../server/db/schema/galaxy/tags'
import type { workflows } from '../server/db/schema/galaxy/workflows'
import type { UNKNOWN_WORKFLOW_SELECTION } from '../shared/unknownWorkflow'
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

/**
 * @deprecated This is a workaround for Drizzle bug.
 *
 * Use `typeof analyses.$inferInsert` directly once fixed.
 */
export type NewAnalysis = Omit<typeof analyses.$inferInsert, 'id' | 'createdAt' | 'parameters' | 'invocation'> & {
  id?: number
  createdAt?: Date
  parameters: NonNullable<typeof analyses.$inferInsert['parameters']>
  invocation: NonNullable<typeof analyses.$inferInsert['invocation']>
}

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

/** An analysis input as a results view receives it: the row, its dataset and its tags. */
export interface AnalysisInputWithDatasetAndTags extends AnalysisInputRow {
  datasets: DatasetRow
  tags: TagRow[]
}

/** An analysis output as a results view receives it: the row, its dataset and its tags. */
export interface AnalysisOutputWithDatasetAndTags extends AnalysisOutputRow {
  datasets: DatasetRow
  tags: TagRow[]
}

/**
 * The analysis as a results view receives it (ADR 0003): the row with its
 * workflow, its inputs and its outputs.
 *
 * Inputs and outputs share one shape, dataset beside tags, so a view author
 * handles both the same way. In the database the two are stored differently:
 * an output's tags hang off the output, an input's off its dataset. The query
 * that loads this row folds that difference away rather than passing it on.
 */
export interface ResultsViewAnalysis extends AnalysisRow {
  workflows: WorkflowRow
  analysis_inputs: AnalysisInputWithDatasetAndTags[]
  analysis_outputs: AnalysisOutputWithDatasetAndTags[]
}

/**
 * What a results view receives (ADR 0003): the analysis it is opened on, with
 * its workflow, its inputs and its outputs, each carrying its dataset and its
 * tags. The view never has to query the analysis before rendering.
 *
 * A view imports it through the alias this module declares, since Vue
 * resolves a `defineProps<T>()` type only through an import in the file:
 * `import type { ResultsViewProps } from '#nuxt-galaxy'`.
 */
export interface ResultsViewProps {
  /** The analysis the view is opened on, as the route names it. */
  analysisId: number
  /** The analysis row with its workflow, inputs and outputs. */
  analysis: ResultsViewAnalysis
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

/**
 * What `POST /api/db/analyses` accepts. Inferred from the schema that checks
 * it (#47) rather than declared here beside it, so that the type a client
 * builds its request against and the check the request meets cannot drift
 * apart.
 */
export type { AnalysisBody } from '../server/utils/analysisBody'
/**
 * Who may call each `/api/galaxy/*` endpoint (#99), published so that a layer
 * consuming this module can check its own pages against it.
 *
 * A page that reads an `admin` endpoint needs an admin route guard of its own,
 * and nothing tells it so: the server answers 403 and a page that does not
 * look at the status renders an empty list instead. That is what happened to
 * `@gaas/ui`'s `/galaxy/workflows` when the level was raised. Exporting the
 * table lets a consumer assert the pairing rather than remember it.
 *
 * Safe on this entry despite living under `server/`: the module imports
 * nothing and holds no state — it is a table and two pure functions.
 */
export { accessForPath, GALAXY_ROUTE_ACCESS, isGalaxyApiPath } from '../server/utils/galaxyAccess'
export type { GalaxyRouteAccess } from '../server/utils/galaxyAccess'
/**
 * One step and one declared input of a revision, in the single shape this
 * application describes a workflow in since #88 — normalised from the stored
 * definition, rather than either the live Galaxy payload's spelling or the
 * export's.
 */
export type { DescribedStep, DescribedSubworkflow, DescribedToolStep, DescribedWorkflowInput } from '../server/utils/grizzle/storedDefinition'
/**
 * The two normalisers that produce the shapes above, published beside them.
 *
 * They are the definition of this contract rather than an implementation
 * detail of one endpoint: a consumer holding a stored export — or a suite
 * proving what a graph draws from one, or what the description endpoint
 * serves — needs the same normalisation the endpoint applies, and the
 * alternative is reaching into `runtime/server/` by path or keeping a second
 * copy that can drift. Both are pure — `describedStepsOf` reads an export
 * and `describedInputsOf` reads the steps it returned — and neither touches
 * the database or Galaxy.
 *
 * `describedInputsOf` is published beside `describedStepsOf` because the
 * endpoint's answer is the pair — `steps` and the `inputs` derived from
 * them — and a caller that could build only the first half would have to
 * write the second one itself (#103).
 */
export { describedInputsOf, describedStepsOf } from '../server/utils/grizzle/storedDefinition'
/**
 * The state of a version (#76): whether it can still run, as
 * `GET /api/db/workflows/:id/state` reads it live from Galaxy and the admin
 * workflows page shows it beside each version.
 */
export type { PinnedRevision, VersionState } from '../server/utils/grizzle/versionState'
/**
 * One revision described in one call (#87), as
 * `GET /api/galaxy/workflows/:id/revisions/:revision/description` serves it
 * and `useGalaxyWorkflowDescription` reads it.
 */
export type { WorkflowDescription } from '../server/utils/grizzle/workflowDescription'
/**
 * What the tool check of a revision answers (#75), as
 * `GET /api/galaxy/workflows/:id/revisions/:revision/tools` serves it and the
 * publish dialog reads it.
 */
export type { PinnedTool, RevisionToolCheck } from '../server/utils/grizzle/workflowTools'
export type { UnavailableTool, UnavailableToolReason } from '../server/utils/grizzle/workflowTools'
export type { PublishVersionBody } from '../server/utils/publishBody'
export type { VersionActiveBody } from '../server/utils/versionActiveBody'

export interface AnalysisMonitoringCounts {
  total: number
  success: number
  error: number
  cancelled: number
  pending: number
}

export interface AnalysisMonitoringWorkflowUsage extends AnalysisMonitoringCounts {
  workflowId: number | null
  name: string | null
  version: string | null
  successRate: number
}

export interface AnalysisMonitoringTrendPoint extends AnalysisMonitoringCounts {
  bucket: string
  successRate: number
}

/**
 * The bucket widths a trend can be drawn at, coarsest last, which is the order
 * a reader chooses between them in.
 *
 * Shared rather than server-side, because the same closed list is what the
 * endpoint validates against and what the interface offers: a value that is
 * not in it is a 400, and nothing can offer one that is.
 */
export const TREND_GRANULARITIES = ['day', 'week', 'month'] as const

/** The bucket width of a trend (Granularity). */
export type TrendGranularity = typeof TREND_GRANULARITIES[number]

/**
 * The bucket width a request that names none is answered at. Not the same
 * thing as the width the interface works out from a range, which the glossary
 * calls automatic granularity and which is month for all time.
 */
export const TREND_GRANULARITY_WHEN_ABSENT: TrendGranularity = 'day'

export function isTrendGranularity(value: unknown): value is TrendGranularity {
  return (TREND_GRANULARITIES as readonly unknown[]).includes(value)
}

/**
 * The token standing for the Unknown workflow bucket wherever a workflow is
 * named by its identifier. It lives in `runtime/shared/`, because the server
 * and a UI have to spell it identically (#169).
 */
export { UNKNOWN_WORKFLOW_SELECTION } from '../shared/unknownWorkflow'

/**
 * The one workflow version that counts and trend are narrowed to, named by its
 * local identifier or by the Unknown workflow token.
 *
 * A selection rather than a filter: it is picked out of the per-workflow
 * table, which is never narrowed by it, because a list that hid the options a
 * reader did not pick could not be the thing they pick from. Absent means all
 * workflows.
 */
export type WorkflowSelection = number | typeof UNKNOWN_WORKFLOW_SELECTION

export interface AnalysisMonitoringStats extends AnalysisMonitoringCounts {
  perWorkflow: AnalysisMonitoringWorkflowUsage[]
  trend: AnalysisMonitoringTrendPoint[]
  successRate: number
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

export interface GalaxyHealth {
  status: 'up' | 'down' | 'maintenance'
  url: string
  maintenance: {
    message: string
    startAt: string
    endAt: string
  } | null
}
