<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui'

withDefaults(defineProps<Props>(), { breadcrumbsItems: undefined })

interface Props {
  breadcrumbsItems?: BreadcrumbItem[] | undefined
  // workflowId: number
}
const route = useRoute()

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
  <NuxtPage :workflow-id />
</template>
