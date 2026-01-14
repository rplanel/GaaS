import type { SearchForFacetValuesParams, SearchForFacetValuesResponse } from 'meilisearch'
import { useState } from '#imports'

import { MeiliSearch } from 'meilisearch'

export function useMeiliFacetSearch(index: string) {
  const config = useRuntimeConfig()
  const { public: { meilisearch: { hostUrl, searchApiKey } } } = config

  const meilisearch = new MeiliSearch({
    host: hostUrl,
    apiKey: searchApiKey,
  })
  if (!index)
    throw new Error('`[nuxt-meilisearch]` Cannot search  without `index`')

  const facetResult = useState(`${index}-facet-search-result`, () => null as SearchForFacetValuesResponse | null)

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
