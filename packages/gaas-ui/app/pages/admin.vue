<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
})
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
  <UDashboardPanel id="admin" title="Admin">
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
