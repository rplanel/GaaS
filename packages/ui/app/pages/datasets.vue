<script setup lang="ts">
// import type { SupabaseTypes } from '#build/types/database'
import type { BreadcrumbItem } from '#ui/types'

// type Database = SupabaseTypes.Database

const breadcrumbsItems = ref<BreadcrumbItem[]>([
  {
    icon: 'lucide:house',
    disabled: false,
    to: '/',
  },
  {
    label: 'Datasets',
    disabled: true,
    to: '/datasets',
  },
])
</script>

<template>
  <UDashboardPanel id="datasets-panel" title="Datasets">
    <template #header>
      <UDashboardNavbar title="Datasets" :ui="{ right: 'gap-3' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <UPage>
        <NuxtPage :breadcrumbs-items="breadcrumbsItems" />
      </UPage>
    </template>
  </UDashboardPanel>
</template>
