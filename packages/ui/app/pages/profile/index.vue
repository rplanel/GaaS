<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui'
import UsageStatTile from '../../components/usage/UsageStatTile.vue'
import { getHumanSize } from '../../utils'
import { formatSuccessRate } from '../../utils/usageStatistics'

defineProps<{
  breadcrumbsItems?: BreadcrumbItem[] | undefined
}>()

const user = useSupabaseUser()
const { diskUsage } = useDiskUsage()
const storageUsed = computed(() => getHumanSize(toValue(diskUsage)))

const { data: stats, error } = useQuery(() => ownUsageStatisticsQuery())

const successRate = computed(() => (stats.value ? formatSuccessRate(stats.value) : undefined))

const pageHeaderProps = {
  title: 'User Profile',
  description: 'Your account, and a summary of what you have run',
}
</script>

<template>
  <div>
    <PageHeader :page-header-props icon="i-lucide-user" :breadcrumbs-items="breadcrumbsItems" />
    <UPageBody>
      <div class="flex flex-col gap-8">
        <section class="flex flex-col gap-3">
          <h2 class="text-sm font-semibold">
            Account
          </h2>
          <div class="grid gap-3 sm:grid-cols-2">
            <UsageStatTile label="Signed in as" icon="i-lucide-mail">
              <span class="truncate font-medium">{{ user?.email ?? 'Not signed in' }}</span>
            </UsageStatTile>

            <UsageStatTile label="Storage used" :value="storageUsed" icon="i-lucide-hard-drive" />
          </div>
        </section>

        <section class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-sm font-semibold">
              Usage
            </h2>
            <UButton
              to="/profile/usage"
              variant="link"
              size="sm"
              label="All usage statistics"
              trailing-icon="i-lucide-arrow-right"
            />
          </div>

          <p v-if="error" class="text-sm text-muted">
            Usage statistics are unavailable right now.
          </p>

          <div v-else class="grid gap-3 sm:grid-cols-2">
            <template v-if="stats && successRate">
              <UsageStatTile
                label="Analyses run"
                :value="String(stats.total)"
                icon="i-lucide-layers"
                to="/profile/usage"
              />
              <UsageStatTile
                label="Success rate"
                :value="successRate.label"
                :tooltip="successRate.tooltip"
                icon="i-lucide-percent"
                to="/profile/usage"
              />
            </template>
            <template v-else>
              <!-- both tiles arrive together, so a dash here would read as "no value" rather than "loading" -->
              <USkeleton class="h-22" />
              <USkeleton class="h-22" />
            </template>
          </div>
        </section>
      </div>
    </UPageBody>
  </div>
</template>
