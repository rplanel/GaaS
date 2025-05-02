<script setup lang="ts">
import type { SanitizedWorkflowDbItem } from '../../types'

interface Props {
  workflows?: SanitizedWorkflowDbItem[] | null
}
const props = withDefaults(defineProps<Props>(), { workflows: undefined })
const route = useRoute()
const { workflows } = toRefs(props)

const workflowId = computed(() => {
  if (route?.params && 'workflowId' in route.params) {
    const workflowId = route.params.workflowId
    if (Array.isArray(workflowId))
      return 0
    if (workflowId) {
      return Number.parseInt(workflowId)
    }
    return workflowId
  }
  return undefined
})
</script>

<template>
  <div class="overflow-y-auto divide-y divide-(--ui-border)">
    <div
      v-for="(workflow, index) in workflows" :key="index"
    >
      <NuxtLink

        :to="`/workflows/${workflow.id}/run`"
      >
        <div
          class="p-4 sm:px-6 cursor-pointer border-l-2 transition-colors"
          :class="[
            workflowId && workflowId === workflow.id ? 'border-(--ui-primary) bg-(--ui-primary)/10' : 'border-(--ui-bg) hover:border-(--ui-primary) hover:bg-(--ui-primary)/5',
          ]"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3 font-bold">
              {{ workflow.name }}
            </div>
            <span><VersionBadge :version="workflow.version_key.toString()" /></span>
          </div>
          <p class="text-(--ui-text-dimmed) text-sm">
            {{ workflow.definition.annotation }}
          </p>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
