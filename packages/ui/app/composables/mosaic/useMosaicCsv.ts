/**
 * A composable function that loads a CSV file into a DuckDB table using Mosaic.
 *
 * This function sets up a DuckDB WASM connector, loads the specified CSV file
 * into a table with the given name, and provides reactive state for tracking
 * the loading progress.
 *
 * @param tableName - The name of the table to create in the database
 * @param filePath - The path to the CSV file to load
 * @returns An object containing:
 *   - `pending`: A reactive boolean ref that indicates whether the CSV loading is in progress
 *
 * @example
 * ```typescript
 * const { pending } = useMosaicCsv('sales_data', '/data/sales.csv')
 *
 * // pending.value will be true while loading, false when complete
 * watch(pending, (isLoading) => {
 *   if (!isLoading) {
 *     console.log('CSV data loaded successfully')
 *   }
 * })
 * ```
 */
import { coordinator, DuckDBWASMConnector } from '@uwdata/mosaic-core'
import { loadCSV } from '@uwdata/mosaic-sql'
import { onUnmounted, ref, toValue, watchEffect } from 'vue'

export function useMosaicCsv(tableName: MaybeRef<string>, filePath: MaybeRef<string | undefined>) {
  const pending = ref<boolean>(false)
  async function init() {
    const filePathVal = toValue(filePath)
    const tableNameVal = toValue(tableName)
    console.warn('Initializing Mosaic CSV with table:', tableNameVal, 'and file path:', filePathVal)
    if (!filePathVal) {
      return console.warn('No file path provided for CSV loading')
    }
    const wasm = new DuckDBWASMConnector()
    coordinator().databaseConnector(wasm)
    pending.value = true
    await coordinator().exec(
      loadCSV(tableNameVal, filePathVal, { replace: true }),
    )
    pending.value = false
  }
  watchEffect(() => {
    console.warn('Watching for changes in filePath and tableName:', toValue(filePath), toValue(tableName))

    // if (toValue(filePath) && toValue(tableName)) {
    init()
    // }
  })
  init()
  onUnmounted(() => {
  // Perform any cleanup or teardown here
    coordinator().clear({ clients: true, cache: true })
  })
  return {
    pending,
  }
}
