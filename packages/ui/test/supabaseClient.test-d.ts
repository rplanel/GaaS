/**
 * The client an app on the UI layer gets from `useSupabaseClient()` called
 * without a type argument. `.playground` is such an app: it extends the
 * layer and sets no `supabase.types`, so `@nuxtjs/supabase` types the client
 * with nuxt-galaxy's database types unless the layer sets its own (#196).
 *
 * `pnpm typecheck` checks this file. Vitest does not run it.
 */

import { useSupabaseClient } from '#imports'

const client = useSupabaseClient()

// Takes the galaxy schema and its tables. While the client is untyped it
// refuses even `schema('galaxy')`.
client.schema('galaxy').from('analyses').select('id')

// @ts-expect-error not a table or view of the galaxy schema
client.schema('galaxy').from('no_such_table')
