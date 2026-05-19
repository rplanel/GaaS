import type { Database, Tables } from 'nuxt-galaxy'

export type AnalysisOutputWithDatasetAndTags = Tables<'analysis_outputs'> & {
  datasets: Tables<'datasets'>
  tags: Tables<'tags'>[]
}

export type AnalysisWithOutputsAndWorkflow = Tables<'analyses'> & {
  analysis_outputs: AnalysisOutputWithDatasetAndTags[]
  workflows: Tables<'workflows'>
}

export type OutputsWithDatasets = AnalysisOutputWithDatasetAndTags[]

export type WorkflowFromAnalysis = Database['galaxy']['Tables']['workflows']['Row'] | undefined
