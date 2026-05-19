import type { Filter, SearchParams } from 'meilisearch'

export interface FetchDataParams {
  currentPage?: number
  currentPageSize?: number
  filter?: Filter | undefined
  searchTerm: string
  searchParams?: SearchParams
}
