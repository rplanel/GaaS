<script setup lang="ts" generic="T">
import type { Column } from '@tanstack/vue-table'
import type { FacetStats } from 'meilisearch'

export interface ContinuousHeaderProps<T> {
  title: string
  initialFacetStats: FacetStats | undefined
  facetStats: FacetStats | undefined
  column: Column<T>
  totalHits: number
}

const props = defineProps<ContinuousHeaderProps<T>>()
const { title, initialFacetStats, facetStats, column, totalHits } = toRefs(props)

const rangeModel = defineModel<number[]>()
</script>

<template>
  <div>
    <MeiliIndexDataTableSortColumn :column="column" :label="title" />
    <MeiliIndexFilterPlotContinuousBuilder
      v-model="rangeModel"
      :initial-facet-stats="initialFacetStats"
      :facet-stats="facetStats"
      :column="column"
      :total-hits="totalHits"
    />
  </div>
</template>
