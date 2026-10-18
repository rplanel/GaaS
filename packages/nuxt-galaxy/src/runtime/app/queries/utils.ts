import type { useRequestFetch } from '#imports'
import type { PostgrestSingleResponse } from '@supabase/postgrest-js'

/**
 * The fetch a query calls this application's own server with: what
 * `useRequestFetch()` answers, read in setup by whoever builds the options.
 *
 * Never the global `$fetch` (#139). During server-side rendering it forwards
 * neither headers nor cookies, so the request reached the server without the
 * reader's session and was answered 401; Pinia Colada rethrows a query's
 * failure during server-side rendering, so the 401 became Nuxt's error page.
 * Reached by client-side navigation the same page worked, because the browser
 * sends the cookie itself, which is why only a reload showed it.
 * `useRequestFetch()` forwards the request's headers on the server and is
 * the global `$fetch` in the browser. It has to be read in setup, where Nuxt
 * knows the request; a query function runs later, outside it, so the query
 * is handed it the way the Supabase queries are handed `supabase`.
 */
export type RequestFetch = ReturnType<typeof useRequestFetch>

export function supabaseResponseToData<TData>(response: PostgrestSingleResponse<TData>) {
  const { data, error, count } = response
  if (error) {
    throw new Error(`Supabase query failed: ${response.error.message}`)
  }

  // Count queries should use useSupabaseCount instead
  if (data === null && count !== null && count !== undefined) {
    throw new Error(
      'Count queries should use useSupabaseCount composable. '
      + 'This composable returns QueryData<T>, not number.',
    )
  }

  if (data === null) {
    throw new Error('No data returned from Supabase query')
  }

  return data as TData
}

export function supabaseResponseToCount<TData>(response: PostgrestSingleResponse<TData>) {
  const { error, count } = response
  if (error) {
    throw new Error(`Supabase count query failed: ${error.message}`)
  }

  if (count === null || count === undefined) {
    throw new Error('No count returned from Supabase count query')
  }

  return count
}
