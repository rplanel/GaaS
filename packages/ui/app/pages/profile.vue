<script setup lang="ts">
const breadcrumbsItems = ref([
  {
    icon: 'lucide:house',
    disabled: false,
    to: '/',
  },
  {
    label: 'Profile',
    disabled: true,
    to: '/profile',
  },
])
</script>

<template>
  <UDashboardPanel id="profile-panel" title="User Profile">
    <template #header>
      <UDashboardNavbar title="User Profile" :ui="{ right: 'gap-3' }">
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
