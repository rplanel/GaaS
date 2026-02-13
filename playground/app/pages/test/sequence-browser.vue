<script lang="ts" setup>
import type { Sequence } from '#layers/@gaas-ui/app/types/sequenceBrowser'

const sequences: Sequence[] = [
  {
    id: 'seq1',
    name: 'Sequence 1',
    length: 124,
    start: 10,
    end: 134,
    strand: 1,

  },
  {
    id: 'seq2',
    name: 'Sequence 2',
    length: 200,
    start: 223,
    end: 423,
    strand: -1,
  },
  {
    id: 'seq3',
    name: 'Sequence 3',
    length: 150,
    start: 430,
    end: 580,
  },
]
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
