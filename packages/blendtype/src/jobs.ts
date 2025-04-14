import type { ShowFullJobResponse } from './types'
import { Effect } from 'effect'
import { runWithConfig } from './config'
import { GalaxyFetch, HttpError } from './galaxy'

export function getJobEffect(jobId: string) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const job = Effect.tryPromise({
      try: () => fetchApi<ShowFullJobResponse>(`api/jobs/${jobId}?full=true`, {
        method: 'GET',
      }),
      catch: _caughtError => new HttpError({ message: `Error getting job ${jobId}: ${_caughtError}` }),
    })
    return yield* job
  })
}

export function getJob(jobId: string) {
  return getJobEffect(jobId).pipe(
    Effect.provide(GalaxyFetch.Live),
    runWithConfig,
  )
}
