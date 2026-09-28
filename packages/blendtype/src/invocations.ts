import type { Layer } from 'effect'
import type { GalaxyInvocation, InvocationJobsSummary } from './types'
import { Effect } from 'effect'
import { extractStatusCode, formatErrorMessage, InvocationError } from './errors'
import { GalaxyFetch, toGalaxyServiceUnavailable, withRetry } from './galaxy'

/** How much of an invocation to ask Galaxy for. */
export interface GetInvocationOptions {
  /**
   * Serialise each step with its jobs. Without it a step that maps over a
   * collection reports `job_id: null` and its jobs are unreachable, so any
   * caller that records or counts a step's jobs needs this on.
   */
  readonly stepDetails?: boolean
}

export function getInvocationEffect(invocationId: string, options: GetInvocationOptions = {}) {
  const query = options.stepDetails ? { step_details: true } : undefined
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const invocation = Effect.tryPromise({
      try: () => fetchApi<GalaxyInvocation>(`api/invocations/${encodeURIComponent(invocationId)}`, {
        method: 'GET',
        ...(query === undefined ? {} : { query }),
      }),
      catch: caughtError => new InvocationError({
        message: formatErrorMessage('invocation', invocationId, 'Error getting', caughtError),
        invocationId,
        statusCode: extractStatusCode(caughtError),
        cause: caughtError,
      }),
    })
    return yield* invocation
  }).pipe(withRetry)
}

export function getInvocationJobsSummaryEffect(invocationId: string) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const summary = Effect.tryPromise({
      try: () => fetchApi<InvocationJobsSummary>(`api/invocations/${encodeURIComponent(invocationId)}/jobs_summary`, {
        method: 'GET',
      }),
      catch: caughtError => new InvocationError({
        message: formatErrorMessage('invocation jobs summary', invocationId, 'Error getting', caughtError),
        invocationId,
        statusCode: extractStatusCode(caughtError),
        cause: caughtError,
      }),
    })
    return yield* summary
  }).pipe(withRetry)
}

export function getInvocationJobsSummary(invocationId: string, layer: Layer.Layer<GalaxyFetch>) {
  return getInvocationJobsSummaryEffect(invocationId).pipe(
    toGalaxyServiceUnavailable,
    Effect.provide(layer),
    Effect.runPromise,
  )
}

export function getInvocation(invocationId: string, layer: Layer.Layer<GalaxyFetch>, options: GetInvocationOptions = {}) {
  return getInvocationEffect(invocationId, options).pipe(
    toGalaxyServiceUnavailable,
    Effect.provide(layer),
    Effect.runPromise,
  )
}
