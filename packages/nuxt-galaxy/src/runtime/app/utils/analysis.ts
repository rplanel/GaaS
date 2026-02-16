import type { AnalysisRow, WorkflowRow } from '../../types/nuxt-galaxy'
import { Data, Effect } from 'effect'
import { toValue } from 'vue'
import { NoSupabaseUserError, SupabaseClaimsLayer, SupabaseClientLayer } from './supabase'

export interface WorkflowAnalysis extends AnalysisRow {
  workflows: WorkflowRow
}

export class GetWorkflowAnalysesError extends Data.TaggedError('GetWorkflowAnalysesError')<{
  readonly message: string
}> {}

/**
 * Fetches analyses for a given workflow ID from the Supabase database.
 * Returns a single analysis object or fails with an error if the user is not authenticated
 * or if there is an error fetching the data.
 *
 * @param {number} workflowId - The ID of the workflow to fetch analyses for.
 * @returns {Effect<WorkflowAnalysis, GetWorkflowAnalysesError>} An effect that resolves to the analysis data.
 */

export function getWorkflowAnalysesEffect(workflowId: number) {
  return Effect.gen(function* () {
    const supabase = yield* SupabaseClientLayer
    const user = yield* SupabaseClaimsLayer
    const userVal = toValue(user)

    if (!userVal) {
      return yield* Effect.fail(
        new NoSupabaseUserError({
          message: 'No supabase user found',
        }),
      )
    }
    const { data, error } = yield* Effect.promise(
      () => supabase
        .schema('galaxy')
        .from('analyses')
        .select(`
          *,
          workflows (*)
          `)
        .eq('workflow_id', workflowId)
        .maybeSingle()
        .overrideTypes<WorkflowAnalysis, { merge: false }>(),
    )
    if (error) {
      yield* Effect.fail(
        new GetWorkflowAnalysesError({
          message: `Failed to get analyses for workflow ${workflowId} : ${error.message}`,
        }),
      )
    }
    return data
  })
}
