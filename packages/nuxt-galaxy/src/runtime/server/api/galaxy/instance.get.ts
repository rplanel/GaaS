import type { GalaxyInstanceDetails } from '../../../types/nuxt-galaxy'
import { useRuntimeConfig } from '#imports'
import { getVersionEffect, toGalaxyServiceUnavailable } from 'blendtype'
import { Effect, Exit } from 'effect'
import { defineEventHandler } from 'h3'
import { runGalaxyEffect } from '../../utils/evlog-effect'
import { useGalaxyLayer } from '../../utils/galaxy'
import { toHttpError } from '../../utils/httpError'

export default defineEventHandler(async (event): Promise<GalaxyInstanceDetails> => {
  const { public: { galaxy: { url } } } = useRuntimeConfig()
  const result = await runGalaxyEffect(
    event,
    getVersionEffect.pipe(
      toGalaxyServiceUnavailable,
      Effect.provide(useGalaxyLayer()),
      Effect.exit,
    ),
  )

  return Exit.match(result, {
    onFailure: cause => toHttpError(event, cause, 'galaxy instance'),
    onSuccess: version => ({ url, ...version }),
  })
})
