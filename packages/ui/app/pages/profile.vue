<script setup lang="ts">
import { computed } from 'vue'
import { getHumanSize } from '../utils'

const user = useSupabaseUser()
const { diskUsage, status, error, data, isLoading, isPending, state } = useDiskUsage()
const fileSize = computed(() => getHumanSize(diskUsage.value))
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
      <div class="mb-4 p-4 rounded text-sm font-mono">
        <div>state: {{ state }}</div>
        <div>status: {{ status }}</div>
        <div>isPending: {{ isPending }}</div>
        <div>isLoading: {{ isLoading }}</div>
        <div>data: {{ data }}</div>
        <div>error: {{ error }}</div>
        <div>diskUsage: {{ diskUsage }}</div>
      </div>
      <div>
        <UBadge :label="fileSize" />
      </div>
      {{ fileSize }}
      <pre>{{ user }}</pre>
    </template>
  </UDashboardPanel>
</template>
