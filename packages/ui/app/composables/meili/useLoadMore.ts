// type
import type { SortingState } from '@tanstack/table-core'
import type { UseOffsetPaginationReturn } from '@vueuse/core'
import type { Filter, IndexStats, SearchParams } from 'meilisearch'
import type { Ref, UnwrapNestedRefs } from 'vue'

import { useOffsetPagination, useRefHistory, watchThrottled } from '@vueuse/core'
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

type PaginationState = Pick<UnwrapNestedRefs<UseOffsetPaginationReturn>, 'currentPage' | 'currentPageSize'>

export function useLoadMore(options: UseLoadMoreOptions) {
  const initialTotalHits = ref<number>(0)
  const { history: initialTotalHitsHistory } = useRefHistory(initialTotalHits)
  const pageSize = options.pageSize ?? ref(20)
  const { sortingState, meiliIndex } = options
  const filterRef = (options.filter ?? ref([] as Filter)) as Ref<Filter>
  const searchTermRef = options.searchTerm ?? ref('')
  const page = shallowRef(1)
  const stats = ref<IndexStats | undefined>(undefined)
  const { search, result, error } = useMeiliSearch(meiliIndex.value)
  // const runOnce = ref(false)
  const meiliSort = computed(() => {
    if (!sortingState?.value || sortingState.value.length === 0) {
      return undefined
    }
    return sortingState.value.map((sort) => {
      return `${sort.id}:${sort.desc ? 'desc' : 'asc'}`
    })
  })

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
  const runPaginatedSearch = async ({ currentPage, currentPageSize }: PaginationState) => {
    const currentSearchParams: SearchParams = {
      hitsPerPage: currentPageSize,
      page: currentPage,
      facets: ['*'],
      filter: toValue(filterRef),
      q: toValue(searchTermRef),
      sort: toValue(meiliSort),
    }
    try {
      await fetchData({
        searchTerm: toValue(searchTermRef),
        searchParams: currentSearchParams,
      })
      // runOnce.value = true
    }
    catch (e) {
      console.error('MeiliSearch Error:', e)
    }
  }

  // const handlePaginationUpdate = async (state: PaginationState) => {
  //   await runPaginatedSearch(state)
  // }

  watch(filterRef, () => {
    page.value = 1
    void runPaginatedSearch({
      currentPage: page.value,
      currentPageSize: toValue(pageSize),
    })
  })
  watch(sortingState, () => {
    void runPaginatedSearch({
      currentPage: page.value,
      currentPageSize: toValue(pageSize),
    })
  })

  watchThrottled(searchTermRef, () => {
    page.value = 1
    void runPaginatedSearch({
      currentPage: page.value,
      currentPageSize: toValue(pageSize),
    })
  }, { throttle: 500 })

  void runPaginatedSearch({
    currentPage: page.value,
    currentPageSize: toValue(pageSize),
  })
  const totalHits = computed(() => result.value?.totalHits ?? 0)
  const { history: totalHitsHistory } = useRefHistory(totalHits)

  watch(totalHits, (newTotalHits, oldTotalHits) => {
    // console.log('totalHits changed from', oldTotalHits, 'to', newTotalHits)
    if (oldTotalHits === 0 && newTotalHits > 0) {
      initialTotalHits.value = newTotalHits
    }
  }, { once: true })

  const {
    currentPage,
    currentPageSize,
    pageCount,
    isFirstPage,
    isLastPage,
    prev,
    next,
  } = useOffsetPagination({
    total: totalHits,
    page,
    pageSize,
    onPageChange: runPaginatedSearch,
    onPageSizeChange: runPaginatedSearch,
  })

  return {
    pageSize,
    currentPage,
    currentPageSize,
    pageCount,
    isFirstPage,
    isLastPage,
    initialTotalHits,
    initialTotalHitsHistory,
    totalHits,
    totalHitsHistory,
    prev,
    next,
    result,
    search,
    stats,
    error,
  }
}
