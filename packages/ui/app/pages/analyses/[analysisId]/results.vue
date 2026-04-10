<script lang="ts" setup>
import type { Database } from 'nuxt-galaxy'

const route = useRoute()
const supabase = useSupabaseClient<Database>()

const analysisId = computed(() => {
  if ('analysisId' in route.params) {
    const analysisIdParam = route.params.analysisId
    return Number.parseInt(analysisIdParam as string)
  }
  return undefined
})

const { data: outputs, refresh: _refreshOutputs } = useQuery(() => {
  const id = analysisId.value
  if (!id) {
    return undefined
  }
  return analysisOutputsViewByIdQuery({ analysisId: id, supabase })
})

const { data: analysis } = useQuery(
  () => analysisByIdWithOutputsAndWorkflowsQuery({ id: toValue(analysisId), supabase }),
)

const resultRoutes = computed<Record<string, { tag: string, to: string }>>(() => {
  const analysisVal = toValue(analysis)
  const analysisIdVal = toValue(analysisId)
  if (!analysisVal?.analysis_outputs || !analysisIdVal) {
    return {}
  }
  const routes: Record<string, { tag: string, to: string }> = {}
  for (const output of analysisVal.analysis_outputs) {
    if (!output.tags || output.tags.length === 0) {
      continue
    }
    const tag = output.tags.map(t => t.label).sort().join('-')
    if (tag) {
      routes[output.datasets.id] = { tag, to: `/analyses/${analysisIdVal}/results/${tag}` }
    }
  }
  return routes
})

const sortedOutputs = computed(() => {
  const outputsVal = toValue(outputs)
  if (outputsVal) {
    return [...outputsVal].sort((a, b) => {
      if (a.dataset_name === null && b.dataset_name === null)
        return 0
      if (a.dataset_name === null)
        return 1
      if (b.dataset_name === null)
        return -1
      return a.dataset_name.localeCompare(b.dataset_name)
    })
  }
  return []
})
</script>

<template>
  <div>
    <UPageCard title="Outputs" variant="ghost" :ui="{ container: 'lg:grid-cols-1' }">
      <GalaxyAnalysisIoDatasetsList :items="sortedOutputs" :result-routes="resultRoutes" />
    </UPageCard>

    <NuxtPage />
  </div>
</template>

<style></style>
