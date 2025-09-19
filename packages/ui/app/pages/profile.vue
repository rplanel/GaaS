<script setup lang="ts">
import { getHumanSize } from '../utils'

const user = useSupabaseUser()
const { diskUsage } = useDiskUsage()
const fileSize = getHumanSize(diskUsage.value)
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="User Profile">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div>
        <UBadge :label="fileSize" />
      </div>
      {{ fileSize }}
      <pre>{{ user }}</pre>
    </template>
  </UDashboardPanel>
</template>
