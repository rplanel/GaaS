<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui'
import UsageStatisticsPanel from '../../components/usage/UsageStatisticsPanel.vue'

const props = withDefaults(defineProps<{
  breadcrumbsItems?: BreadcrumbItem[] | undefined
}>(), {
  breadcrumbsItems: undefined,
})

const computedBreadcrumbsItems = computed(() => {
  if (!props.breadcrumbsItems) {
    return props.breadcrumbsItems
  }

  return [
    ...props.breadcrumbsItems.map(item => ({ ...item, disabled: false })),
    { label: 'Usage', disabled: true, to: '/profile/usage' },
  ]
})

// refetch, not refresh: refresh honours the stale window, so pressing the
// button moments after the page loaded would return the cached numbers.
const { data: stats, isLoading, error, refetch } = useQuery(() => ownUsageStatisticsQuery())

const { errorMessage } = useErrorMessage(error)
const failureMessage = computed(() => (error.value ? errorMessage.value : undefined))

const pageHeaderProps = {
  title: 'Usage',
  description: 'How much you have run, how it turned out, and which workflows you used',
}
</script>

<template>
  <div>
    <PageHeader :page-header-props icon="i-lucide-chart-column" :breadcrumbs-items="computedBreadcrumbsItems" />
    <UPageBody>
      <UsageStatisticsPanel
        :stats="stats"
        :is-loading="isLoading"
        :error-message="failureMessage"
        @refresh="refetch"
      />
    </UPageBody>
  </div>
</template>
