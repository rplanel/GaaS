import type { GalaxyVersion } from 'blendtype'
import type { GalaxyInstanceDetails } from '../../../types/nuxt-galaxy'
import { useRuntimeConfig } from '#imports'
import { getVersion, initialize, NoConfigError } from 'blendtype'
import { Effect } from 'effect'
// import { useRuntimeConfig } from '@nuxt/kit'
import { defineEventHandler } from 'h3'

export default defineEventHandler(async (): Promise<GalaxyInstanceDetails> => {
  const { public: { galaxy: { url } }, galaxy: { apiKey } } = useRuntimeConfig()
  // initialize({ apiKey, url })

  const wf = Effect.gen(function* (_) {
    return yield* _(Effect.tryPromise({
      try: () => getVersion(),
      catch: _caughtError => new NoConfigError({ message: `Error getting version: ${_caughtError}` }),
    }))
  })
  wf.pipe(
    Effect.catchTag('NoConfigError', (_) => {
      initialize({ apiKey, url })
      return wf
    }),
  )
  const version: GalaxyVersion = await getVersion()
  return { url, ...version }
})
