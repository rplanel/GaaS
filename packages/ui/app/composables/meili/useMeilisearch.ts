// this code is from https://github.com/xlanex6/nuxt-meilisearch

import type { SearchParams, SearchResponse } from 'meilisearch'
import { useState } from '#imports'
import { MeiliSearch } from 'meilisearch'

export function useMeiliSearch(index: string) {
  const config = useRuntimeConfig()
  const { public: { meilisearch: { hostUrl, searchApiKey } } } = config

  const meilisearch = new MeiliSearch({
    host: hostUrl,
    apiKey: searchApiKey,
  })
  if (!index)
    throw new Error('`[nuxt-meilisearch]` Cannot search  without `index`')

  // const client = useMeiliSearchRef()
  const result = useState(`${index}-search-result`, () => null as SearchResponse | null)
  const search = async (query: string, searchParams?: SearchParams) => {
    const resp = await meilisearch.index(index).search(query, searchParams)
    result.value = resp as SearchResponse
    return resp
  }
  async function getStats() {
    return await meilisearch.index(index).getStats()
  }
  return {
    search,
    result,
    getStats,
  }
}
