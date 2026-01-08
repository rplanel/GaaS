// this code is from https://github.com/xlanex6/nuxt-meilisearch

import type { SearchParams, SearchResponse } from 'meilisearch'
import { useState } from '#imports'
import { MeiliSearch } from 'meilisearch'

export function useMeiliSearch(index: string, stateIndexSuffix: string = '') {
  const config = useRuntimeConfig()
  const { public: { meilisearch: { hostUrl, searchApiKey } } } = config

  const meilisearch = new MeiliSearch({
    host: hostUrl,
    apiKey: searchApiKey,
  })
  if (!index)
    throw new Error('`[nuxt-meilisearch]` Cannot search  without `index`')

  const result = useState(`ms-${index}-search-result-${stateIndexSuffix}`, () => null as SearchResponse | null)
  const error = ref<string | undefined>(undefined)
  const search = async (query: string, searchParams?: SearchParams) => {
    try {
      const resp = await meilisearch.index(index).search(query, searchParams)
      result.value = resp
      return resp
    }
    catch (e) {
      console.error('MeiliSearch Error:', e)
      result.value = null
      error.value = getErrorMessage(e)
      // throw createError({ statusCode: 500, statusMessage: e.message })
    }
  }
  async function getStats() {
    return await meilisearch.index(index).getStats()
  }
  return {
    error,
    search,
    result,
    getStats,
  }
}
