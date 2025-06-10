import type { AsyncDataExecuteOptions } from '#app/composables/asyncData'
import type { Ref } from '#imports'
import type { Database } from '../../types/database'
import type { AnalysisDetail, AnalysisInputsWithStoratePath, AnalysisOutputsWithStoratePath } from '../../types/nuxt-galaxy'
import { createError, ref, toValue, useSupabaseClient, useSupabaseUser, watch } from '#imports'

export function useAnalysisDetails(analysisId: Ref<number | undefined>): {
  inputs: Ref<AnalysisInputsWithStoratePath[] | null>
  outputs: Ref<AnalysisOutputsWithStoratePath[] | null>
  analysis: Ref<AnalysisDetail | null>
  pendingAnalysis: Ref<boolean>
  refresh: (opts?: AsyncDataExecuteOptions) => void
} {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()
  const inputs = ref<AnalysisInputsWithStoratePath[] | null>(null)
  const outputs = ref<AnalysisOutputsWithStoratePath[] | null>(null)
  const analysis = ref<AnalysisDetail | null>(null)
  const pendingAnalysis = ref<boolean>(false)

  /**
   * fetch the input datasets of the analysis and put it in the `inputs` ref.
   * @throws 401 Unauthorized if the user is not found
   * @throws 404 Not Found if the analysis is not found or no input datasets are found
   * @throws 500 Internal Server Error if there is an error fetching the input datasets
   */
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
      .overrideTypes<AnalysisInputsWithStoratePath[]>()

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

  /**
   * fetch the output datasets of the analysis and put it in the `outputs` ref.
   * @throws 401 Unauthorized if the user is not found
   * @throws 404 Not Found if the analysis is not found or no output datasets are found
   * @throws 500 Internal Server Error if there is an error fetching the output datasets
   */
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
      .overrideTypes<AnalysisOutputsWithStoratePath[]>()

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

  /**
   * fetch the analysis details and put it in the `analysis` ref.
   * @throws 401 Unauthorized if the user is not found
   * @throws 404 Not Found if the analysis is not found
   * @throws 500 Internal Server Error if there is an error fetching the analysis details
   *
   */
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
      .overrideTypes<AnalysisDetail[]>()

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

  watch(analysisId, () => {
    fetchInputs()
    fetchOutputs()
    fetchAnalysis()
  }, { immediate: true })

  return {
    inputs,
    outputs,
    analysis,
    refresh: fetchAnalysis,
    pendingAnalysis,
  }
}
