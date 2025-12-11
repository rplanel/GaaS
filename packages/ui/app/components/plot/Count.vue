<script lang="ts" setup>
import type { Coordinator, Selection } from '@uwdata/mosaic-core'
import type { FilterExpr } from '@uwdata/mosaic-sql'
import { makeClient } from '@uwdata/mosaic-core'
import { count, Query } from '@uwdata/mosaic-sql'

interface Props {
  coordinator: Coordinator
  table: string
  selection: Selection
}

const props = defineProps<Props>()

const { coordinator, selection } = props
const table = toRef(() => props.table)
const isError = ref(false)
const isPending = ref(false)
const totalCount = ref<number | null>(null)
const filteredCount = ref<number | null>(null)

const percent = computed(() => {
  if (totalCount.value === null || filteredCount.value === null || totalCount.value === 0) {
    return 0
  }
  return filteredCount.value / totalCount.value * 100
})

const progressLabel = computed(() => {
  if (totalCount.value === null || filteredCount.value === null) {
    return 'Loading...'
  }
  return `${filteredCount.value} / ${totalCount.value} (${percent.value.toFixed(1)}%)`
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
        Query.from(tableName).select({ count: count() }),
      )
      totalCount.value = result.get(0).count
    },
    query: (predicate: FilterExpr) => {
      // Returns a query to retrieve the data.
      // The `predicate` is the selection's predicate for this client.
      // Here we use it to get the filtered count.
      return Query.from(tableName)
        .select({ count: count() })
        .where(predicate)
    },
    queryResult: (data) => {
      // The query result is available.
      filteredCount.value = data.get(0).count
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
  <div class="w-full">
    <UProgress
      v-model="percent"
      status
      color="info"
      size="md"
      :max="100"
    />

    <div class="text-dimmed text-sm mt-1">
      {{ progressLabel }}
    </div>
  </div>
</template>
