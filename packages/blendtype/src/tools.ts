import type { GalaxyTool } from './types'
import { Effect } from 'effect'
import { runWithConfig } from './config'
import { GalaxyFetch, HttpError } from './galaxy'

export function getToolEffect(toolId: string, version: string) {
  return Effect.gen(function* (_) {
    const fetchApi = yield* _(GalaxyFetch)
    const tool = Effect.tryPromise({
      try: () => fetchApi<GalaxyTool>(
        `api/tools/${toolId}?io_details=true&version=${version}`,
        {
          method: 'GET',
        },
      ),
      catch: _caughtError => new HttpError({ message: `Error getting tool ${toolId}: ${_caughtError}` }),
    })
    return yield* _(tool)
  })
}

export function getTool(toolId: string, version: string) {
  return getToolEffect(toolId, version).pipe(
    Effect.provide(GalaxyFetch.Live),
    runWithConfig,
  )
}
