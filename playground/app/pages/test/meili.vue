<script setup lang="ts">
// import type { FacetDistribution, FacetStats } from 'meilisearch'
import { MeiliIndexDataTableSortColumn, MeiliIndexFilterPlotCategoryBuilder, MeiliIndexFilterPlotContinuousBuilder } from '#components'

const categoryWidth = ref(200)

const categoryHeight = ref(45)
const categoryMetaClass = computed(() => {
  return {
    th: `truncate align-top w-[${categoryWidth.value}px] max-w-[${categoryWidth.value}px]`,
    // th: `truncate align-top`,
  }
})

const metaClass = {
  th: 'truncate align-top w-[80px]',
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
      {
        accessorKey: 'geonameid',
        header: 'ID',
        //  size: 80,
        meta: { class: { ...metaClass } },
      },
      {
        accessorKey: 'name',
        header: ({ column }) => {
          return h(MeiliIndexDataTableSortColumn, { column, label: 'Name' })
        },
        meta: {
          class: { ...metaClass },

        },
        // size: 80,
        // enableResizing: false,
      },
      {
        accessorKey: 'country',
        enableSorting: false,
        meta: {
          class: { ...toValue(categoryMetaClass) },
        },
        // minSize: 150,
        // size: categoryWidth.value,
        // enableResizing: false,
        // maxSize: categoryWidth.value + 30,

      },
      {
        accessorKey: 'timezone',
        meta: {
          class: { ...toValue(categoryMetaClass) },
        },
        // minSize: 150,
        // size: categoryWidth.value,
        // enableResizing: false,
        // maxSize: categoryWidth.value + 30,

      },
      {
        accessorKey: 'population',
        meta: {
          class: { ...toValue(categoryMetaClass) },
        },
        // minSize: 150,
        // size: 200,
        // enableResizing: false,
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
          <div>
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
              :meili-index="index.name"
              :search-params="searchParams"
              :facet-distribution="facetDistribution"
              :column="column"
              :total-hits="totalHits"
              :number-of-documents="numberOfDocuments"
              :max-values-per-facet="maxValuesPerFacet"
              :add-filter="addFilter"
              :width="categoryWidth"
              :height="categoryHeight"
            />
          </div>
          <div />
        </template>
        <template #timezone-header="{ searchParams, column, facetDistribution, numberOfDocuments, totalHits, addFilter, maxValuesPerFacet, facetStats }">
          <div>
            <div class="flex flex-row justify-start gap-1">
              <MeiliIndexDataTableSortColumn :column="column" label="Timezone" />
              <UModal>
                <UButton icon="i-lucide:filter" variant="link" size="sm" color="neutral" />
                <template #header>
                  <span class="text-lg font-medium">Add Timezone Filter</span>
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
              :meili-index="index.name"
              :search-params="searchParams"
              :facet-distribution="facetDistribution"
              :column="column"
              :total-hits="totalHits"
              :number-of-documents="numberOfDocuments"
              :max-values-per-facet="maxValuesPerFacet"
              :add-filter="addFilter"
              :width="categoryWidth"
              :height="categoryHeight"
            />
          </div>
        </template>
        <template #population-header="{ column, facetStats, totalHits, initialFacetStats }">
          <div>
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
