import type { Filter, SearchParams } from 'meilisearch'
import { watchThrottled } from '@vueuse/core'
import { useMeiliIndex } from './useMeiliIndex'
import { useMeiliSearch } from './useMeiliSearch'

export interface UseHeaderOptions {
  meiliIndex: Ref<string>
  filter?: Ref<Filter | undefined>
  searchTerm?: Ref<string>
}

export interface FetchDataParams {
  currentPage?: number
  currentPageSize?: number
  filter?: Filter | undefined
  searchTerm: string
  searchParams?: SearchParams
}

export function useAllIds(options: UseHeaderOptions) {
  const { meiliIndex } = options
  const { search, result, error } = useMeiliSearch(meiliIndex.value, 'all-ids')

  const { info, stats } = useMeiliIndex({ index: meiliIndex })

  // Meili index info
  const indexPrimaryKey = computed(() => {
    return info.value?.state?.primaryKey
  })

  // Meili index stats

  const numberOfDocuments = computed(() => {
    if (!stats.value?.state?.numberOfDocuments) {
      return 0
    }
    return stats.value.state.numberOfDocuments
  })

  // handle filters
  const filter = (options.filter ?? ref([] as Filter)) as Ref<Filter>
  watch(filter, () => {
    void fetchData()
  })

  // Search
  const searchTerm = options.searchTerm ?? ref('')
  watchThrottled(searchTerm, () => {
    fetchData()
  }, { throttle: 800 })

  // function to fetch ids from MeiliSearch
  async function fetchData() {
    const indexPrimaryKeyVal = toValue(indexPrimaryKey)
    const filterVal = toValue(filter)
    const searchTermVal = toValue(searchTerm)

    if (indexPrimaryKeyVal === undefined || searchTermVal === undefined || filterVal === undefined) {
      return
    }
    const currentSearchParams: SearchParams = {
      limit: numberOfDocuments.value,
      attributesToRetrieve: [indexPrimaryKeyVal],
      facets: [],
      filter: filterVal,
      q: searchTermVal,
    }
    await search(searchTermVal, currentSearchParams)
  }
  void fetchData()

  return {
    result,
    search,
    error,
    numberOfDocuments,
    indexPrimaryKey,
  }
}
