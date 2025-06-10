<script setup lang="ts">
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'

interface Props {
  analysisId: number
  workflowId: number
}
const props = withDefaults(defineProps<Props>(), {
})

const analysisId = toRef(() => props.analysisId)
const workflowId = toRef(() => props.workflowId)

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('lg')
const isWorkflowRunPanelOpen = ref(true)
const router = useRouter()
</script>

<template>
  <WorkflowRunPanel v-if="workflowId" :workflow-id="workflowId" :analysis-id="analysisId" @close="router.push('/analyses')" />
  <ClientOnly>
    <USlideover v-if="isMobile" v-model:open="isWorkflowRunPanelOpen">
      <template #content>
        <WorkflowRunPanel v-if="workflowId" :workflow-id="workflowId" :analysis-id="analysisId" @close="router.push('/analyses')" />
      </template>
    </USlideover>
  </ClientOnly>
</template>
