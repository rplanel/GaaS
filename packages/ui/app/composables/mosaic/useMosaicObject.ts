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
import { onBeforeMount, onUnmounted, ref, toValue, watchEffect } from 'vue'

export function useMosaicObject(tableName: MaybeRef<string>, object: MaybeRef<Record<string, unknown>[]>) {
  const defaultCoordinator = coordinator()

  const pending = ref<boolean>(false)
  const queryResult = ref<unknown | null>(null)
  const queryString = ref<string | undefined>(undefined)
  async function init() {
    const tableNameVal = toValue(tableName)
    const objectVal = toValue(object)
    if (tableNameVal && objectVal) {
      const wasm = new DuckDBWASMConnector()
      defaultCoordinator.databaseConnector(wasm)
      pending.value = true
      const qs = loadObjects(tableNameVal, objectVal, { replace: true, temp: true })
      queryString.value = qs
      try {
        const qr = await defaultCoordinator.exec(qs)
        queryResult.value = qr
      }
      catch (error) {
        console.error('Error initializing Mosaic Object:', error)
      }
      finally {
        pending.value = false
      }
    }
  }

  watchEffect(() => {
    // const tableNameVal = toValue(tableName)
    // const objectVal = toValue(object)
    // if (tableNameVal && objectVal) {
    init()
      .catch((error) => {
        console.error('Error initializing Mosaic Object in watchEffect:', error)
      })
    // }
  })

  init().catch((error) => {
    console.error('Error initializing Mosaic Object:', error)
  })

  onBeforeMount(() => {
  // Perform any setup or data fetching here
    defaultCoordinator.clear({ clients: true, cache: true })
  })
  onUnmounted(() => {
  // Perform any cleanup or teardown here
    defaultCoordinator.clear({ clients: true, cache: true })
  })

  return {
    pending,
    queryResult,
    queryString,
    coordinator: defaultCoordinator,
  }
}
