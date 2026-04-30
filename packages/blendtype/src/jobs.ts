import type { Layer } from 'effect'
import type { ShowFullJobResponse } from './types'
import { Effect } from 'effect'
import { extractStatusCode, formatErrorMessage, JobError } from './errors'
import { GalaxyFetch, toGalaxyServiceUnavailable } from './galaxy'

export function getJobEffect(jobId: string) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const job = Effect.tryPromise({
      try: () => fetchApi<ShowFullJobResponse>(`api/jobs/${jobId}?full=true`, {
        method: 'GET',
      }),
      catch: caughtError => new JobError({
        message: formatErrorMessage('job', jobId, 'Error getting', caughtError),
        jobId,
        statusCode: extractStatusCode(caughtError),
        cause: caughtError,
      }),
    })
    return yield* job
  })
}

export function getJob(jobId: string, layer: Layer.Layer<GalaxyFetch>) {
  return getJobEffect(jobId).pipe(
    toGalaxyServiceUnavailable,
    Effect.provide(layer),
    Effect.runPromise,
  )
}
