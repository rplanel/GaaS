<script setup lang="ts">
import type { SupabaseTypes } from '#build/types/database'
// import type { GalaxyTypes } from '#build/types/nuxt-galaxy'
import { useGalaxyDecodeParameters } from '../../composables/galaxy/useGalaxyDecodeParameters'

type Database = SupabaseTypes.Database

// definePageMeta({
//   middleware: 'auth',
// })
const route = useRoute()
const supabase = useSupabaseClient<Database>()
const workflowParametersModel = ref<
  | Record<string, Record<string, string | string[] | Record<string, any>>>
  | undefined
>(undefined)
const analysisId = computed(() => {
  if (route?.params && 'analysisId' in route.params) {
    const analysisId = route?.params?.analysisId
    if (Array.isArray(analysisId))
      return 0
    if (analysisId !== undefined) {
      return Number.parseInt(analysisId)
    }
    return analysisId
  }
  return undefined
})

const {
  // outputs,
  analysis,
  refresh: refreshAnalysis,
  // inputs
} = useAnalysisDatasetIO(analysisId)

// Listen to job updates
supabase
  .channel('histories')
  .on(
    'postgres_changes',
    { event: '*', schema: 'galaxy', table: 'histories' },
    handleUpdates,
  )
  .subscribe()

supabase
  .channel('jobs')
  .on(
    'postgres_changes',
    { event: '*', schema: 'galaxy', table: 'jobs' },
    handleUpdates,
  )
  .subscribe()

supabase
  .channel('analysis_outputs')
  .on(
    'postgres_changes',
    { event: '*', schema: 'galaxy', table: 'analysis_outputs' },
    () => {
      handleUpdates()
    },
  )
  .subscribe()

// Fetch data

function handleUpdates() {
  refreshAnalysis()
}

watchEffect(() => {
  const dbAnalysisVal = toValue(analysis) as Record<string, any> | undefined
  if (dbAnalysisVal) {
    const { decodedParameters } = useGalaxyDecodeParameters(
      dbAnalysisVal.parameters,
    )
    workflowParametersModel.value = toValue(decodedParameters)
  }
})
</script>

<template>
  <NuxtPage :analysis-id :workflow-id="analysis?.workflow_id" />
</template>
