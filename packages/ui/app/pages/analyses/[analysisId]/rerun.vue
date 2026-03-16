<script setup lang="ts">
import type { Database } from 'nuxt-galaxy'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'

const route = useRoute()
const router = useRouter()
const supabase = useSupabaseClient<Database>()

const analysisIdFromRoute = computed(() => {
  if ('analysisId' in route.params) {
    return Number.parseInt(route.params.analysisId as string)
  }
  return undefined
})

const { data: analysis } = useQuery(
  () => analysisByIdWithOutputsAndWorkflowsQuery({ id: toValue(analysisIdFromRoute), supabase }),
)

const workflow = computed(() => {
  const analysisVal = toValue(analysis)
  return analysisVal?.workflows
})

const workflowId = computed(() => workflow.value?.id)
const analysisId = computed(() => toValue(analysisIdFromRoute))

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('lg')
const isWorkflowRunPanelOpen = ref(true)
</script>

<template>
  <WorkflowRunPanel v-if="workflowId" :workflow-id="workflowId" :analysis-id="analysisId" @close="router.push('/analyses')" />
  <USlideover v-if="isMobile" v-model:open="isWorkflowRunPanelOpen">
    <template #content>
      <WorkflowRunPanel v-if="workflowId" :workflow-id="workflowId" :analysis-id="analysisId" @close="router.push('/analyses')" />
    </template>
  </USlideover>
</template>
