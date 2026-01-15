import type { SearchForFacetValuesParams, SearchForFacetValuesResponse } from 'meilisearch'

import { MeiliSearch } from 'meilisearch'

export interface UseMeiliFacetSearchOptions {
  index: string
  facetName: string
}

export function useMeiliFacetSearch(options: UseMeiliFacetSearchOptions) {
  const config = useRuntimeConfig()
  const { index } = options
  const { public: { meilisearch: { hostUrl, searchApiKey } } } = config

  const meilisearch = new MeiliSearch({
    host: hostUrl,
    apiKey: searchApiKey,
  })
  if (!index)
    throw new Error('`[nuxt-meilisearch]` Cannot search  without `index`')

  // const facetResult = useState(`${index}-${facetName}-facet-search-result`, () => null as SearchForFacetValuesResponse | null)
  const facetResult = ref<SearchForFacetValuesResponse | undefined>(undefined)

  async function searchForFacetValues(params: SearchForFacetValuesParams) {
    const { facetName, facetQuery, filter, q } = params
    const resp = await meilisearch
      .index(index)
      .searchForFacetValues({ facetName, facetQuery, filter, exhaustiveFacetCount: true, q })
    facetResult.value = resp as SearchForFacetValuesResponse
    return resp
  }

  return { searchForFacetValues, facetResult }
}
