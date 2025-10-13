import type { IndexStats } from 'meilisearch'
import { useOffsetPagination } from '@vueuse/core'
import { useMeiliSearch } from './useMeilisearch'

export interface UseLoadMoreOptions {
  // Define any options if needed
  meiliIndex: Ref<string>
  pageSize?: Ref<number>
}

export function useLoadMore(options: UseLoadMoreOptions = { meiliIndex: ref('') }) {
  const { pageSize = ref(20), meiliIndex } = options
  const page = shallowRef(1)
  const stats = ref<IndexStats | undefined>(undefined)
  const { search, result, getStats } = useMeiliSearch(meiliIndex.value)

  onMounted(() => {
    getStats().then((data) => {
      stats.value = data
    })
  })

  async function fetchData({ currentPage, currentPageSize }: { currentPage: number, currentPageSize: number }) {
    await search('', {
      hitsPerPage: currentPageSize,
      page: currentPage,
    })
  }

  fetchData({ currentPage: page.value, currentPageSize: toValue(pageSize) })
  const totalHits = computed(() => result.value?.totalHits ?? 0)
  const {
    currentPage,
    currentPageSize,
    pageCount,
    isFirstPage,
    isLastPage,
    prev,
    next,
  } = useOffsetPagination({
    total: totalHits.value,
    page: 1,
    pageSize,
    onPageChange: fetchData,
    onPageSizeChange: fetchData,
  })

  return {
    pageSize,
    currentPage,
    currentPageSize,
    pageCount,
    isFirstPage,
    isLastPage,
    totalHits,
    prev,
    next,
    result,
    stats,
  }
}
