<script setup lang="ts">
// import type { FacetDistribution, FacetStats } from 'meilisearch'
import type { MeiliDataTableColumnType } from '#components/meili/MeiliDataTable/types/meili-data-table-column-type'
import type { TableColumn } from '@nuxt/ui'
import type { SortingState } from '@tanstack/table-core'
import { MeiliIndexDataTableSortColumn } from '#components'
import { useMeiliDataTableColumns } from '#layers/@gaas-ui/app/composables/meili/useMeiliDataTableColumns'

const defaultColumnWidth = 80

const metaClass = {
  th: `truncate align-top w-[${defaultColumnWidth}px] max-w-[${defaultColumnWidth}px]`,
}

// category column conf
const categoryWidth = ref(200)

// const categoryHeight = ref(45)
const categoryMetaClass = computed(() => {
  return {
    th: `truncate align-top w-[${categoryWidth.value}px] max-w-[${categoryWidth.value}px]`,
    // th: `truncate align-top`,
  }
})

interface WorldCity {
  geonameid: number
  name: string
  country: string
  timezone: string
  population: number
}

const indexName = 'world_cities'

const columns = computed<Array<TableColumn<WorldCity> & { type?: MeiliDataTableColumnType }>>(() => {
  return [{
    accessorKey: 'geonameid',
    header: 'ID',
    size: defaultColumnWidth,
    meta: { class: { ...metaClass } },
    type: 'none',

  }, {
    accessorKey: 'name',
    header: ({ column }) => {
      return h(MeiliIndexDataTableSortColumn, { column, label: 'Name' })
    },
    size: defaultColumnWidth,
    meta: {
      class: { ...metaClass },

    },
    type: 'none',
    // size: 80,
    // enableResizing: false,
  }, {
    accessorKey: 'country',
    enableSorting: false,
    meta: {
      class: { ...toValue(categoryMetaClass) },
    },
    header: 'Country',
    // minSize: 150,
    size: categoryWidth.value,
    // enableResizing: false,
    // maxSize: categoryWidth.value + 30,
    type: 'categorical',
  }, {
    accessorKey: 'timezone',
    meta: {
      class: { ...toValue(categoryMetaClass) },
    },
    header: 'Timezone',
    // minSize: 150,
    // size: categoryWidth.value,
    // enableResizing: false,
    // maxSize: categoryWidth.value + 30,
    type: 'categorical',
  }, {
    accessorKey: 'population',
    header: 'Population',
    meta: {
      class: { ...toValue(categoryMetaClass) },
    },
    // minSize: 150,
    // size: 200,
    // enableResizing: false,
    type: 'continuous',
  }]
})

const {
  categoricalColumns,
  continuousColumns,
  continuousColumnModels,
  continuousMeilifilter,
} = useMeiliDataTableColumns<WorldCity>({ columns })

const sorting = computed<SortingState>(() => {
  return [
    {
      id: 'country',
      desc: false,
    },
    {
      id: 'name',
      desc: true,
    },
  ]
})

const columnPinning = ref({
  left: ['geonameid'],
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
        v-model:column-pinning="columnPinning"
        :debug="false"
        :title="`Data Table for '${indexName}' Meili Index`"
        :meili-index="indexName"
        :sorting-state="sorting"
        :meili-filters="continuousMeilifilter"
        :table-props="{
          columns,
        }"
      >
        <template #header>
          <span class="text-lg font-medium">
            Data Table for
            <span class="bg-neutral-600 rounded-md p-1">{{ indexName }} </span>
            Meili Index
          </span>
        </template>

        <template v-for="catColumn in categoricalColumns" :key="catColumn.accessorKey" #[`${catColumn.accessorKey}-header`]="headerProps">
          <MeiliIndexDataTableHeaderCategorical
            :index-name="indexName"
            :title="typeof headerProps.column.columnDef.header === 'string' ? headerProps.column.columnDef.header : headerProps.column.id"
            :facet-attribute="headerProps.column.id"
            v-bind="headerProps"
          />
        </template>

        <!-- continuous column -->
        <template v-for="contColumn in continuousColumns" :key="contColumn.accessorKey" #[`${contColumn.accessorKey}-header`]="headerProps">
          <MeiliIndexDataTableHeaderContinuous
            v-model="continuousColumnModels[contColumn.accessorKey as string]"
            :index-name="indexName"
            :title="typeof headerProps.column.columnDef.header === 'string' ? headerProps.column.columnDef.header : headerProps.column.id"
            v-bind="headerProps"
          />
        </template>
      </MeiliIndexDataTable>
    </template>
  </UDashboardPanel>
</template>
