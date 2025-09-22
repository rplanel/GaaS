import type { Selection } from '@uwdata/mosaic-core'

export interface MosaicTableParams {
  tableName: Ref<string>
  selection: Selection | undefined
}

export function useMosaicTable(params: MosaicTableParams) {
  const { tableName, selection } = params
  const { getHeader: getHistogramHeader } = useHistogramHeader({
    table: toValue(tableName),
    selection,
  })
  const { getHeader: getCategoryHeader } = useCategoryHeader({
    table: toValue(tableName),
    selection,
  })

  return {
    getHistogramHeader,
    getCategoryHeader,
  }
}
