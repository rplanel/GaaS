import type { TableColumn } from '@nuxt/ui'

export interface MeiliDataTableColumnOptions<T> {
  columns: Ref<TableColumn<T>[]>
}
export type MeiliDataTableColumnType = 'categorical' | 'continuous' | 'none'

export function useMeiliDataTableColumns<T>(options: MeiliDataTableColumnOptions<T>) {
  const { columns } = options

  const categoricalColumns = computed(() => {
    const columnsVal = toValue(columns)
    if (!columnsVal) {
      return []
    }
    return columnsVal.filter(col => col.type === 'categorical')
  })

  /**
   * Type guard to validate that a range is defined and contains valid numbers
   */
  function isValidRange(range: number[] | undefined) {
    return !!range && range.length === 2
      && typeof range[0] === 'number' && typeof range[1] === 'number'
      && !Number.isNaN(range[0]) && !Number.isNaN(range[1])
  }

  const continuousColumns = computed(() => {
    const columnsVal = toValue(columns)
    if (!columnsVal) {
      return []
    }
    return columnsVal.filter(col => col.type === 'continuous')
  })

  const continuousColumnModels = reactive<Record<string, number[] | undefined>>({})

  const continuousMeiliFilter = computed<string[]>(() => {
    return Object.entries(continuousColumnModels)
      .filter(([key, range]) => {
        return key && isValidRange(range)
      })
      .map(([key, range]) => `${key} ${range![0]} TO ${range![1]}`)
  })

  onMounted(() => {
  // initialize the continuous column models
    const contColumns = toValue(continuousColumns)
    contColumns.forEach((col) => {
      const accessorKey = col.accessorKey
      if (accessorKey) {
        continuousColumnModels[accessorKey] = undefined
      }
    })
  })

  return {
    categoricalColumns,
    continuousColumns,
    continuousColumnModels,
    continuousMeiliFilter,
  }
}
