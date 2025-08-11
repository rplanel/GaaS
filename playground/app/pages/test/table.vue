<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import {
  Selection,
} from '@uwdata/mosaic-core'
import { computed, ref } from 'vue'
import { useMosaicObject } from '../../../../packages/ui/app/composables/mosaic/useMosaicObject'

interface SatelliteData {
  id: number
  name: string
  type: string
  value: number
}
const selection = Selection.intersect()
const data = ref<SatelliteData[]>([
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

const histogramColumns = new Set(['value'])
const categoryColumns = new Set(['type'])

const columns = ref<TableColumn<SatelliteData>[]>([
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'type', header: 'Type' },
  { accessorKey: 'value', header: 'Value' },
])
const headerWithPlotWidth = ref(200) // Width for the header with plot

const plotMetaClass = computed(() => {
  const headerWithPlotWidthVal = toValue(headerWithPlotWidth)
  return {
    th: `w-[${headerWithPlotWidthVal}px] h-[80px]`,
    // td: `max-w-[${headerWithPlotWidthVal}px] min-w-[${headerWithPlotWidthVal}px] text-start`,
  }
})
const table = ref('satellitedata')

const { pending } = useMosaicObject(table, data)
const { getHeader: getHistogramHeader } = useHistogramHeader({
  table: table.value,
  selection,
})

const { getHeader: getCategoryHeader } = useCategoryHeader({
  table: table.value,
  selection,
})

const computedColumns = computed(() => {
  return columns.value.map((col) => {
    const label = col.header as string
    const variable = col.accessorKey as string
    if (histogramColumns.has(variable!)) {
      return {
        ...col,
        header: ({ column }) => getHistogramHeader({ column, label, variable }),
        meta: {
          class: { ...toValue(plotMetaClass) },
        },
      }
    }
    if (categoryColumns.has(variable!)) {
      return {
        ...col,
        header: ({ column }) => getCategoryHeader({ column, label, variable }),
        meta: {
          class: { ...toValue(plotMetaClass) },
        },
      }
    }
    return col
  })
})
</script>

<template>
  <div>
    {{ pending ? 'Loading...' : 'Loaded' }}
    table
    <PlotTable
      :table
      :selection
      :columns="computedColumns"
    />
  </div>
</template>
