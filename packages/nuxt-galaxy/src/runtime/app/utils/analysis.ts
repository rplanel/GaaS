import type { RowAnalysis, RowWorkflow } from '../../types/nuxt-galaxy'
import { Data, Effect } from 'effect'
import { toValue } from 'vue'
import { ClientSupabaseClient, ClientSupabaseUser, NoSupabaseUserError } from './supabase'

export interface WorkflowAnalysis extends RowAnalysis {
  workflows: RowWorkflow
}

// eslint-disable-next-line unicorn/throw-new-error
export class GetWorkflowAnalysesError extends Data.TaggedError('GetWorkflowAnalysesError')<{
  readonly message: string
}> {}

export function getWorkflowAnalysesEffect(workflowId: number) {
  return Effect.gen(function* () {
    const supabase = yield* ClientSupabaseClient
    const user = yield* ClientSupabaseUser
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
