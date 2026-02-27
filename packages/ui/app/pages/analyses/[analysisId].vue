<script setup lang="ts">
import type { Database, WorkflowRow } from 'nuxt-galaxy'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { analysisByIdWithOutputsAndWorkflowsQuery } from '../../utils/queries/supabase'

const router = useRouter()
const route = useRoute()
const { gaasUi: { resultsMenuItems, analyisParametersMenuItems } } = useAppConfig()
const supabase = useSupabaseClient<Database>()
const analysisId = ref<number | undefined>(undefined)
const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('lg')
const isOpen = ref(true)

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
  const items = [{ ...analyisParametersMenuItems, to: {
    name: 'analyses-analysisId',
    params: {
      analysisId: analysisIdVal,
    },
  } }]
  if (!workflowVal || workflowTagVersion === null || workflowTagName === null) {
    return items
  }
  // const workflowTagVersion = bt.getWorkflowTagVersion(workflowVal.tags)
  // const workflowTagName = bt.getWorkflowTagName(workflowVal.tags)
  const workflowTagVersionVal = toValue(workflowTagVersion)
  const workflowTagNameVal = toValue(workflowTagName)
  const resultItems = resultsMenuItems?.[workflowTagNameVal]?.[workflowTagVersionVal]
  if (!Array.isArray(resultItems)) {
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
  <UDashboardPanel :id="`history-panel-${analysisIdFromRoute}`" class="overflow-auto">
    <template #header>
      <UDashboardNavbar v-if="analysis" :title="analysis.name" :toggle="true">
        <template #leading>
          <UButton
            icon="i-lucide-x" color="neutral" variant="ghost" class="-ms-1.5"
            @click="router.push('/analyses')"
          />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <template #left>
          <UNavigationMenu :items="computedResultsMenuItems" highlight class="-mx-1 flex-1" />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <NuxtPage :analysis="analysis" :workflow :workflow-id="workflow?.id" :analysis-id="analysisId" />
      <AnalysisHistoryPanel v-if="analysisId" :analysis-id="analysisId" @close="router.push('/analyses')" />
      <USlideover v-if="isMobile" v-model:open="isOpen">
        <template #content>
          <AnalysisHistoryPanel v-if="analysisId" :analysis-id="analysisId" @close="router.push('/analyses')" />
        </template>
      </USlideover>
    </template>
  </UDashboardPanel>
</template>
