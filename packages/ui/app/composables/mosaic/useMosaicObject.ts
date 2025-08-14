/**
 * A Vue composable that initializes a Mosaic database table with object data.
 *
 * This composable sets up a DuckDB WASM connector, loads the provided objects into
 * a specified table, and tracks the loading state. The initialization happens
 * automatically when the composable is called.
 *
 * @param tableName - The name of the database table to create and populate (reactive)
 * @param object - An array of objects to load into the table (reactive)
 *
 * @returns An object containing:
 *   - `pending` - A reactive boolean indicating whether the table initialization is in progress
 *
 * @example
 * ```typescript
 * const data = ref([
 *   { id: 1, name: 'John' },
 *   { id: 2, name: 'Jane' }
 * ])
 *
 * const { pending } = useMosaicObject('users', data)
 * ```
 */
import type { MaybeRef } from 'vue'
import { coordinator, DuckDBWASMConnector } from '@uwdata/mosaic-core'
import { loadObjects } from '@uwdata/mosaic-sql'
import { onUnmounted, ref, toValue, watchEffect } from 'vue'

export function useMosaicObject(tableName: MaybeRef<string>, object: MaybeRef<Record<string, unknown>[]>) {
  const pending = ref<boolean>(false)
  const defaultCoordinator = coordinator()
  async function init() {
    const wasm = new DuckDBWASMConnector()

    defaultCoordinator.databaseConnector(wasm)
    pending.value = true
    const sqlQuery = loadObjects(toValue(tableName), toValue(object), { replace: true })
    await defaultCoordinator.exec(sqlQuery)
    pending.value = false
  }

  init()
  watchEffect(() => {
    const tableNameVal = toValue(tableName)
    const objectVal = toValue(object)
    if (tableNameVal && objectVal) {
      init()
    }
  })

  // onBeforeMount(() => {
  // // Perform any setup or data fetching here
  //   defaultCoordinator.clear({ clients: true, cache: true })
  // })
  onUnmounted(() => {
  // Perform any cleanup or teardown here
    defaultCoordinator.clear({ clients: true, cache: true })
  })

  return {
    pending,
  }
}
