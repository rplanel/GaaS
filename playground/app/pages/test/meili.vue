<script setup lang="ts">
// import type { FacetDistribution, FacetStats } from 'meilisearch'
import { MeiliIndexDataTableSortColumn, MeiliIndexFilterPlotCategoryBuilder, MeiliIndexFilterPlotContinuousBuilder } from '#components'

const metaClass = {
  th: 'truncate align-top',
}

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
        :debug="false"
        :title="`Data Table for '${index.name}' Meili Index`"
        :meili-index="index.name"
        :sorting-state="index.sorting"
        :meili-filters="continuousMeilifilter"
        :table-props="{
          columns: index.columns,
        }"
      >
        <template #header>
          <span class="text-lg font-medium">
            Data Table for
            <span class="bg-neutral-600 rounded-md p-1">{{ index.name }} </span>
            Meili Index
          </span>
        </template>
        <template #country-header="{ column, searchParams, numberOfDocuments, facetDistribution, totalHits, addFilter, maxValuesPerFacet, facetStats }">
          <div class="w-full">
            <div class="flex flex-row justify-start gap-1">
              <MeiliIndexDataTableSortColumn :column="column" label="Country" />
              <UModal>
                <UButton icon="i-lucide:filter" variant="link" size="sm" color="neutral" />
                <template #header>
                  <span class="text-lg font-medium">Add Country Filter</span>
                </template>
                <template #body>
                  <MeiliIndexFilterSimpleBuilder
                    :meili-index="index.name"
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
              :facet-distribution="facetDistribution"
              :column="column"
              :total-hits="totalHits"
              :number-of-documents="numberOfDocuments"
              :max-values-per-facet="maxValuesPerFacet"
              :add-filter="addFilter"
            />
          </div>
          <div />
        </template>
        <template #timezone-header="{ column, facetDistribution, numberOfDocuments, totalHits, addFilter, maxValuesPerFacet }">
          <div class="w-full">
            <MeiliIndexDataTableSortColumn :column="column" label="Timezone" />
            <MeiliIndexFilterPlotCategoryBuilder
              :facet-distribution="facetDistribution"
              :column="column"
              :total-hits="totalHits"
              :number-of-documents="numberOfDocuments"
              :max-values-per-facet="maxValuesPerFacet"
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
