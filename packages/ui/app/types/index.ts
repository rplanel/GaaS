import type { SupabaseTypes } from '#build/types/database'
import type { GalaxyTypes } from '#build/types/nuxt-galaxy'
import type { galaxyWorkflowExportSchema } from 'blendtype'
import type * as z from 'zod'

export type Database = SupabaseTypes.Database

export type RowWorkflow = GalaxyTypes.RowWorkflow
export type GalaxyWorkflowExportSchema = z.infer<typeof galaxyWorkflowExportSchema>

export interface SanitizedWorkflowDbItem extends Omit<RowWorkflow, 'definition'> {
  definition: GalaxyWorkflowExportSchema
}

export type RowAnalysisJob = GalaxyTypes.RowAnalysisJob

export type AnalysisDetail = GalaxyTypes.AnalysisDetail
