import type { AsyncDataExecuteOptions } from '#app/composables/asyncData'
import type { Ref } from '#imports'
import type { QueryData } from '@supabase/supabase-js'
import type { Database } from '../../../types/database'
import type { AnalysisDetail, AnalysisInputWithStoragePathRow, AnalysisOutputWithStoragePath } from '../../../types/nuxt-galaxy'
import { ref, toValue, useSupabaseClient, useSupabaseUser, watch } from '#imports'

export function useDatabaseAnalysisDetails(analysisId: Ref<number | undefined>): {
  inputs: Ref<AnalysisInputWithStoragePathRow[] | null>
  outputs: Ref<AnalysisOutputWithStoragePath[] | null>
  analysis: Ref<AnalysisDetail | null>
  pendingAnalysis: Ref<boolean>
  refresh: (opts?: AsyncDataExecuteOptions) => void
  error: Ref<Error | undefined>
} {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()
  const inputs = ref<AnalysisInputWithStoragePathRow[] | null>(null)
  const outputs = ref<AnalysisOutputWithStoragePath[] | null>(null)
  const analysis = ref<AnalysisDetail | null>(null)
  const pendingAnalysis = ref<boolean>(false)
  const error = ref<Error | undefined>(undefined)

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
      error.value = new Error('User is not defined')
      return
    }
    if (!analysisVal) {
      error.value = new Error('Analysis ID is not defined')
      return
    }
    // const { data, error: supabaseError }

    const analysisInputsWithStoragePathQuery = supabase
      .schema('galaxy')
      .from('analysis_inputs_with_storage_path')
      .select('*')
      .eq('analysis_id', analysisVal)

    type AnalysisInputsWithStoragePath = QueryData<typeof analysisInputsWithStoragePathQuery>

    const { data, error: supabaseError } = await analysisInputsWithStoragePathQuery

    if (supabaseError) {
      error.value = supabaseError
      return
    }

    const analysisInputsWithStoragePath: AnalysisInputsWithStoragePath = data
    if (analysisInputsWithStoragePath === null) {
      error.value = new Error('No output datasets found')
      return
    }
    return inputs.value = analysisInputsWithStoragePath
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
      error.value = new Error('User is not defined')
      return
    }
    if (!analysisVal) {
      error.value = new Error('Analysis ID is not defined')
      return
    }
    const { data, error: supabaseError } = await supabase
      .schema('galaxy')
      .from('analysis_outputs_with_storage_path')
      .select('*')
      .eq('analysis_id', analysisVal)
      .overrideTypes<AnalysisOutputWithStoragePath[]>()

    if (supabaseError) {
      error.value = supabaseError
      return
    }
    if (data === null) {
      error.value = new Error('No output datasets found')
      return
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
      error.value = new Error('User is not defined')
      return
    }
    if (!analysisVal) {
      error.value = new Error('Analysis ID is not defined')
      return
    }
    pendingAnalysis.value = true
    const { data, error: supabaseError } = await supabase
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
    if (supabaseError) {
      error.value = supabaseError
      return
    }
    if (data.length === 1) {
      return analysis.value = data[0] as AnalysisDetail
    }
    else {
      error.value = new Error('No output datasets found')
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
    error,
  }
}
