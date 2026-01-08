<script lang="ts" setup>
import type {
  MosaicClient,
} from '@uwdata/mosaic-core'
import MeiliIndexDataTableSortColumn from '#components'
import { useListIdsClient } from '#layers/@gaas-ui/app/composables/mosaic/useListIdsClient'
import { useCategoryHeader } from '#layers/@gaas-ui/app/composables/plot/table/useCategoryHeader'
import { useHistogramHeader } from '#layers/@gaas-ui/app/composables/plot/table/useHistogramHeader'

import {
  coordinator,
  DuckDBWASMConnector,
  Selection,
} from '@uwdata/mosaic-core'
import { h } from 'vue'

const tableName = ref('worldcities')
const listIdsSelection = Selection.intersect()
const selection = Selection.intersect({ include: [listIdsSelection] })

const wasm = new DuckDBWASMConnector()
const defaultCoordinator = coordinator()
defaultCoordinator.databaseConnector(wasm)

// load data to DuckDB
const url = useRequestURL()

const dataUrl = ref(`${url.protocol}//${url.host}/data-test/world-cities.parquet`)
const { error: mosaicError, isReady: isDBReady } = useMosaic({
  tableName,
  filePath: dataUrl,
  format: 'parquet',
  coordinator: defaultCoordinator,
})

if (mosaicError.value) {
  throw createError({
    statusMessage: mosaicError.value.message,
  })
}
const meiliDocumentIds = ref<string[]>([])

const { getHeader: getCategoryHeader } = useCategoryHeader({
  coordinator: defaultCoordinator,
  table: tableName.value,
  selection,
})

const { getHeader: getHistogramHeader } = useHistogramHeader({
  coordinator: defaultCoordinator,
  table: tableName.value,
  selection,
  ids: meiliDocumentIds,
})

const columnSize = {
  size: 160,
  minSize: 160,
  maxSize: 160,
}

const metaClass = {
  th: 'truncate max-w-[100px] align-top',
}

const columnsWithSummaryHeader = computed(() => {
  return {
    country: {
      accessorKey: 'country',
      headerBuilder: useCategoryHeader({
        coordinator: defaultCoordinator,
        table: tableName.value,
        selection,
      }),
    },
  }
},
)

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
        ...columnSize,
      },
      {
        accessorKey: 'country',
        enableSorting: false,
        header: ({ column }) => {
          const container = h('div', { class: 'w-full' }, [
            h('div', {}, `hasSelection: ${columnsWithSummaryHeader.value.country.headerBuilder.hasSelection.value}`),
            h(MeiliIndexDataTableSortColumn, { column, label: 'Country' }),
            columnsWithSummaryHeader.value.country.headerBuilder.getHeader({ column, variable: 'country' }),
          ])
          return container
        },
        meta: {
          class: { ...metaClass },
        },
        ...columnSize,
      },
      {
        accessorKey: 'timezone',
        header: ({ column }) => {
          return h('div', { class: 'w-full' }, [
            h(MeiliIndexDataTableSortColumn, { column, label: 'Timezone' }),
            getCategoryHeader({ column, variable: 'timezone' }),
          ])
        },
        meta: {
          class: { ...metaClass },
        },
        ...columnSize,
      },
      {
        accessorKey: 'population',
        header: ({ column }) => {
          const container = h('div', { class: 'w-full' }, [
            h(MeiliIndexDataTableSortColumn, { column, label: 'Population' }),
            getHistogramHeader({ column, variable: 'population' }),
          ])
          return container
        },
        meta: {
          class: { ...metaClass },
        },
        ...columnSize,
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

// const index = {

//   name: 'world_cities',
//   columns: [
//     { accessorKey: 'geonameid', header: 'ID' },
//     {
//       accessorKey: 'name',
//       header: ({ column }) => {
//         return h(MeiliIndexDataTableSortColumn, { column, label: 'Name' })
//       },
//       meta: {
//         class: { ...metaClass },
//       },
//       ...columnSize,
//     },
//     {
//       accessorKey: 'country',
//       enableSorting: false,
//       header: ({ column }) => {
//         const container = h('div', { class: 'w-full' }, [
//           h(MeiliIndexDataTableSortColumn, { column, label: 'Country' }),
//           columnsWithSummaryHeader.value.country.headerBuilder.getHeader({ column, variable: 'country' }),
//         ])
//         return container
//       },
//       meta: {
//         class: { ...metaClass },
//       },
//       ...columnSize,
//     },
//     {
//       accessorKey: 'timezone',
//       header: ({ column }) => {
//         return h('div', { class: 'w-full' }, [
//           h(MeiliIndexDataTableSortColumn, { column, label: 'Timezone' }),
//           getCategoryHeader({ column, variable: 'timezone' }),
//         ])
//       },
//       meta: {
//         class: { ...metaClass },
//       },
//       ...columnSize,
//     },
//     {
//       accessorKey: 'population',
//       header: ({ column }) => {
//         const container = h('div', { class: 'w-full' }, [
//           h(MeiliIndexDataTableSortColumn, { column, label: 'Population' }),
//           getHistogramHeader({ column, variable: 'population' }),
//         ])
//         return container
//       },
//       meta: {
//         class: { ...metaClass },
//       },
//       ...columnSize,
//     },
//   ],
//   sorting: [
//     {
//       id: 'country',
//       desc: false,
//     },
//     {
//       id: 'name',
//       desc: true,
//     },
//   ],
// }
const sanitizedMeiliDocumentIds = computed(() => {
  return meiliDocumentIds.value.map((id) => {
    if (typeof id === 'string') {
      return Number.parseInt(id.trim())
    }
    return id
  })
})
const { isPending: isListIdsPending, isError: isListIdsError } = useListIdsClient({
  selection: listIdsSelection,
  table: tableName,
  variableId: 'geonameid',
  coordinator: defaultCoordinator,
  values: sanitizedMeiliDocumentIds,
  isDBReady,
})
// watch meiliDocumentIds to publish mosaic selection
const mosaicClients = ref<Set<MosaicClient> | undefined>(undefined)

watch(sanitizedMeiliDocumentIds, () => {
  // console.log('meiliDocumentIds changed:', toValue(meiliDocumentIds))
  // console.log('defaultCoordinator:', defaultCoordinator)
  // console.log('defaultCoordinator clients:', defaultCoordinator.clients)

  mosaicClients.value = defaultCoordinator.clients
})
</script>

<template>
  <UDashboardPanel id="meili-data-table" title="Meili Data Table">
    <template #body>
      <div v-if="isDBReady">
        <UCard>
          <template #header>
            <div class="flex flex-row justify-between items-center w-full">
              <div class="font-medium text-lg">
                Mosaic Coordinator Clients
              </div>
            </div>
          </template>
          {{ isListIdsPending }} - {{ isListIdsError }}
        </UCard>
        <MeiliIndexDataTable
          v-model:document-ids="meiliDocumentIds" :meili-index="index.name"
          :sorting-state="index.sorting" :table-props="{
            columns: index.columns,
          }"
        />
      </div>
      <div v-else class="flex flex-col">
        <UAlert variant="subtle" title="Loading..." class="m-4">
          Loading...
        </UAlert>
      </div>
    </template>
  </UDashboardPanel>
</template>
