<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui'
import UsageRangeFilter from '../../components/usage/UsageRangeFilter.vue'
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

// the URL holds which range is on screen, so the filter control and this query
// read the same source and a link carries the view it was copied from
const { range } = useUsageFilters()

// refetch, not refresh: refresh honours the stale window, so pressing the
// button moments after the page loaded would return the cached numbers.
const { data: stats, isLoading, error, refetch } = useQuery(() => ownUsageStatisticsQuery(range.value))

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
      >
        <template #filters>
          <UsageRangeFilter />
        </template>
      </UsageStatisticsPanel>
    </UPageBody>
  </div>
</template>
