import type { GalaxyClient } from 'blendtype'
import type { Database } from '../../../types/database'
import { serverSupabaseClient } from '#supabase/server'
import { defineEventHandler } from 'h3'

export default defineEventHandler(async (event) => {
  const supabaseClient = await serverSupabaseClient<Database>(event)
  const $galaxy: GalaxyClient = event.context?.galaxy
  const { data: historiesDb } = await supabaseClient
    .schema('galaxy')
    .from('histories')
    .select()
  if (historiesDb) {
    return Promise.all(historiesDb.map((h) => {
      return $galaxy.histories().getHistory(h.galaxy_id)
    }))
  }
})
