<script setup lang="ts">
// import type { FacetDistribution, FacetStats } from 'meilisearch'
import { MeiliIndexDataTableSortColumn, MeiliIndexFilterPlotCategoryBuilder, MeiliIndexFilterPlotContinuousBuilder } from '#components'

const metaClass = {
  th: 'truncate align-top',
}
// const facetDistribution = ref<FacetDistribution | undefined>(undefined)
// const facetStats = ref<FacetStats | undefined>(undefined)
// const totalHits = ref(0)
// should get the meili index information
// in order to know which columns are sortable, filterable, etc.

// const countryFilter = ref<FacetFilter | undefined>(undefined)
const categoricalHeaderFilters: Ref<Record<string, FacetFilter | undefined>> = ref({
})

const populationModel = ref<number[]>([0, 0])
const continuousMeilifilter = computed(() => {
  const populationModelVal = toValue(populationModel)
  if (populationModelVal.length !== 2 || (populationModelVal[0] === 0 && populationModelVal[1] === 0)) {
    return ['']
  }
  return [`population ${populationModelVal[0]} TO ${populationModelVal[1]}`]
})
const index = computed(() => {
  return {
    name: 'world_cities',
    columns: [
      { accessorKey: 'geonameid', header: 'ID' },
      {
        accessorKey: 'name',
        header: ({ column }) => {
          return h(MeiliIndexDataTableSortColumn, { column, label: 'Name' })
        },
        meta: {
          class: { ...metaClass },
        },
      },
      {
        accessorKey: 'country',
        enableSorting: false,

        meta: {
          class: { ...metaClass },
        },
      },
      {
        accessorKey: 'timezone',
        meta: {
          class: { ...metaClass },
        },
      },
      {
        accessorKey: 'population',
        meta: {
          class: { ...metaClass },
        },
        size: 200,
        maxSize: 400,
        minSize: 200,
      },
    ],
    sorting: [
      {
        id: 'country',
        desc: false,
      },
      {
        id: 'name',
        desc: true,
      },
    ],
  }
})
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
      <MeiliIndexDataTable
        v-model:filters="categoricalHeaderFilters" :meili-index="index.name"
        :sorting-state="index.sorting"
        :meili-filters="continuousMeilifilter"
        :table-props="{
          columns: index.columns,
        }"
      >
        <template #country-header="{ column, facetDistribution, totalHits, addFilter }">
          <div class="w-full">
            <MeiliIndexDataTableSortColumn :column="column" label="Country" />
            <MeiliIndexFilterPlotCategoryBuilder
              :facet-distribution="facetDistribution"
              :column="column"
              :total-hits="totalHits"
              :add-filter="addFilter"
            />
          </div>
        </template>
        <template #timezone-header="{ column, facetDistribution, totalHits, addFilter }">
          <div class="w-full">
            <MeiliIndexDataTableSortColumn :column="column" label="Timezone" />
            <MeiliIndexFilterPlotCategoryBuilder
              :facet-distribution="facetDistribution"
              :column="column"
              :total-hits="totalHits"
              :add-filter="addFilter"
            />
          </div>
        </template>
        <template #population-header="{ column, facetStats, totalHits, initialFacetStats }">
          <div class="w-full">
            <MeiliIndexDataTableSortColumn :column="column" label="Population" />
            <MeiliIndexFilterPlotContinuousBuilder
              v-model="populationModel"
              :initial-facet-stats="initialFacetStats"
              :facet-stats="facetStats"
              :column="column"
              :total-hits="totalHits"
            />
          </div>
        </template>
      </MeiliIndexDataTable>
    </template>
  </UDashboardPanel>
</template>
