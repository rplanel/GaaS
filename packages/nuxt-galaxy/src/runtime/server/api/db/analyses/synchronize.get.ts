import type { Database } from '~/src/runtime/types/database'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { defineEventHandler } from 'h3'
import { synchronizeAnalyses } from '../../../utils/grizzle/analyses'

export default defineEventHandler(
  async (event) => {
    const supabaseClient = await serverSupabaseClient<Database>(event)
    const supabaseUser = await serverSupabaseUser(event)

    return synchronizeAnalyses(supabaseClient.id, supabaseUser.id)
  },
)
