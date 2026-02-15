<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'
import type { Database } from 'nuxt-galaxy'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'

const router = useRouter()
const route = useRoute()
const { gaasUi: { resultsMenuItems, analyisParametersMenuItems } } = useAppConfig()

const analysisId = ref<number | undefined>(undefined)
const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('lg')
const isOpen = ref(true)
const user = useSupabaseUser()
const supabase = useSupabaseClient<Database>()

const analysisIdFromRoute = computed(() => {
  if ('analysisId' in route.params) {
    const analysisIdParam = route.params.analysisId
    return Number.parseInt(analysisIdParam as string)
  }
  return undefined
})

const { data: analysis, refresh: refreshAnalysis } = await useAsyncData(
  `analysis-${toValue(analysisIdFromRoute)}`,
  async () => {
    const userVal = toValue(user)
    const analysisIdVal = toValue(analysisIdFromRoute)
    if (!userVal) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Permission denied',
      })
    }
    if (!analysisIdVal) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Analysis not found',
      })
    }
    const analysesWithOutputsAndWorkflowQuery = supabase
      .schema('galaxy')
      .from('analyses')
      .select(
        `
          *,
          analysis_outputs(
            *,
            datasets(*),
            tags(*)
          ),
          workflows(
            *
          )
          `,
      )
      .eq('id', analysisIdVal)

    type AnalysesWithOutputsAndWorkflow = QueryData<typeof analysesWithOutputsAndWorkflowQuery>
    const { data, error } = await analysesWithOutputsAndWorkflowQuery.limit(1)
    if (error) {
      throw createError({
        statusMessage: error.message,
        statusCode: Number.parseInt(error.code),
      })
    }
    const analysesWithOutputsAndWorkflow: AnalysesWithOutputsAndWorkflow = data

    if (!analysesWithOutputsAndWorkflow || !analysesWithOutputsAndWorkflow[0]) {
      throw createError({
        statusMessage: 'Analysis not found',
        statusCode: 404,
      })
    }
    return analysesWithOutputsAndWorkflow[0]
  },
)

export type AnalysesWithOutputsAndWorkflow = typeof analysis.value

const workflow = computed(() => {
  const analysisVal = toValue(analysis)
  return analysisVal?.workflows
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
      <UDashboardNavbar
        v-if="analysis"
        :title="analysis.name"
        :toggle="true"
      >
        <template #leading>
          <UButton icon="i-lucide-x" color="neutral" variant="ghost" class="-ms-1.5" @click="router.push('/analyses')" />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <template #left>
          <UNavigationMenu :items="computedResultsMenuItems" highlight class="-mx-1 flex-1" />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <NuxtPage
        :analysis="analysis"
        :workflow
        :workflow-id="workflow?.id"
        :analysis-id="analysisId"
      />
      <AnalysisHistoryPanel v-if="analysisId" :analysis-id="analysisId" @close="router.push('/analyses')" />
      <USlideover v-if="isMobile" v-model:open="isOpen">
        <template #content>
          <AnalysisHistoryPanel v-if="analysisId" :analysis-id="analysisId" @close="router.push('/analyses')" />
        </template>
      </USlideover>
    </template>
  </UDashboardPanel>
</template>
