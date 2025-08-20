import type { Column } from '@tanstack/vue-table'
import type { Coordinator, Selection } from '@uwdata/mosaic-core'

export interface GetHeaderParams<T> {
  column: Column<T>
  label: string
  variable: string
}

export interface UseHeaderParams {
  table: string
  selection: Selection | undefined
  coordinator: Coordinator | undefined
}
