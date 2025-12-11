<script lang="ts" setup>
import type { Coordinator, Selection } from '@uwdata/mosaic-core'
import type { FilterExpr } from '@uwdata/mosaic-sql'
import { makeClient } from '@uwdata/mosaic-core'
import { max, min, Query } from '@uwdata/mosaic-sql'

interface Props {
  table: string
  selection: Selection
  variable: string
  coordinator: Coordinator
}

const props = defineProps<Props>()
const { coordinator, selection } = props
const table = toRef(() => props.table)
const variable = toRef(() => props.variable)
const isError = ref(false)
const isPending = ref(false)
const variableMin = ref<number | null>(null)
const variableMax = ref<number | null>(null)

const selectClause = computed(() => {
  // Generate the select clause for the variable.
  // console.log('variable in selectClause:', variable.value)
  return { min: min(variable.value), max: max(variable.value) }
})

watchEffect((onCleanup) => {
  const tableName = toValue(table)
  const client = makeClient({
    coordinator,
    selection,
    prepare: async () => {
      // Preparation work before the client starts.
      // Here we get the total number of rows in the table.
      const result = await coordinator.query(
        Query.from(tableName).select(selectClause.value),
      )
      const { min: minVal, max: maxVal } = result.get(0)
      variableMin.value = minVal
      variableMax.value = maxVal
    },
    query: (predicate: FilterExpr) => {
      // Returns a query to retrieve the data.
      // The `predicate` is the selection's predicate for this client.
      // Here we use it to get the filtered count.
      return Query.from(tableName)
        .select(selectClause.value)
        .where(predicate)
    },
    queryResult: () => {
      // The query result is available.
      // filteredCount.value = data.get(0).count
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

  onCleanup(() => {
    // Cleanup when the component is unmounted or the coordinator changes.
    client.destroy()
  })
})
</script>

<template>
  <div class="flex justify-between text-xs text-dimmed mt-1">
    <span class="text-left">{{ variableMin }}</span>
    <span class="text-right">{{ variableMax }}</span>
  </div>
</template>
