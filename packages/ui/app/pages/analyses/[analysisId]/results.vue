<script setup lang="ts">
import type { Database } from 'nuxt-galaxy'

definePageMeta({
  name: 'analysis-results',
})

const supabase = useSupabaseClient<Database>()
const route = useRoute('analysis-results')
const analysisId = computed(() => {
  const idParam = route.params.analysisId
  return Number.parseInt(idParam as string)
})
const { data: analysis, isPending: analysisPending } = useQuery(
  () => analysisByIdWithOutputsAndWorkflowsQuery({ id: analysisId.value, supabase }),
)

const { view } = useResultsView(() => {
  const workflow = analysis.value?.workflows
  return workflow ? { name: workflow.name_key, version: workflow.version_key } : undefined
})
</script>

<template>
  <div>
    <USeparator label="Results" />
    <UPageCard variant="ghost" :ui="{ container: 'lg:grid-cols-1' }">
      <template v-if="analysisPending">
        <USkeleton class="h-20 w-full" />
        <USkeleton class="h-20 w-full" />
        <USkeleton class="h-20 w-full" />
      </template>

      <template v-else-if="!analysis">
        <UAlert
          icon="i-lucide:alert-triangle" color="error" variant="subtle" title="Analysis not found"
          description="The requested analysis could not be loaded."
        />
      </template>

      <template v-else>
        <!-- A view that throws stays inside this boundary; the analysis page around it keeps working. -->
        <NuxtErrorBoundary :key="analysisId">
          <component :is="view.component" v-if="view" :analysis-id="analysisId" />
          <WorkflowResultGeneric v-else :analysis-id="analysisId" />

          <template #error="{ error, clearError }">
            <UAlert
              icon="i-lucide:alert-triangle" color="error" variant="subtle" title="The results view failed"
              :description="error instanceof Error ? error.message : String(error)"
              :actions="[{ label: 'Try again', color: 'neutral', variant: 'outline', onClick: clearError }]"
            />
          </template>
        </NuxtErrorBoundary>
      </template>

      <NuxtPage />
    </UPageCard>
  </div>
</template>
