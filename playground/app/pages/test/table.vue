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
}
const selection = Selection.intersect()
const data = shallowRef<Record<string, unknown>[] | undefined>([
  { id: 1, name: 'Satellite A', type: 'Type 1', value: 0 },
  { id: 2, name: 'Satellite B', type: 'Type 2', value: 1 },
  { id: 3, name: 'Satellite C', type: 'Type 3', value: 2 },
  { id: 4, name: 'Satellite A', type: 'Type 1', value: 2 },
  { id: 5, name: 'Satellite B', type: 'Type 2', value: 2 },
  { id: 6, name: 'Satellite C', type: 'Type 3', value: 3 },
  { id: 7, name: 'Satellite A', type: 'Type 1', value: 3 },
  { id: 8, name: 'Satellite B', type: 'Type 2', value: 4 },
  { id: 9, name: 'Satellite C', type: 'Type 3', value: 4 },
  { id: 10, name: 'Satellite A', type: 'Type 1', value: 5 },
])
const tableName = ref('satellitetestdata')
const wasm = new DuckDBWASMConnector()
const defaultCoordinator = coordinator()
defaultCoordinator.databaseConnector(wasm)
const { getHeader: getCategoryHeader } = useCategoryHeader({
  coordinator: defaultCoordinator,
  table: tableName.value,
  selection,
})
const { getHeader: getHistogramHeader } = useHistogramHeader({
  coordinator: defaultCoordinator,
  table: tableName.value,
  selection,
})
const columns = ref<TableColumn<SatelliteData>[]>([
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'name', header: ({ column }) => toValue(getCategoryHeader)({ column, label: 'Name', variable: 'name' }) },
  { accessorKey: 'type', header: ({ column }) => toValue(getCategoryHeader)({ column, label: 'Type', variable: 'type' }) },
  { accessorKey: 'value', header: ({ column }) => toValue(getHistogramHeader)({ column, label: 'Value', variable: 'value' }) },
])

const loadingStatus = ref(0)

const {
  error: mosaicError,
  pending: pendingDb,
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
},
)
</script>

<template>
  <div>
    <pre>
    db ready - {{ isDBReady }}
    pending db - {{ pendingDb }}
    tableName - {{ tableName }}
    </pre>
    <div v-if="pendingDb">
      Loading...
    </div>
    <div v-else>
      <ClientOnly>
        <PlotTable
          :columns="columns"
          :table="tableName"
          :selection
          :coordinator="defaultCoordinator"
        />
      </ClientOnly>
    </div>
  </div>
</template>
