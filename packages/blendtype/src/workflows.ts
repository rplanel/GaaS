import type { GalaxyInvoke, GalaxyWorkflow, GalaxyWorkflowExport, GalaxyWorkflowInput, GalaxyWorkflowParameters, GalaxyWorkflowsItem, rawGalaxyWorkflowExport } from './types'
import { Effect } from 'effect'
import { runWithConfig } from './config'
import { GalaxyFetch, HttpError } from './galaxy'
import { galaxyWorkflowExportSchema } from './types'

export function getWorkflowEffect(workflowId: string) {
  return Effect.gen(function* (_) {
    const fetchApi = yield* _(GalaxyFetch)
    const workflow = Effect.tryPromise({
      try: () => fetchApi<GalaxyWorkflow>(
        `api/workflows/${workflowId}`,
        {
          method: 'GET',
        },
      ),
      catch: _caughtError => new HttpError({ message: `Error getting workflow ${workflowId}: ${_caughtError}` }),
    })
    return yield* _(workflow)
  })
}

export function getWorkflow(workflowId: string) {
  return getWorkflowEffect(workflowId).pipe(
    Effect.provide(GalaxyFetch.Live),
    runWithConfig,
  )
}

export function exportWorkflowEffect(workflowId: string, style: 'export' | 'run' | 'editor' | 'instance' = 'export') {
  return Effect.gen(function* (_) {
    const fetchApi = yield* _(GalaxyFetch)
    const workflowEffect = Effect.tryPromise({
      try: () => fetchApi<rawGalaxyWorkflowExport>(
        `api/workflows/${workflowId}/download?style=${style}`,
        {
          credentials: 'include',
          headers: {
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          },
          method: 'GET',
        },
      ),
      catch: _caughtError => new HttpError({ message: `Error exporting workflow ${workflowId}: ${_caughtError}` }),
    })
    const workflow = yield* _(workflowEffect)
    return galaxyWorkflowExportSchema.passthrough().parse(workflow) as GalaxyWorkflowExport
  })
}

export function exportWorkflow(workflowId: string, style: 'export' | 'run' | 'editor' | 'instance' = 'export') {
  return exportWorkflowEffect(workflowId, style).pipe(
    Effect.provide(GalaxyFetch.Live),
    runWithConfig,
  )
}

export function getWorkflowsEffect() {
  return Effect.gen(function* (_) {
    const fetchApi = yield* _(GalaxyFetch)
    const workflow = Effect.tryPromise({
      try: () => fetchApi<GalaxyWorkflowsItem[]>(
        'api/workflows',
        {
          method: 'GET',
        },
      ),
      catch: _caughtError => new HttpError({ message: `Error getting workflows ${_caughtError}` }),
    })
    return yield* _(workflow)
  })
}

export function getWorkflows() {
  return getWorkflowsEffect().pipe(
    Effect.provide(GalaxyFetch.Live),
    runWithConfig,
  )
}

export function invokeWorkflowEffect(historyGalaxyId: string, workflowId: string, inputs: GalaxyWorkflowInput, parameters: GalaxyWorkflowParameters) {
  return Effect.gen(function* (_) {
    const fetchApi = yield* _(GalaxyFetch)
    const workflow = Effect.tryPromise({
      try: () => fetchApi<GalaxyInvoke>(
        `api/workflows/${workflowId}/invocations`,
        {
          method: 'POST',
          body: { history_id: historyGalaxyId, inputs, parameters },
        },
      ),
      catch: _caughtError => new HttpError({ message: `Error invoking workflow ${workflowId}: ${_caughtError}` }),
    })
    return yield* _(workflow)
  })
}

export function invokeWorkflow(historyGalaxyId: string, workflowId: string, inputs: GalaxyWorkflowInput, parameters: GalaxyWorkflowParameters) {
  return invokeWorkflowEffect(historyGalaxyId, workflowId, inputs, parameters).pipe(
    Effect.provide(GalaxyFetch.Live),
    runWithConfig,
  )
}
