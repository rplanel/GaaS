import { useMeiliFacetSearch } from './useMeiliFacetSearch'

export interface UseFacetSearchOptions {
  meiliIndex: Ref<string>
  facetName?: string
}
export function useFacetSearch(options: UseFacetSearchOptions) {
  const { meiliIndex, facetName = 'facetName' } = options

  watch(meiliIndex, (newIndex) => {
    if (!newIndex) {
      throw new Error(`[GaaS]: you must profide a Meilisearch index to use facet search`)
    }
  }, { immediate: true })

  const { searchForFacetValues, facetResult } = useMeiliFacetSearch({
    index: meiliIndex.value,
    facetName,
  })

  return {
    searchForFacetValues,
    facetResult,
  }
}
