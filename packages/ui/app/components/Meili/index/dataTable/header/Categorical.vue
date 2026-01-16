<script lang="ts" setup generic="T">
import type { Column } from '@tanstack/vue-table'
import type { FacetDistribution, FacetStats, SearchParams } from 'meilisearch'

export interface CategoricalHeaderProps<T> {
  indexName: string
  title: string | undefined
  facetDistribution: FacetDistribution | undefined
  facetStats: FacetStats | undefined
  column: Column<T>
  searchParams: SearchParams
  addFilter: ((filter: FacetFilter) => FacetFilter & { uuid: string }) | undefined
  facetAttribute: string | undefined
  totalHits: number | undefined
  numberOfDocuments: number | undefined
  maxValuesPerFacet: number | undefined
  width?: number
  height?: number

}

const props = defineProps<CategoricalHeaderProps<T>>()
const indexName = toRef(props.indexName)
</script>

<template>
  <div class="w-full">
    <div class="flex flex-row justify-start gap-1">
      <MeiliIndexDataTableSortColumn
        :column="column"
        :label="title"
      />
      <UModal>
        <UButton
          icon="i-lucide:filter"
          variant="link"
          size="sm"
          color="neutral"
        />
        <template #header>
          <span class="text-lg font-medium">Add {{ title }} Filter</span>
        </template>
        <template #body>
          <MeiliIndexFilterSimpleBuilder
            :meili-index="indexName"
            :facet-distribution="facetDistribution"
            :facet-stats="facetStats"
            :search-params="searchParams"
            :add-filter="addFilter"
            :facet-attribute="column.id"
          />
        </template>
      </UModal>
    </div>
    <MeiliIndexFilterPlotCategoryBuilder
      :meili-index="indexName"
      :search-params="searchParams"
      :facet-distribution="facetDistribution"
      :column="column"
      :total-hits="totalHits"
      :number-of-documents="numberOfDocuments"
      :max-values-per-facet="maxValuesPerFacet"
      :add-filter="addFilter"
      :width="width"
      :height="height"
    />
  </div>
</template>
