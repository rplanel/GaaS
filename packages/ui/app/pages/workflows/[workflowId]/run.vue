<script setup lang="ts">
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'

interface Props {
  workflowId?: number | undefined
}
withDefaults(defineProps<Props>(), { workflowId: undefined })

// definePageMeta({
//   middleware: 'auth',
// })
const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('lg')
const isWorkflowRunPanelOpen = ref(true)
const router = useRouter()
</script>

<template>
  <WorkflowRunPanel v-if="workflowId" :workflow-id="workflowId" @close="router.push('/workflows')" />
  <ClientOnly>
    <USlideover v-if="isMobile" v-model:open="isWorkflowRunPanelOpen">
      <template #content>
        <WorkflowRunPanel v-if="workflowId" :workflow-id="workflowId" @close="router.push('/workflows')" />
      </template>
    </USlideover>
  </ClientOnly>
</template>
