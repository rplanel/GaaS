import type { galaxyWorkflowExportSchema } from 'blendtype'
// import type { SupabaseTypes } from '#build/types/database'
import type { WorkflowRow } from 'nuxt-galaxy'
import type * as z from 'zod'

export type { AnalysesWithOutputsAndWorkflow, WorkflowFromAnalysis } from '../pages/analyses/[analysisId].vue'
// export type Database = SupabaseTypes.Database

export type GalaxyWorkflowExportSchema = z.infer<typeof galaxyWorkflowExportSchema>

export interface SanitizedWorkflowDbItem extends Omit<WorkflowRow, 'definition'> {
  definition: GalaxyWorkflowExportSchema
}
