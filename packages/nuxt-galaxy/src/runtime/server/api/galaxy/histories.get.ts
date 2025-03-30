import type { Database } from '../../../types/database'
import type { RowHistory } from '~/src/runtime/types/nuxt-galaxy'
import { serverSupabaseClient } from '#supabase/server'
import { getHistory } from 'blendtype'
import { Effect } from 'effect'
import { defineEventHandler } from 'h3'

export default defineEventHandler(async (event) => {
  const supabaseClient = await serverSupabaseClient<Database>(event)
  const { data: historiesDb }: { data: RowHistory[] } = await supabaseClient
    .schema('galaxy')
    .from('histories')
    .select()
  if (historiesDb) {
    const effects = historiesDb.map((h) => {
      return Effect.tryPromise({
        try: () => getHistory(h.galaxy_id),
        catch: e => new Error(`Failed to get history ${h.galaxy_id}: ${e}`),
      })
    })
    return Effect.all(effects).pipe(Effect.runPromise)
  }
})
