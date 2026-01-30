<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { useCategoryHeader } from '#layers/@gaas-ui/app/composables/plot/table/useCategoryHeader'
import { useHistogramHeader } from '#layers/@gaas-ui/app/composables/plot/table/useHistogramHeader'
import { coordinator, DuckDBWASMConnector, Selection } from '@uwdata/mosaic-core'
import { ref } from 'vue'

interface SatelliteData {
  id: number
  name: string
  type: string
  value: number
  status: string
  priority: number
  category: string
  score: number
  rating: number
  level: string
  group: string
  weight: number
  height: number
  speed: number
  distance: number
  duration: number
  frequency: number
  power: number
  temperature: number
  pressure: number
  humidity: number
  altitude: number
  latitude: number
  longitude: number
  accuracy: number
}

// const selection = Selection.intersect()
const data = shallowRef<Record<string, unknown>[] | undefined>([
  { id: 1, name: 'Satellite A', type: 'Type 1', value: 0, status: 'Active', priority: 1, category: 'Alpha', score: 85, rating: 4, level: 'High', group: 'G1', weight: 120, height: 45, speed: 7500, distance: 400, duration: 90, frequency: 2400, power: 500, temperature: 25, pressure: 101, humidity: 45, altitude: 408, latitude: 51.5, longitude: -0.1, accuracy: 98 },
  { id: 2, name: 'Satellite B', type: 'Type 2', value: 1, status: 'Inactive', priority: 2, category: 'Beta', score: 72, rating: 3, level: 'Medium', group: 'G2', weight: 150, height: 52, speed: 7200, distance: 450, duration: 95, frequency: 2600, power: 450, temperature: 22, pressure: 102, humidity: 50, altitude: 420, latitude: 48.8, longitude: 2.3, accuracy: 95 },
  { id: 3, name: 'Satellite C', type: 'Type 3', value: 2, status: 'Active', priority: 3, category: 'Gamma', score: 91, rating: 5, level: 'Low', group: 'G1', weight: 180, height: 60, speed: 7800, distance: 380, duration: 88, frequency: 2200, power: 550, temperature: 28, pressure: 100, humidity: 40, altitude: 395, latitude: 40.7, longitude: -74.0, accuracy: 99 },
  { id: 4, name: 'Satellite A', type: 'Type 1', value: 2, status: 'Pending', priority: 1, category: 'Alpha', score: 68, rating: 3, level: 'High', group: 'G3', weight: 125, height: 47, speed: 7600, distance: 420, duration: 92, frequency: 2500, power: 480, temperature: 24, pressure: 103, humidity: 55, altitude: 412, latitude: 35.6, longitude: 139.6, accuracy: 96 },
  { id: 5, name: 'Satellite B', type: 'Type 2', value: 2, status: 'Active', priority: 2, category: 'Beta', score: 79, rating: 4, level: 'Medium', group: 'G2', weight: 145, height: 50, speed: 7350, distance: 440, duration: 93, frequency: 2450, power: 520, temperature: 26, pressure: 101, humidity: 48, altitude: 405, latitude: 52.5, longitude: 13.4, accuracy: 97 },
  { id: 6, name: 'Satellite C', type: 'Type 3', value: 3, status: 'Inactive', priority: 3, category: 'Gamma', score: 88, rating: 5, level: 'Low', group: 'G1', weight: 175, height: 58, speed: 7750, distance: 390, duration: 89, frequency: 2300, power: 540, temperature: 27, pressure: 99, humidity: 42, altitude: 400, latitude: 55.7, longitude: 37.6, accuracy: 98 },
  { id: 7, name: 'Satellite A', type: 'Type 1', value: 3, status: 'Active', priority: 1, category: 'Alpha', score: 94, rating: 5, level: 'High', group: 'G3', weight: 130, height: 48, speed: 7550, distance: 410, duration: 91, frequency: 2550, power: 490, temperature: 23, pressure: 102, humidity: 52, altitude: 415, latitude: 37.7, longitude: -122.4, accuracy: 99 },
  { id: 8, name: 'Satellite B', type: 'Type 2', value: 4, status: 'Pending', priority: 2, category: 'Beta', score: 76, rating: 4, level: 'Medium', group: 'G2', weight: 155, height: 54, speed: 7400, distance: 435, duration: 94, frequency: 2350, power: 510, temperature: 25, pressure: 100, humidity: 46, altitude: 402, latitude: 34.0, longitude: -118.2, accuracy: 94 },
  { id: 9, name: 'Satellite C', type: 'Type 3', value: 4, status: 'Active', priority: 3, category: 'Gamma', score: 82, rating: 4, level: 'Low', group: 'G1', weight: 170, height: 56, speed: 7700, distance: 395, duration: 87, frequency: 2250, power: 530, temperature: 29, pressure: 98, humidity: 38, altitude: 398, latitude: 41.9, longitude: 12.4, accuracy: 97 },
  { id: 10, name: 'Satellite A', type: 'Type 1', value: 5, status: 'Inactive', priority: 1, category: 'Alpha', score: 90, rating: 5, level: 'High', group: 'G3', weight: 135, height: 49, speed: 7650, distance: 405, duration: 90, frequency: 2480, power: 500, temperature: 24, pressure: 101, humidity: 50, altitude: 410, latitude: 39.9, longitude: -75.1, accuracy: 98 },
])

const tableName = ref('satellitetestdata')
const wasm = new DuckDBWASMConnector()
const defaultCoordinator = coordinator()
defaultCoordinator.databaseConnector(wasm)

const { getHeader: getCategoryHeader } = useCategoryHeader({
  coordinator: defaultCoordinator,
  table: tableName.value,
  // selection,
})

const { getHeader: getHistogramHeader } = useHistogramHeader({
  coordinator: defaultCoordinator,
  table: tableName.value,
  // selection,
})

const columns = ref<(TableColumn<SatelliteData> & { type?: 'categorical' | 'continuous' | 'none' })[]>([
  { accessorKey: 'id', header: 'ID' },
  {
    accessorKey: 'name',
    type: 'categorical',

    // header: ({ column }) => getCategoryHeader({ column, label: 'Name', variable: 'name' }),
  },
  {
    accessorKey: 'type',
    type: 'categorical',
    // header: ({ column }) => getCategoryHeader({ column, label: 'Type', variable: 'type' }),
  },
  {
    accessorKey: 'value',
    type: 'continuous',
    // header: ({ column }) => getHistogramHeader({ column, label: 'Value', variable: 'value' }),
  },
  {
    accessorKey: 'status',
    type: 'categorical',
    // header: ({ column }) => getCategoryHeader({ column, label: 'Status', variable: 'status' }),
  },
  {
    accessorKey: 'priority',
    type: 'continuous',
    // header: ({ column }) => getHistogramHeader({ column, label: 'Priority', variable: 'priority' }),
  },
  {
    accessorKey: 'category',
    type: 'categorical',
    // header: ({ column }) => getCategoryHeader({ column, label: 'Category', variable: 'category' }),
  },
  {
    accessorKey: 'score',
    type: 'continuous',
    // header: ({ column }) => getHistogramHeader({ column, label: 'Score', variable: 'score' }),
  },
  {
    accessorKey: 'rating',
    type: 'continuous',
    // header: ({ column }) => getHistogramHeader({ column, label: 'Rating', variable: 'rating' }),
  },
  {
    accessorKey: 'level',
    // header: ({ column }) => getCategoryHeader({ column, label: 'Level', variable: 'level' }),
  },
  {
    accessorKey: 'group',
    // header: ({ column }) => getCategoryHeader({ column, label: 'Group', variable: 'group' }),
  },
  {
    accessorKey: 'weight',
    // header: ({ column }) => getHistogramHeader({ column, label: 'Weight', variable: 'weight' }),
  },
  {
    accessorKey: 'height',
    // header: ({ column }) => getHistogramHeader({ column, label: 'Height', variable: 'height' }),
  },
  {
    accessorKey: 'speed',
    // header: ({ column }) => getHistogramHeader({ column, label: 'Speed', variable: 'speed' }),
  },
  {
    accessorKey: 'distance',
    // header: ({ column }) => getHistogramHeader({ column, label: 'Distance', variable: 'distance' }),
  },
  {
    accessorKey: 'duration',
    // header: ({ column }) => getHistogramHeader({ column, label: 'Duration', variable: 'duration' }),
  },
  {
    accessorKey: 'frequency',
    // header: ({ column }) => getHistogramHeader({ column, label: 'Frequency', variable: 'frequency' }),
  },
  {
    accessorKey: 'power',
    // header: ({ column }) => getHistogramHeader({ column, label: 'Power', variable: 'power' }),
  },
  {
    accessorKey: 'temperature',
    // header: ({ column }) => getHistogramHeader({ column, label: 'Temperature', variable: 'temperature' }),
  },
  {
    accessorKey: 'pressure',
    // header: ({ column }) => getHistogramHeader({ column, label: 'Pressure', variable: 'pressure' }),
  },

])

// const categoricalColumnSelections = computed(() => {
//   return columns.value.reduce((acc, col) => {
//     if (col.type === 'categorical') {
//       acc[col.accessorKey as string] = Selection.crossfilter()
//     }

//     return acc
//   }, {} as Record<string, Selection>)
// })

// const continuousColumnSelections = computed(() => {
//   return columns.value.reduce((acc, col) => {
//     if (col.type === 'continuous') {
//       acc[col.accessorKey as string] = Selection.crossfilter()
//     }
//     return acc
//   }, {} as Record<string, Selection>)
// })

// const continuousSelectionsToInclude = computed(() => {
//   return Object.values(continuousColumnSelections.value)
// })

// const categoricalColumnSelectionsToInclude = computed(() => {
//   return Object.values(categoricalColumnSelections.value)
// })

// const includeSelections = computed(() => {
//   return [...categoricalColumnSelectionsToInclude.value]
// })
// const continuousSelection = Selection.intersect({ include: continuousSelectionsToInclude.value })
// const selection = Selection.intersect({ include: [...includeSelections.value, continuousSelection] })
const selection = Selection.crossfilter()

const columnsWithHeader = computed(() => {
  const columnsVal = toValue(columns)
  // const continuousColumnSelectionsVal = toValue(continuousColumnSelections)
  // const categoricalColumnSelectionsVal = toValue(categoricalColumnSelections)
  if (!columnsVal) {
    return []
  }
  return columnsVal.map((col) => {
    if (col.type === 'categorical') {
      // const columnSelection = categoricalColumnSelectionsVal[col.accessorKey as string]
      const columnSelection = selection
      return {
        ...col,
        header: ({ column }: { column: TableColumn<SatelliteData> }) =>
          getCategoryHeader({ selection: columnSelection, column, label: col.header as string, variable: col.accessorKey as string, selection }),
      }
    }
    else if (col.type === 'continuous') {
      // const columnSelection = continuousColumnSelectionsVal[col.accessorKey as string]
      const columnSelection = selection

      return {
        ...col,
        header: ({ column }: { column: TableColumn<SatelliteData> }) =>
          getHistogramHeader({ selection: columnSelection, column, label: col.header as string, variable: col.accessorKey as string }),
      }
    }
    else {
      return col
    }
  })
})

// const computedColumns = computed(() => columns.value.map(col => ({
//   ...col,

// })))

const loadingStatus = ref(0)

const {
  error: mosaicError,
  // pending: pendingDb,
  isReady: isDBReady,
  isLoading: isDBLoading,
  // coordinator: defaultCoordinator,
} = useMosaic({
  tableName,
  object: data,
  coordinator: defaultCoordinator,

})
if (mosaicError.value) {
  throw createError({
    statusMessage: mosaicError.value.message,
  })
}

watchEffect(() => {
  if (isDBLoading.value) {
    loadingStatus.value = 3
  }
  else if (isDBReady.value) {
    loadingStatus.value = 4
  }
})

const columnVisibility = ref<Record<string, boolean>>({ type: false })
</script>

<template>
  <UDashboardPanel id="test-table-page">
    <template #body>
      <UPage>
        <UPageHeader title="Test table" description="test the table" />
        <UPageBody class="flex flex-col justify-stretch">
          <div v-if="!isDBReady" class="flex flex-col">
            <UAlert variant="subtle" title="Loading..." class="m-4">
              Loading...
            </UAlert>
          </div>
          <div v-else>
            <PlotTable
              v-model:column-visibility="columnVisibility" :columns="columnsWithHeader" :table="tableName"
              :selection :coordinator="defaultCoordinator"
            />
          </div>
        </UPageBody>
      </UPage>
    </template>
  </UDashboardPanel>
</template>
