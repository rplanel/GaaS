<script setup lang="ts">
const route = useRoute()

const analysisId = ref<number | undefined>(undefined)

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

function handleUpdates() {
  refreshAnalysis()
}
</script>

<template>
  <NuxtPage :analysis-id :workflow-id="analysis?.workflow_id" />
</template>
