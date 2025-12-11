import type { TableColumn } from '@nuxt/ui'
import { upperFirst } from 'scule'

export function toMetaClass(width: number) {
  return {
    td: `w-[${width}px] min-w-[${width}px]`,
    th: `w-[${width}px] min-w-[${width}px]`,
  }
}

export function toTableColumns<T extends string, TData>(columnNames: T[]) {
  if (!columnNames) {
    return []
  }
  return columnNames.map<TableColumn<TData>>((name) => {
    return {
      id: name,
      accessorKey: name,
      header: upperFirst(name.replaceAll('_', ' ')),
    }
  })
}

export function mergeCustomColumns<TData>(columnsToMerge: TableColumn<TData>[], baseColumns: TableColumn<TData>[]) {
  return baseColumns.map((col) => {
    const mergedCol = { ...col } as TableColumn<TData>
    const toMerge = columnsToMerge.find(c => c.id === col.id)
    if (toMerge) {
      mergedCol.header = toMerge.header
      mergedCol.meta = { ...mergedCol.meta, ...toMerge.meta }
    }
    return mergedCol
  })
}
