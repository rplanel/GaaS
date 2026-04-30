<script setup lang="ts">
import type { Database } from 'nuxt-galaxy'

const supabase = useSupabaseClient<Database>()
const route = useRoute()
const analysisId = computed(() => {
  const idParam = route.params.analysisId
  if (Array.isArray(idParam)) {
    return Number.parseInt(idParam[0])
  }
  return Number.parseInt(idParam as string)
})
const { data: analysis, isPending: analysisPending } = useQuery(
  () => analysisByIdWithOutputsAndWorkflowsQuery({ id: analysisId.value, supabase }),
)

const workflowSlug = computed(() => {
  return analysis.value?.workflows?.workflow_slug ?? 'generic'
})

const { component, componentName, isCustom } = useWorkflowResultResolver({
  workflowSlug,
})

const targetComponentName = computed(() => {
  return isCustom.value ? undefined : componentName.value
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
        <component
          :is="component" :analysis-id="analysisId" :workflow-slug="workflowSlug"
          :target-component-name="targetComponentName"
        />
      </template>

      <NuxtPage />
    </UPageCard>
  </div>
</template>
