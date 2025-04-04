import type { Database } from '~/src/runtime/types/database'
import { useRuntimeConfig } from '#imports'
import { serverSupabaseClient } from '#supabase/server'
import { exportWorkflow } from 'blendtype'
import { createError, defineEventHandler, readBody } from 'h3'
import { getCurrentUser } from '../../utils/grizzle/user'

export default defineEventHandler<
  {
    body: {
      galaxyId: string
      userId: number

    }
  }
>(
  async (event) => {
    const body = await readBody(event)
    const { galaxyId } = body
    const { public: { galaxy: { url } }, galaxy: { email } } = useRuntimeConfig()
    const galaxyWorkflow = await exportWorkflow(galaxyId)
    const galaxyUser = await getCurrentUser(url, email)

    const supabaseClient = await serverSupabaseClient<Database>(event)
    if (galaxyUser) {
      const { error, data } = await supabaseClient
        .schema('galaxy')
        .from('workflows')
        .insert({
          version: galaxyWorkflow.version,
          name: galaxyWorkflow.name,
          galaxy_id: galaxyId,
          user_id: galaxyUser.user.id,
          definition: galaxyWorkflow,
        })
      if (error) {
        if (error.code === '42501') {
          throw createError({ statusCode: 403, statusMessage: error.message })
        }
        else {
          throw createError({ statusCode: 500, statusMessage: `${error.message}\nsupabase error code : ${error.code}` })
        }
      }
      else {
        return data
      }
    }
    else {
      throw createError({ statusCode: 500, statusMessage: 'Could not get the galaxy user' })
    }
  },
)
