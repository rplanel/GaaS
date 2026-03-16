import type { PostgrestSingleResponse } from '@supabase/postgrest-js'

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
