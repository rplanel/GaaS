<script setup lang="ts">
import type { AnalysesListProvide } from '../layouts/default.vue'

const collapsed = ref(false)

const analysesListInjected = inject<AnalysesListProvide>('analysesList')
const { analysesList } = analysesListInjected || {}
$fetch('/sync')
</script>

<template>
  <UDashboardSidebar
    id="analyses-list-panel"
    v-model:collapsed="collapsed"
    title="Analyses"
    collapsible
    resizable
    tooltip
    :ui="{
    }"
  >
    <template #header>
      <!-- <UButton
        :icon="collapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'"
        color="neutral"
        variant="ghost"
        @click="collapsed = !collapsed"
      /> -->
      <div class="flex flex-row justify-between items-center gap-1 w-full h-(--ui-header-height)">
        <div v-if="!collapsed" class="flex items-center gap-2">
          <span class="text-lg font-medium truncate">Analyses</span>
          <UBadge :label="analysesList?.length ?? 0" variant="subtle" />
        </div>
        <div v-if="!collapsed">
          <UButton icon="i-lucide-plus" size="md" class="rounded-full" to="/workflows" />
        </div>
        <UButton
          :icon="collapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'"
          color="neutral"
          variant="ghost"
          @click="collapsed = !collapsed"
        />
      </div>
    </template>
    <template #default>
      <AnalysisListPanel v-model:collapsed="collapsed" />
    </template>
  </UDashboardSidebar>
  <NuxtPage />
</template>
