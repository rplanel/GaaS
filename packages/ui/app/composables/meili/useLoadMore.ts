// type
import type { SortingState } from '@tanstack/table-core'
import type { Filter, IndexStats, SearchParams } from 'meilisearch'
import type { Ref } from 'vue'

import { useOffsetPagination, watchThrottled } from '@vueuse/core'
import { computed, ref, toValue, watch } from 'vue'
import { useMeiliSearch } from './useMeiliSearch'

export interface UseLoadMoreOptions {
  // Define any options if needed
  meiliIndex: Ref<string>
  pageSize?: Ref<number>
  filter?: Ref<Filter | undefined>
  searchTerm?: Ref<string>
  sortingState: Ref<SortingState | undefined>
}

export interface FetchDataParams {
  currentPage?: number
  currentPageSize?: number
  filter?: Filter | undefined
  searchTerm: string
  searchParams?: SearchParams
}

// type PaginationState = Pick<UnwrapNestedRefs<UseOffsetPaginationReturn>, 'currentPage' | 'currentPageSize'>

export function useLoadMore(options: UseLoadMoreOptions) {
  const pageSize = options.pageSize ?? ref(20)
  const { sortingState, meiliIndex } = options
  const filterRef = (options.filter ?? ref([] as Filter)) as Ref<Filter>
  const searchTermRef = options.searchTerm ?? ref('')
  const page = shallowRef(1)
  const stats = ref<IndexStats | undefined>(undefined)
  const { search, result, error } = useMeiliSearch(meiliIndex.value)
  const meiliSort = computed(() => {
    if (!sortingState?.value || sortingState.value.length === 0) {
      return undefined
    }
    return sortingState.value.map((sort) => {
      return `${sort.id}:${sort.desc ? 'desc' : 'asc'}`
    })
  })
  const searchParams = computed<SearchParams>(() => ({
    limit: toValue(pageSize) + 1,
    offset: (toValue(page) - 1) * toValue(pageSize),
    facets: ['*'],
    filter: toValue(filterRef),
    q: toValue(searchTermRef),
    sort: toValue(meiliSort),
  }))

  // const error = ref<string | undefined>(undefined)
  async function fetchData({ searchTerm, searchParams }: FetchDataParams) {
    await search(searchTerm, searchParams)
  }

  /**
   * Executes a paginated search operation with the current pagination state.
   *
   * This function fetches data from MeiliSearch using the provided pagination parameters
   * (current page and page size) along with the current filter and search term values.
   *
   * @param params - The pagination state object
   * @param params.currentPage - The page number to fetch (1-indexed)
   * @param params.currentPageSize - The number of items per page
   * @returns A promise that resolves when the search operation completes
   *
   * @example
   * ```typescript
   * await runPaginatedSearch({ currentPage: 1, currentPageSize: 20 })
   * ```
   */
  const runPaginatedSearch = async () => {
    try {
      await fetchData({
        searchTerm: toValue(searchTermRef),
        searchParams: toValue(searchParams),
      })
      // runOnce.value = true
    }
    catch (e) {
      console.error('MeiliSearch Error:', e)
    }
  }

  watch(filterRef, () => {
    page.value = 1
    void runPaginatedSearch()
  })
  watch(sortingState, () => {
    void runPaginatedSearch()
  })

  watchThrottled(searchTermRef, () => {
    page.value = 1
    void runPaginatedSearch()
  }, { throttle: 500 })

  void runPaginatedSearch()
  const estimatedTotalHits = computed(() => result.value?.estimatedTotalHits ?? 0)

  const hitsCount = computed(() => result.value?.hits.length ?? 0)

  const sanitizedResults = computed(() => {
    const resultVal = toValue(result)
    if (!resultVal)
      return
    return { ...resultVal, hits: resultVal.hits.slice(0, toValue(pageSize)) }
  })

  const {
    currentPage,
    currentPageSize,
    pageCount,
    isFirstPage,
    // isLastPage,
    prev,
    next,
  } = useOffsetPagination({
    // total: totalHits,
    page,
    pageSize,
    onPageChange: runPaginatedSearch,
    onPageSizeChange: runPaginatedSearch,
  })

  const isLastPage = computed(() => {
    return hitsCount.value < toValue(pageSize)
  })

  return {
    pageSize,
    currentPage,
    currentPageSize,
    searchParams,
    pageCount,
    isFirstPage,
    isLastPage,
    totalHits: estimatedTotalHits,
    prev,
    next,
    result: sanitizedResults,
    search,
    stats,
    error,
  }
}
