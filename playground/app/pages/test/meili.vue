<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
// import type { FacetDistribution, FacetStats } from 'meilisearch'
import { MeiliIndexDataTableSortColumn } from '#components'

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

const metaClass = {
  th: 'truncate align-top w-[80px]',
}
// const continuousColumnModels = ref<Record<string, number[]> | undefined>({})
// const populationModel = ref<number[]>([0, 0])

const indexName = 'world_cities'

type TableColumnType = 'categorical' | 'continuous' | 'none'

const columns = computed<Array<TableColumn<WorldCity> & { type?: TableColumnType }>>(() => {
  return [{
    accessorKey: 'geonameid',
    header: 'ID',
    //  size: 80,
    meta: { class: { ...metaClass } },
    type: 'none',

  }, {
    accessorKey: 'name',
    header: ({ column }) => {
      return h(MeiliIndexDataTableSortColumn, { column, label: 'Name' })
    },
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

const categoricalColumns = computed(() => {
  const columnsVal = toValue(columns)
  if (!columnsVal) {
    return []
  }
  return columnsVal.filter(col => col.type === 'categorical')
})

const continuousColumns = computed(() => {
  const columnsVal = toValue(columns)
  if (!columnsVal) {
    return []
  }
  return columnsVal.filter(col => col.type === 'continuous')
})

const continuousColumnModels = reactive<Record<string, number[]>>({})

const continuousMeilifilter = computed(() => {
  if (!continuousColumnModels || Object.keys(continuousColumnModels).length === 0) {
    return []
  }

  return Object.entries(continuousColumnModels)
    .map(([key, range]) => {
      if (!range || !key || range.length !== 2) {
        return ''
      }
      // if (range[0] === 0 && range[1] === 0) {
      //   return undefined
      // }
      return `${key} ${range[0]} TO ${range[1]}`
    })
    .filter(Boolean)
})

onMounted(() => {
  // initialize the continuous column models
  const contColumns = toValue(continuousColumns)
  contColumns.forEach((col) => {
    const accessorKey = col.accessorKey
    if (accessorKey) {
      continuousColumnModels[accessorKey] = [0, 0]
    }
  })
})

const sorting = computed(() => {
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
        <!-- <template #population-header="{ column, facetStats, totalHits, initialFacetStats }">
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
        </template> -->
      </MeiliIndexDataTable>
    </template>
  </UDashboardPanel>
</template>
