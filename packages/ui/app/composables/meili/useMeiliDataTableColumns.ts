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

  const continuousColumns = computed(() => {
    const columnsVal = toValue(columns)
    if (!columnsVal) {
      return []
    }
    return columnsVal.filter(col => col.type === 'continuous')
  })

  const continuousColumnModels = reactive<Record<string, number[] | undefined>>({})

  const continuousMeilifilter = computed(() => {
    if (!continuousColumnModels || Object.keys(continuousColumnModels).length === 0) {
      return []
    }

    return Object.entries(continuousColumnModels)
      .map(([key, range]) => {
        if (!range || !key || range.length !== 2) {
          return false
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
        continuousColumnModels[accessorKey] = undefined
      }
    })
  })

  return {
    categoricalColumns,
    continuousColumns,
    continuousColumnModels,
    continuousMeilifilter,
  }
}
