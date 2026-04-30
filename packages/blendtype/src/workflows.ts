import type { Layer } from 'effect'
import type { GalaxyInvoke, GalaxyWorkflow, GalaxyWorkflowExport, GalaxyWorkflowInput, GalaxyWorkflowParameters, GalaxyWorkflowsItem, rawGalaxyWorkflowExport, TagCollection } from './types'
import { Effect, Exit } from 'effect'
import { extractStatusCode, formatErrorMessage, WorkflowError } from './errors'
import { GalaxyFetch, toGalaxyServiceUnavailable } from './galaxy'
import { galaxyWorkflowExportSchema } from './types'

export function getWorkflowEffect(workflowId: string) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const workflow = Effect.tryPromise({
      try: () => fetchApi<GalaxyWorkflow>(
        `api/workflows/${workflowId}`,
        {
          method: 'GET',
        },
      ),
      catch: caughtError => new WorkflowError({
        message: formatErrorMessage('workflow', workflowId, 'Error getting', caughtError),
        workflowId,
        statusCode: extractStatusCode(caughtError),
        cause: caughtError,
      }),
    })
    return yield* workflow
  })
}

export function getWorkflow(workflowId: string, layer: Layer.Layer<GalaxyFetch>) {
  return getWorkflowEffect(workflowId).pipe(
    toGalaxyServiceUnavailable,
    Effect.provide(layer),
    Effect.runPromise,
  )
}

export function exportWorkflowEffect(workflowId: string, style: 'export' | 'run' | 'editor' | 'instance' = 'export') {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
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
      catch: caughtError => new WorkflowError({
        message: formatErrorMessage('workflow', workflowId, 'Error exporting', caughtError),
        workflowId,
        statusCode: extractStatusCode(caughtError),
        cause: caughtError,
      }),
    })
    const workflow = yield* workflowEffect
    return galaxyWorkflowExportSchema.passthrough().parse(workflow) as GalaxyWorkflowExport
  })
}

export function exportWorkflow(workflowId: string, layer: Layer.Layer<GalaxyFetch>, style: 'export' | 'run' | 'editor' | 'instance' = 'export') {
  return exportWorkflowEffect(workflowId, style).pipe(
    toGalaxyServiceUnavailable,
    Effect.provide(layer),
    Effect.runPromise,
  )
}

export function getWorkflowsEffect() {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const workflow = Effect.tryPromise({
      try: () => fetchApi<GalaxyWorkflowsItem[]>(
        'api/workflows',
        {
          method: 'GET',
        },
      ),
      catch: caughtError => new WorkflowError({
        message: formatErrorMessage('workflows', undefined, 'Error getting', caughtError),
        statusCode: extractStatusCode(caughtError),
        cause: caughtError,
      }),
    })
    return yield* workflow
  })
}

export function getWorkflows(layer: Layer.Layer<GalaxyFetch>) {
  return getWorkflowsEffect().pipe(
    toGalaxyServiceUnavailable,
    Effect.provide(layer),
    Effect.runPromise,
  )
}

export function invokeWorkflowEffect(historyGalaxyId: string, workflowId: string, inputs: GalaxyWorkflowInput, parameters: GalaxyWorkflowParameters) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const workflow = Effect.tryPromise({
      try: () => fetchApi<GalaxyInvoke>(
        `api/workflows/${workflowId}/invocations`,
        {
          method: 'POST',
          body: { history_id: historyGalaxyId, inputs, parameters },
        },
      ),
      catch: caughtError => new WorkflowError({
        message: formatErrorMessage('workflow', workflowId, 'Error invoking', caughtError),
        workflowId,
        statusCode: extractStatusCode(caughtError),
        cause: caughtError,
      }),
    })
    return yield* workflow
  })
}

export function invokeWorkflow(historyGalaxyId: string, workflowId: string, inputs: GalaxyWorkflowInput, parameters: GalaxyWorkflowParameters, layer: Layer.Layer<GalaxyFetch>) {
  return invokeWorkflowEffect(historyGalaxyId, workflowId, inputs, parameters).pipe(
    toGalaxyServiceUnavailable,
    Effect.provide(layer),
    Effect.runPromise,
  )
}

export function getWorkflowTagVersion(tags: TagCollection) {
  const workflowVersionTagExit = Effect.runSyncExit(Effect.gen(function* () {
    const tag = tags?.find(tag => tag.startsWith('version:'))
    if (tag) {
      const tagVersion = tag.replace('version:', '')
      return yield* Effect.succeed(tagVersion)
    }
    return yield* Effect.fail(new Error('No tag version found'))
  }))
  return Exit.match(workflowVersionTagExit, {
    onFailure: _ => null,
    onSuccess: value => value,
  })
}

export function getWorkflowTagName(tags: TagCollection) {
  const workflowTagNameExit = Effect.runSyncExit(Effect.gen(function* () {
    const tag = tags?.find(tag => tag.startsWith('name:'))
    if (tag) {
      const tagName = tag.replace('name:', '')
      return yield* Effect.succeed(tagName)
    }
    return yield* Effect.fail(new Error('No tag name found'))
  }))
  return Exit.match(workflowTagNameExit, {
    onFailure: _ => null,
    onSuccess: value => value,
  })
}
