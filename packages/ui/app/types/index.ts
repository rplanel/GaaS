import type { galaxyWorkflowExportSchema } from 'blendtype'
// import type { SupabaseTypes } from '#build/types/database'
import type { WorkflowRow } from 'nuxt-galaxy'
import type * as z from 'zod'

export type { AnalysisWithOutputsAndWorkflow, OutputsWithDatasets, WorkflowFromAnalysis } from './analyses'
export type GalaxyWorkflowExportSchema = z.infer<typeof galaxyWorkflowExportSchema>

export interface SanitizedWorkflowDbItem extends Omit<WorkflowRow, 'definition'> {
  definition: GalaxyWorkflowExportSchema
}
