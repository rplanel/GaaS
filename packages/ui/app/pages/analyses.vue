<script setup lang="ts">
import type { AnalysesListProvide } from '../layouts/default.vue'

const defaultSize = ref(25)
// const minMaxPanelSize = { min: 15, max: 50 }
const analysesListInjected = inject<AnalysesListProvide>('analysesList')
const { analysesList } = analysesListInjected || {}
$fetch('/sync')
</script>

<template>
  <UDashboardPanel id="analyses-list-panel" :default-size="defaultSize" :min-size="5" :max-size="30" resizable>
    <template #header>
      <UDashboardNavbar title="Analyses">
        <template #title>
          <div class="flex items-center gap-2">
            <span class="text-base font-semibold truncate">Analyses</span>
            <UBadge :label="analysesList?.length ?? 0" variant="subtle" size="xs" />
          </div>
        </template>
        <!-- <template #leading>
        <UDashboardSidebarCollapse />
      </template> -->
        <template #right>
          <UButton icon="i-lucide-plus" size="sm" color="neutral" variant="soft" to="/workflows" />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <AnalysisListPanel />
    </template>
  </UDashboardPanel>
  <NuxtPage />
</template>
