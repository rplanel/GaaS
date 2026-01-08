import type { Coordinator, Selection } from '@uwdata/mosaic-core'
import type { FilterExpr } from '@uwdata/mosaic-sql'
import { clausePoints, makeClient } from '@uwdata/mosaic-core'
import { and, count, isIn, Query } from '@uwdata/mosaic-sql'

export interface UseListIdsClientParams {
  selection: Selection | undefined
  table: MaybeRef<string>
  variableId: MaybeRef<string>
  coordinator: Coordinator
  isDBReady?: Ref<boolean>
  values: Ref<string[] | number[] | undefined>
}

export function useListIdsClient(params: UseListIdsClientParams) {
  const { selection, table, variableId, coordinator, values, isDBReady } = params
  const result = ref<unknown[]>([])
  const isError = ref(false)
  const isPending = ref(false)

  const normalizedList = computed<(string | number)[] | undefined>(() => {
    const listIds = toValue(values)
    if (!listIds || listIds.length === 0) {
      return undefined
    }

    const normalized = listIds
      .map((value) => {
        if (typeof value === 'number') {
          return Number.isFinite(value) ? value : null
        }
        if (typeof value === 'string') {
          const trimmed = value.trim()
          if (trimmed.length === 0) {
            return null
          }
          const numericValue = Number(trimmed)
          return Number.isNaN(numericValue) ? trimmed : numericValue
        }
        return null
      })
      .filter((value): value is string | number => value !== null)

    if (normalized.length === 0) {
      return undefined
    }

    return normalized
  })

  const listIdsPredicate = computed<FilterExpr | null>(() => {
    const isDBReadyVal = toValue(isDBReady)
    const tableName = toValue(table)
    const variableName = toValue(variableId)
    const listIds = normalizedList.value

    if (!coordinator || !tableName || !variableName || !isDBReadyVal || !listIds || listIds.length === 0) {
      result.value = []
      return null
    }
    return isIn(variableName, listIds)
  })

  /**
   * Create a mosaic client that fetches data from the specified table,
   */
  watchEffect((onCleanup) => {
    const isDBReadyVal = toValue(isDBReady)
    const tableName = toValue(table)
    const variableName = toValue(variableId)
    if (!coordinator || !tableName || !variableName || !isDBReadyVal) {
      result.value = []
      return
    }
    const predicate = listIdsPredicate.value
    let activeClause: ReturnType<typeof clausePoints> | null = null

    const client = makeClient({
      coordinator,
      selection,
      prepare: async () => {
      // Preparation work before the client starts.
      // Here we get the total number of rows in the table.
        const predicateVal = toValue(predicate)

        if (predicateVal) {
          const query = Query
            .from(tableName)
            .select(variableName, { count: count() })
            .groupby(variableName)
            .where(predicateVal)
          const queryResult = await coordinator.query(
            query,
          )
          result.value = queryResult.toArray()
        }
        else {
          const query = Query
            .from(tableName)

            .select(variableName, { count: count() })
            .groupby(variableName)
          const queryResult = await coordinator.query(
            query,
          )
          result.value = queryResult.toArray()
        }
      },
      query: (mozPredicate: FilterExpr) => {
      // Returns a query to retrieve the data.
      // The `predicate` is the selection's predicate for this client.
      // Here we use it to get the filtered count.
        // const predicate = listIds !== undefined ? isIn(variableName, listIds) : null

        const combinedPredicate = predicate ? and(mozPredicate, predicate) : mozPredicate

        const query = Query
          .from(tableName)
          .select(variableName, { count: count() })
          .groupby(variableName)
          .where(combinedPredicate)

        return query
      },
      queryResult: (queryData) => {
      // The query result is available.
        result.value = queryData.toArray()
        isError.value = false
        isPending.value = false
      },
      queryPending: () => {
      // The query is pending.
        isPending.value = true
        isError.value = false
      },
      queryError: () => {
      // There is an error running the query.
        isPending.value = false
        isError.value = true
      },
    })

    const stopPublish = selection
      ? watch(normalizedList, (list) => {
          if (!selection) {
            return
          }
          if (!variableName) {
            return
          }
          if (!list || list.length === 0) {
            result.value = []
          }
          const clause = clausePoints(
            [variableName],
            list ? list.map(value => [value]) : null,
            { source: client },
          )
          activeClause = clause
          selection.update(clause)
        }, { immediate: true })
      : undefined

    onCleanup(() => {
    // Cleanup when the component is unmounted or the coordinator changes.
      if (selection && activeClause) {
        selection.reset([activeClause])
        activeClause = null
      }
      stopPublish?.()
      client.destroy()
    })
  })

  return {
    result,
    isError,
    isPending,
  }
}
