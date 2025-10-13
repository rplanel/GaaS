<script lang="ts" setup generic="T">
import type { TableProps } from '@nuxt/ui'
import { useLoadMore } from '../../composables/meili/useLoadMore'

interface Props {
  meiliIndex: string // Define any props if needed
  pageSize?: number
  tableProps: TableProps<T>
}

const props = withDefaults(defineProps<Props>(), {
  pageSize: 20,
})
const tableProps = toRef(() => props.tableProps)
const meiliIndex = toRef(() => props.meiliIndex)
const pageSize = toRef(() => props.pageSize)
// const hits = ref<T[]>([])
const {
  totalHits,
  currentPage,
  currentPageSize,
  pageCount,
  isFirstPage,
  isLastPage,
  prev,
  next,
  result,
  stats,
} = useLoadMore({
  meiliIndex,
  pageSize,
})

const computedTableProps = computed(() => {
  const resultVal = toValue(result)
  if (!resultVal || !tableProps.value) {
    return tableProps.value
  }
  return {
    ...tableProps.value,
    data: resultVal.hits as T[],
  }
})
</script>

<template>
  <div>
    <div>
      <pre>{{ stats }}</pre>
    </div>
    <div class="my-2">
      {{ totalHits }} total hits -
      Page {{ currentPage }} / {{ pageCount }} ({{ currentPageSize }} per page)
    </div>
    <UButton :disabled="isFirstPage" @click="prev">
      Previous
    </UButton>
    <UButton :disabled="isLastPage" @click="next">
      Next
    </UButton>
    <UButton @click="next">
      Load More
    </UButton>
    <UTable v-bind="computedTableProps" />
  </div>
</template>
