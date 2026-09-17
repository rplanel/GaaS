import type { Coordinator, Selection } from '@uwdata/mosaic-core'
import type { FilterExpr, SelectExpr } from '@uwdata/mosaic-sql'
import type { Ref } from 'vue'
import { makeClient } from '@uwdata/mosaic-core'
import { Query } from '@uwdata/mosaic-sql'
import { log } from 'evlog/client'

export interface UseMosaicDataParams {
  table: Ref<string>
  selection: Selection
  selectClause: Ref<SelectExpr | undefined>
  coordinator: Coordinator
}

/**
 * Composable for managing Mosaic data queries and client connection
 */
export function useMosaicData<T>(params: UseMosaicDataParams) {
  const tableData = ref<T[] | undefined>(undefined)
  const isError = ref(false)
  const isPending = ref(false)
  const { table, selection, coordinator, selectClause } = params
  // const effectiveCoordinator = computed(() => {
  //   const coordinatorVal = toValue(coordinator)
  //   return coordinatorVal || defaultCoordinator()
  // })

  watchEffect((onCleanup) => {
    const selectClauseVal = toValue(selectClause)
    const tableName = toValue(table)
    const selectionVal = selection
    // const coordinatorVal = toValue(effectiveCoordinator)
    if (!tableName) {
      log.warn({ action: 'mosaic:missing_table', tag: 'useMosaicData' })
      return
    }
    if (!selectionVal) {
      log.warn({ action: 'mosaic:missing_selection', tag: 'useMosaicData' })
      return
    }
    if (!selectClauseVal) {
      log.warn({ action: 'mosaic:missing_select_clause', tag: 'useMosaicData' })
      return
    }
    // Early returns for missing dependencies
    if (!coordinator || !selectionVal) {
      log.warn({ action: 'mosaic:missing_coordinator_or_selection', tag: 'useMosaicData' })
      return
    }
    if (!tableName) {
      log.warn({ action: 'mosaic:missing_table', tag: 'useMosaicData' })
      return
    }
    if (!selectClauseVal) {
      log.warn({ action: 'mosaic:missing_select_clause', tag: 'useMosaicData' })
      return
    }

    const client = makeClient({
      coordinator,
      selection: selectionVal,
      prepare: async () => {
        try {
          const result = await coordinator.query(
            Query.from(tableName).select(selectClauseVal),
          )
          tableData.value = result.toArray() as T[]
        }
        catch (error) {
          log.error({
            action: 'mosaic:prepare_failed',
            tag: 'useMosaicData',
            error: String(error),
          })
          isError.value = true
        }
      },
      query: (predicate: FilterExpr) => {
        return Query.from(tableName)
          .select(selectClauseVal)
          .where(predicate)
      },
      queryResult: (data) => {
        try {
          tableData.value = (data as any).toArray() as T[]
          isError.value = false
          isPending.value = false
        }
        catch (error) {
          log.error({
            action: 'mosaic:query_result_failed',
            tag: 'useMosaicData',
            error: String(error),
          })
          isError.value = true
          isPending.value = false
        }
      },
      queryPending: () => {
        isPending.value = true
        isError.value = false
      },
      queryError: (err) => {
        isPending.value = false
        isError.value = true
        log.error({
          action: 'mosaic:query_failed',
          tag: 'useMosaicData',
          error: err.message,
        })
        throw createError(`Error running query: ${err.message}`)
      },
    })

    onCleanup(() => {
      client.destroy()
    })
  })

  return {
    tableData: readonly(tableData),
    isError: readonly(isError),
    isPending: readonly(isPending),
  }
}
