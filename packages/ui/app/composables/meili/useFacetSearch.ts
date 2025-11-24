import { useMeiliFacetSearch } from './useMeiliFacetSearch'

export interface UseFacetSearchOptions {
  meiliIndex: Ref<string>
}
export function useFacetSearch(options: UseFacetSearchOptions) {
  const { meiliIndex } = options
  const { searchForFacetValues, facetResult } = useMeiliFacetSearch(meiliIndex.value)

  return {
    searchForFacetValues,
    facetResult,
  }
}
