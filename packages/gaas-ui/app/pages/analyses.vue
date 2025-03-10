<script setup lang="ts">
const { analysesList } = inject('analysesList')
</script>

<template>
  <UDashboardPanel id="analyses-list-panel" title="Analyses" :default-size="25" :min-size="20" :max-size="35" resizable>
    <UDashboardNavbar title="Analyses">
      <template #leading>
        <UDashboardSidebarCollapse />
      </template>
      <template #trailing>
        <UBadge :label="analysesList?.length ?? 0" variant="subtle" />
      </template>
      <template #right>
        <UButton icon="i-lucide-plus" size="md" class="rounded-full" to="/workflows" />
      </template>
    </UDashboardNavbar>
    <AnalysisListPanel />
  </UDashboardPanel>
  <NuxtPage />
</template>
