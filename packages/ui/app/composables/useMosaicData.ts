import type { Coordinator, Selection } from '@uwdata/mosaic-core'
import type { FilterExpr, SelectExpr } from '@uwdata/mosaic-sql'
import type { Ref } from 'vue'
import { coordinator as defaultCoordinator, makeClient } from '@uwdata/mosaic-core'

import { Query } from '@uwdata/mosaic-sql'

/**
 * Composable for managing Mosaic data queries and client connection
 */
export function useMosaicData<T>(
  table: Ref<string>,
  selection: Ref<Selection>,
  selectClause: Ref<SelectExpr | undefined>,
  coordinator?: Ref<Coordinator | undefined>,
) {
  const tableData = ref<T[] | undefined>(undefined)
  const isError = ref(false)
  const isPending = ref(false)

  const effectiveCoordinator = computed(() => {
    const coordinatorVal = toValue(coordinator)
    return coordinatorVal || defaultCoordinator()
  })

  watchEffect((onCleanup) => {
    const selectClauseVal = toValue(selectClause)
    const tableName = toValue(table)
    const selectionVal = toValue(selection)
    const coordinatorVal = toValue(effectiveCoordinator)

    // Early returns for missing dependencies
    if (!coordinatorVal || !selectionVal) {
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
      coordinator: coordinatorVal,
      selection: selectionVal,
      prepare: async () => {
        try {
          const result = await coordinatorVal.query(
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
      client.destroy()
    })
  })

  return {
    tableData: readonly(tableData),
    isError: readonly(isError),
    isPending: readonly(isPending),
  }
}
