<script setup lang="ts">
import type { Database, WorkflowRow } from 'nuxt-galaxy'
import { format } from 'date-fns'
import { useDefinedBreakpoints } from '../../composables/useDefinedBreakpoints'

const router = useRouter()
const route = useRoute()
const { gaasUi: { resultsMenuItems, analyisParametersMenuItems } } = useAppConfig()
const supabase = useSupabaseClient<Database>()
const analysisId = ref<number | undefined>(undefined)
const isOpen = ref(true)
const { isSmallDesktopOrMobile } = useDefinedBreakpoints()
const analysisIdFromRoute = computed(() => {
  if ('analysisId' in route.params) {
    const analysisIdParam = route.params.analysisId
    return Number.parseInt(analysisIdParam as string)
  }
  return undefined
})

const { data: analysis, refresh: refreshAnalysis } = useQuery(
  () => analysisByIdWithOutputsAndWorkflowsQuery({ id: toValue(analysisIdFromRoute), supabase }),
)

const workflow = computed<WorkflowRow | undefined>(() => {
  const analysisVal = toValue(analysis)
  if (!analysisVal) {
    return undefined
  }
  return analysisVal.workflows
})

export type WorkflowFromAnalysis = typeof workflow.value

const { workflowTagName, workflowTagVersion } = useDatabaseWorkflow({
  workflow,
})

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

useSupabaseRealtime(`histories:${toValue(analysisIdFromRoute)}`, 'histories', handleUpdates)
useSupabaseRealtime(`jobs:${toValue(analysisIdFromRoute)}`, 'jobs', handleUpdates)
useSupabaseRealtime(`analysis_outputs:${toValue(analysisIdFromRoute)}`, 'analysis_outputs', handleUpdates)

function handleUpdates() {
  refreshAnalysis()
}

const computedResultsMenuItems = computed(() => {
  const analysisIdVal = toValue(analysisIdFromRoute)
  const workflowVal = toValue(workflow)

  const items = analyisParametersMenuItems
    ? [{ ...analyisParametersMenuItems, to: {
        name: 'analyses-analysisId',
        params: {
          analysisId: analysisIdVal,
        },
      } }]
    : []
  if (!workflowVal || workflowTagVersion === null || workflowTagName === null) {
    return items
  }
  const workflowTagVersionVal = toValue(workflowTagVersion)
  const workflowTagNameVal = toValue(workflowTagName)
  if (!workflowTagVersionVal || !workflowTagNameVal) {
    return items
  }
  const resultItems = resultsMenuItems?.[workflowTagNameVal]?.[workflowTagVersionVal]
  if (!resultItems || !Array.isArray(resultItems)) {
    return items
  }
  return [
    ...items,
    ...resultItems.map(item => ({
      ...item,
      to: `/analyses/${analysisIdVal}/${item.to}`,
    })).reverse(),
  ]
})
</script>

<template>
  <UDashboardPanel :id="`history-panel-${analysisIdFromRoute}`" class="overflow-auto" :min-size="60">
    <template #header>
      <UDashboardNavbar v-if="analysis" :title="analysis.name" :toggle="true">
        <template #leading>
          <UButton
            icon="i-lucide-x" color="neutral" variant="ghost" class="-ms-1.5"
            @click="router.push('/analyses')"
          />
        </template>
        <template #default>
          {{ format(new Date(analysis.created_at), 'dd MMM HH:mm') }}
        </template>
        <template #right>
          <UTooltip text="Rename Analysis">
            <UButton color="neutral" variant="ghost" icon="i-lucide-pen" />
          </UTooltip>
          <UTooltip text="Run Again">
            <UButton color="neutral" variant="ghost" icon="i-lucide:refresh-ccw" />
          </UTooltip>
          <UTooltip text="Delete Analysis">
            <UButton color="error" variant="ghost" icon="i-lucide-trash" />
          </UTooltip>
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar v-if="computedResultsMenuItems?.length > 0">
        <template #left>
          <UNavigationMenu :items="computedResultsMenuItems" highlight class="-mx-1 flex-1" />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <USlideover v-if="isSmallDesktopOrMobile" v-model:open="isOpen">
        <template #content>
          <AnalysisHistoryPanel v-if="analysisId" :analysis-id="analysisId" @close="router.push('/analyses')" />
          <NuxtPage />
        </template>
      </USlideover>
      <template v-else>
        <AnalysisHistoryPanel v-if="analysisId" :analysis-id="analysisId" @close="router.push('/analyses')" />
        <NuxtPage />
      </template>
    </template>
  </UDashboardPanel>
</template>
