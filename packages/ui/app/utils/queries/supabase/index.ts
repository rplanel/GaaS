// analyses
import type { PostgrestSingleResponse } from '@supabase/postgrest-js'

export { ANALYSES_QUERY_KEYS } from './analyses'
export {
  analysesListQuery,
  analysesListWithWorkflowAndHistoryQuery,
  analysisByIdWithJobsQuery,
  analysisByIdWithOutputsAndWorkflowsQuery,
} from './analyses'

// analyses outputs view
export { ANALYSES_OUTPUTS_VIEW_QUERY_KEYS } from './analysisOutputsView'
export { analysesOutputsViewQuery } from './analysisOutputsView'

// datasets
export { SUPABASE_DATASETS_QUERY_KEYS as DATASETS_QUERY_KEYS } from './datasets'
export { datasetsCountQuery } from './datasets'

// Instances
export { SUPABASE_INSTANCES_QUERY_KEYS as INSTANCES_QUERY_KEYS } from './instances'
export { instanceByUrlQuery } from './instances'

// Uploaded datasets view
export { UPLOADED_DATASETS_VIEW_QUERY_KEYS } from './uploadedDatasetsView'
export { uploadedDatasetsViewQuery } from './uploadedDatasetsView'

// Workflows
export { WORKFLOWS_QUERY_KEYS } from './workflows'
export { workflowByIdQuery, workflowsListQuery } from './workflows'

export function supabaseResponseToData<TData>(response: PostgrestSingleResponse<TData>) {
  const { data, error, count } = response
  if (error) {
    throw new Error(`Supabase query failed: ${response.error.message}`)
  }

  // Count queries should use useSupabaseCount instead
  if (data === null && count !== null && count !== undefined) {
    throw new Error(
      'Count queries should use useSupabaseCount composable. '
      + 'This composable returns QueryData<T>, not number.',
    )
  }

  if (data === null) {
    throw new Error('No data returned from Supabase query')
  }

  return data as TData
}

export function supabaseCountResponseToCount<TData>(response: PostgrestSingleResponse<TData>) {
  const { error, count } = response
  if (error) {
    throw new Error(`Supabase count query failed: ${error.message}`)
  }

  if (count === null || count === undefined) {
    throw new Error('No count returned from Supabase count query')
  }

  return count
}
