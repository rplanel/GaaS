<script setup lang="ts">
// import type { SupabaseTypes } from '#build/types/database'
// import type { RealtimeChannel } from '@supabase/supabase-js'
// import type { GalaxyTypes } from '#build/types/nuxt-galaxy'
// import { useGalaxyDecodeParameters } from '../../composables/galaxy/useGalaxyDecodeParameters'

// type Database = SupabaseTypes.Database

// definePageMeta({
//   middleware: 'auth',
// })
// let historiesChannel: RealtimeChannel
// let jobsChannel: RealtimeChannel
// let analysisOutputsChannel: RealtimeChannel

const route = useRoute()
// const supabase = useSupabaseClient<Database>()
// const workflowParametersModel = ref<
//   | Record<string, Record<string, string | string[] | Record<string, any>>>
//   | undefined
// >(undefined)

const analysisId = ref<number | undefined>(undefined)

// const analysisId = computed(() => {
//   if (route?.params && 'analysisId' in route.params) {
//     const analysisId = route?.params?.analysisId
//     if (Array.isArray(analysisId))
//       return 0
//     if (analysisId !== undefined) {
//       return Number.parseInt(analysisId)
//     }
//     debugger
//     return analysisId
//   }
//   return undefined
// })

watch(() => {
  if (route?.params && 'analysisId' in route.params) {
    const analysisIdParam = route.params.analysisId
    if (Array.isArray(analysisIdParam)) {
      return 0
    }
    if (analysisIdParam !== undefined) {
      return Number.parseInt(analysisIdParam as string)
    }
    return route.params.analysisId
  }
}, (newAnalysisId) => {
  if (newAnalysisId !== undefined) {
    analysisId.value = Number.parseInt(newAnalysisId as string)
  }
  else {
    analysisId.value = undefined
  }
}, { immediate: true, deep: true })

const {
  analysis,
  refresh: refreshAnalysis,
} = useAnalysisDetails(analysisId)

useSupabaseRealtime(`histories:${toValue(analysisId)}`, 'histories', handleUpdates)
useSupabaseRealtime(`jobs:${toValue(analysisId)}`, 'jobs', handleUpdates)
useSupabaseRealtime(`analysis_outputs:${toValue(analysisId)}`, 'analysis_outputs', handleUpdates)
// Listen to job updates
// Fetch data

function handleUpdates() {
  refreshAnalysis()
}

// const analysisParameters = computed(() => {
//   const analysisVal = toValue(analysis)
//   if (analysisVal) {
//     return analysisVal.parameters
//   }
//   return undefined
// })

// const { decodedParameters } = useGalaxyDecodeParameters(
//   analysisParameters,
// )

// watchEffect(() => {
//   const dbAnalysisVal = toValue(analysis) as Record<string, any> | undefined
//   debugger
//   if (dbAnalysisVal) {
//     const { decodedParameters } = useGalaxyDecodeParameters(
//       dbAnalysisVal.parameters,
//     )
//     workflowParametersModel.value = toValue(decodedParameters)
//   }
// })
</script>

<template>
  <NuxtPage :analysis-id :workflow-id="analysis?.workflow_id" />
</template>
