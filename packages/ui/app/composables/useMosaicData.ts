import type { Coordinator, Selection } from '@uwdata/mosaic-core'
import type { FilterExpr, SelectExpr } from '@uwdata/mosaic-sql'
import type { Ref } from 'vue'
import { makeClient } from '@uwdata/mosaic-core'

import { Query } from '@uwdata/mosaic-sql'

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
    // console.info(selectClauseVal)
    const tableName = toValue(table)
    const selectionVal = selection
    // const coordinatorVal = toValue(effectiveCoordinator)
    if (!tableName) {
      console.warn('Table name is not defined.')
      return
    }
    if (!selectionVal) {
      console.warn('Selection is not defined.')
      return
    }
    if (!selectClauseVal) {
      console.warn('Select clause is not defined.')
      return
    }
    // Early returns for missing dependencies
    if (!coordinator || !selectionVal) {
      console.warn('Coordinator or selection is not defined.')
      return
    }
    if (!tableName) {
      console.warn('Table name is not defined.')
      return
    }
    if (!selectClauseVal) {
      console.warn('Select clause is not defined.')
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
          console.error('Error in prepare phase:', error)
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
          console.error('Error processing query result:', error)
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
        console.error(`Error running query: ${err.message}`)
        throw createError(`Error running query: ${err.message}`)
      },
    })

    onCleanup(() => {
      // console.info('Destroying Mosaic client in useMosaicData cleanup.')
      client.destroy()
    })
  })

  return {
    tableData: readonly(tableData),
    isError: readonly(isError),
    isPending: readonly(isPending),
  }
}
