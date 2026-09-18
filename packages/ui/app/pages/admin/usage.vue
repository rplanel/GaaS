<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui'
import type { Database } from 'nuxt-galaxy'
import AdminPermissionAlert from '../../components/admin/PermissionAlert.vue'
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
    { label: 'Usage', disabled: true, to: '/admin/usage' },
  ]
})

const supabase = useSupabaseClient<Database>()
const { userRole } = useUserRole(supabase)
const isAdmin = computed(() => userRole.value === 'admin')

// The endpoint answers 403 to anyone else, so asking before the role claim says
// admin only buys a refusal. The claim is still only a hint: should it disagree
// with the server, the 403 arrives as an error state below.
// refetch, not refresh: refresh honours the stale window, so pressing the
// button moments after the page loaded would return the cached numbers.
// a plain boolean, not a getter: options built by a getter are read reactively
// already, and the type drops the ref forms there
const { data: stats, isLoading, error, refetch } = useQuery(() => ({
  ...globalUsageStatisticsQuery(),
  enabled: isAdmin.value,
}))

const { errorMessage } = useErrorMessage(error)
const failureMessage = computed(() => (error.value ? errorMessage.value : undefined))

const pageHeaderProps = {
  title: 'Usage',
  description: 'How much everyone has run, how it turned out, and which workflows were used',
}
</script>

<template>
  <div>
    <PageHeader :page-header-props icon="i-lucide-chart-column" :breadcrumbs-items="computedBreadcrumbsItems" />
    <UPageBody>
      <UsageStatisticsPanel
        v-if="isAdmin"
        :stats="stats"
        :is-loading="isLoading"
        :error-message="failureMessage"
        @refresh="refetch"
      >
        <!-- an administrator reading global usage is not the person who would go and run a workflow, so no invitation to -->
        <template #empty>
          <p data-testid="usage-empty" class="p-8 text-center text-sm text-muted">
            No analyses have been run yet
          </p>
        </template>
      </UsageStatisticsPanel>

      <AdminPermissionAlert v-else />
    </UPageBody>
  </div>
</template>
