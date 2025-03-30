import type { GalaxyInvocation } from './types'

import { Effect } from 'effect'
import { runWithConfig } from './config'
import { GalaxyFetch, HttpError } from './galaxy'

export function getInvocationEffect(invocationId: string) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const invocation = Effect.tryPromise({
      try: () => fetchApi<GalaxyInvocation>(`api/invocations/${invocationId}`, {
        method: 'GET',
      }),
      catch: _caughtError => new HttpError({ message: `Error getting invocation ${invocationId}: ${_caughtError}` }),
    })
    return yield* invocation
  })
}

export function getInvocation(invocationId: string) {
  return getInvocationEffect(invocationId).pipe(
    Effect.provide(GalaxyFetch.Live),
    runWithConfig,
  )
}
