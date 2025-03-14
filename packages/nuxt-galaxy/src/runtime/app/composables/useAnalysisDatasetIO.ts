import type { AsyncDataExecuteOptions } from '#app/composables/asyncData'
import type { Ref } from '#imports'
import type { Database } from '../../types/database'
import type { AnalysisDetail, AnalysisInputsWithStoratePath, AnalysisOutputsWithStoratePath, RowWorkflow } from '../../types/nuxt-galaxy'
import { createError, ref, toValue, useSupabaseClient, useSupabaseUser, watch } from '#imports'
import { getErrorMessage, getStatusCode } from 'blendtype'

export type AnalysisWorkflow = Pick<RowWorkflow, 'id' | 'name' | 'galaxy_id' | 'definition'>

export function useAnalysisDatasetIO(analysisId: Ref<number | undefined>): {
  inputs: Ref<AnalysisInputsWithStoratePath[] | null>
  outputs: Ref<AnalysisOutputsWithStoratePath[] | null>
  analysis: Ref<AnalysisDetail | null>
  workflow: Ref<AnalysisWorkflow | null>
  pendingAnalysis: Ref<boolean>
  refresh: (opts?: AsyncDataExecuteOptions) => void
} {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()
  const inputs = ref<AnalysisInputsWithStoratePath[] | null>(null)
  const outputs = ref<AnalysisOutputsWithStoratePath[] | null>(null)
  const analysis = ref<AnalysisDetail | null>(null)
  const workflow = ref<AnalysisWorkflow | null>(null)
  const pendingAnalysis = ref<boolean>(false)

  async function fetchInputs() {
    const analysisVal = toValue(analysisId)
    const userVal = toValue(user)
    if (!userVal) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized: User not found',
      })
    }
    if (!analysisVal) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Analysis not found',
      })
    }
    const { data, error } = await supabase
      .schema('galaxy')
      .from('analysis_inputs_with_storage_path')
      .select('*')
      .eq('analysis_id', analysisVal)
      .returns<AnalysisInputsWithStoratePath[]>()

    if (error) {
      throw createError({
        statusMessage: error.message,
        statusCode: Number.parseInt(error.code),
      })
    }
    if (data === null) {
      throw createError({ statusMessage: 'No input datasets found', statusCode: 404 })
    }
    return inputs.value = data
  }
  async function fetchOutputs() {
    const analysisVal = toValue(analysisId)
    const userVal = toValue(user)
    if (!userVal) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized: User not found',
      })
    }
    if (!analysisVal) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Analysis not found',
      })
    }
    const { data, error } = await supabase
      .schema('galaxy')
      .from('analysis_outputs_with_storage_path')
      .select('*')
      .eq('analysis_id', analysisVal)
      .returns<AnalysisOutputsWithStoratePath[]>()

    if (error) {
      throw createError({
        statusMessage: error.message,
        statusCode: Number.parseInt(error.code),
      })
    }
    if (data === null) {
      throw createError({ statusMessage: 'No output datasets found', statusCode: 404 })
    }
    return outputs.value = data
  }
  async function fetchAnalysis() {
    const analysisVal = toValue(analysisId)
    const userVal = toValue(user)
    if (!userVal) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized: User not found',
      })
    }
    if (!analysisVal) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Analysis not found',
      })
    }
    pendingAnalysis.value = true
    const { data, error } = await supabase
      .schema('galaxy')
      .from('analyses')
      .select(`
        *,
        histories(*),
        jobs(*),
        workflows(*)
        `)
      .eq('id', analysisVal)
      .returns<AnalysisDetail[]>()
    pendingAnalysis.value = false

    if (error) {
      throw createError({
        statusMessage: error.message,
        statusCode: Number.parseInt(error.code),
      })
    }
    if (data.length === 1) {
      return analysis.value = data[0]
    }
    else {
      throw createError({
        statusMessage: 'No analysis found',
        statusCode: 404,
      })
    }
  }

  async function fetchWorkflow() {
    const userVal = toValue(user)
    const analysisVal = toValue(analysis)
    if (!userVal) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized: User not found',
      })
    }
    if (!analysisVal) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Not Found: Analysis not found',
      })
    }
    const workflowIdVal = toValue(analysisVal.workflow_id)
    const { data, error } = await supabase
      .schema('galaxy')
      .from('workflows')
      .select('id, name, galaxy_id, definition')
      .eq('id', workflowIdVal)
      .limit(1)
      .single()
    if (data === null) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Not Found: Workflow not found',
      })
    }
    if (error) {
      throw createError({ statusCode: getStatusCode(error), statusMessage: getErrorMessage(error) })
    }
    workflow.value = data
  }

  watch(analysisId, () => {
    fetchInputs()
    fetchOutputs()
    fetchAnalysis()
  }, { immediate: true, deep: true })

  watch(analysis, () => {
    fetchWorkflow()
  })

  return { inputs, outputs, analysis, workflow, refresh: fetchAnalysis, pendingAnalysis }
}
