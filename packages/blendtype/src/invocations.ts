import type { Layer } from 'effect'
import type { GalaxyInvocation } from './types'
import { Effect } from 'effect'
import { extractStatusCode, formatErrorMessage, InvocationError } from './errors'
import { GalaxyFetch, toGalaxyServiceUnavailable } from './galaxy'

export function getInvocationEffect(invocationId: string) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const invocation = Effect.tryPromise({
      try: () => fetchApi<GalaxyInvocation>(`api/invocations/${invocationId}`, {
        method: 'GET',
      }),
      catch: caughtError => new InvocationError({
        message: formatErrorMessage('invocation', invocationId, 'Error getting', caughtError),
        invocationId,
        statusCode: extractStatusCode(caughtError),
        cause: caughtError,
      }),
    })
    return yield* invocation
  })
}

export function getInvocation(invocationId: string, layer: Layer.Layer<GalaxyFetch>) {
  return getInvocationEffect(invocationId).pipe(
    toGalaxyServiceUnavailable,
    Effect.provide(layer),
    Effect.runPromise,
  )
}
