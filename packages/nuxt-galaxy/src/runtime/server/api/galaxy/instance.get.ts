import type { GalaxyInstanceDetails } from '../../../types/nuxt-galaxy'
import { useRuntimeConfig } from '#imports'
import { getVersionEffect, toGalaxyServiceUnavailable } from 'blendtype'
import { Effect, Either } from 'effect'
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
      Effect.either,
    ),
  )

  return Either.match(result, {
    onLeft: error => toHttpError(event, error, 'galaxy instance'),
    onRight: version => ({ url, ...version }),
  })
})
