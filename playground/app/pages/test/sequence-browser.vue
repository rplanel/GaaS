<script lang="ts" setup>
import { generateSequences } from '#layers/@gaas-ui/app/data/sequences-sample'

const sequences = generateSequences(5000)
</script>

<template>
  <UDashboardPanel id="meili-data-table" title="Meili Data Table">
    <template #header>
      <UDashboardNavbar title="Datatable powered by Meilisearch">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <SequenceBrowser :sequences="sequences" title="My Sequences browser" />
    </template>
  </UDashboardPanel>
</template>
