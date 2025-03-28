import type { Database } from '../../../types/database'
import { serverSupabaseClient } from '#supabase/server'
import { getHistory } from 'blendtype'
import { defineEventHandler } from 'h3'

export default defineEventHandler(async (event) => {
  const supabaseClient = await serverSupabaseClient<Database>(event)
  const { data: historiesDb } = await supabaseClient
    .schema('galaxy')
    .from('histories')
    .select()
  if (historiesDb) {
    return Promise.all(historiesDb.map((h) => {
      return getHistory(h.galaxy_id)
    }))
  }
})
