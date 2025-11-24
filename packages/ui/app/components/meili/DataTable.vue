<script lang="ts" setup generic="T">
import type { TableProps } from '@nuxt/ui'

// import { useFacetSearch } from '../../composables/meili/useFacetSearch'
import { useLoadMore } from '../../composables/meili/useLoadMore'

interface Props {
  meiliIndex: string // Define any props if needed
  pageSize?: number
  tableProps: TableProps<T>
}

const props = withDefaults(defineProps<Props>(), {
  pageSize: 10,
})
const tableProps = toRef(() => props.tableProps)
const meiliIndex = toRef(() => props.meiliIndex)
const pageSize = toRef(props.pageSize)

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
} = useLoadMore({
  meiliIndex,
  pageSize,
})

const facetDistribution = computed(() => {
  const resultVal = toValue(result)
  if (!resultVal || !resultVal.facetDistribution) {
    return undefined
  }
  return resultVal.facetDistribution
})

const facetStats = computed(() => {
  const resultVal = toValue(result)
  if (!resultVal || !resultVal.facetStats) {
    return undefined
  }
  return resultVal.facetStats
})

const globalSearch = ref('')

const computedTableProps = computed(() => {
  const resultVal = toValue(result)
  // const resultVal = toValue(resultTest)
  const tablePropsVal = toValue(tableProps)
  if (!resultVal || !tablePropsVal) {
    return tablePropsVal
  }

  return {
    ...tablePropsVal,
    data: resultVal.hits as T[],
  }
})
</script>

<template>
  <div>
    <MeiliFilterBuilder
      :meili-index="meiliIndex"
      :facet-distribution="facetDistribution"
      :facet-stats="facetStats"
    />
    <div class="my-2">
      <h4>Data Table</h4>
      <UInput v-model="globalSearch" placeholder="Search..." />
      {{ totalHits }} total hits -
      Page {{ currentPage }} / {{ pageCount }} ({{ currentPageSize }} per page)
    </div>
    <div class="flex flex-row gap-2 my-2">
      <UButton :disabled="isFirstPage" @click="prev">
        Previous
      </UButton>
      <UButton :disabled="isLastPage" @click="next">
        Next
      </UButton>
    </div>
    <UTable v-bind="computedTableProps" />
  </div>
</template>
