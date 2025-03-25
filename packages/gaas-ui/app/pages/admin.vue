<script setup lang="ts">
const breadcrumbsItems = ref([
  {
    icon: 'lucide:house',
    disabled: false,
    to: '/',
  },
  {
    label: 'Admin',
    disabled: true,
    to: '/admin',
  },
])
</script>

<template>
  <UDashboardPanel id="admin-panel" title="Admin">
    <template #header>
      <UDashboardNavbar title="Admin" :ui="{ right: 'gap-3' }">
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
