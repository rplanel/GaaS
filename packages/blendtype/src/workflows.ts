import type { Layer } from 'effect'
import type { GalaxyInvoke, GalaxyWorkflow, GalaxyWorkflowInput, GalaxyWorkflowParameters, GalaxyWorkflowsItem, rawGalaxyWorkflowExport, TagCollection } from './types'
import { Effect } from 'effect'
import { extractStatusCode, formatErrorMessage, WorkflowError } from './errors'
import { GalaxyFetch, toGalaxyServiceUnavailable, withRetry } from './galaxy'
import { galaxyWorkflowExportSchema } from './types'

/**
 * One stored workflow as Galaxy describes it, at one revision.
 *
 * Galaxy keeps every save of a stored workflow as a revision and answers
 * `GET /api/workflows/{id}` with the latest unless `version` names another:
 * the 0-based index of the revision, oldest first, which is the integer the
 * export's own `version` field carries and the one an invocation takes (#48).
 * Left out, the latest is described, as before.
 */
export function getWorkflowEffect(workflowId: string, revision?: number) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const workflow = Effect.tryPromise({
      try: () => fetchApi<GalaxyWorkflow>(
        `api/workflows/${workflowId}`,
        {
          method: 'GET',
          ...(revision === undefined ? {} : { query: { version: revision } }),
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
  }).pipe(withRetry)
}

export function getWorkflow(workflowId: string, layer: Layer.Layer<GalaxyFetch>, revision?: number) {
  return getWorkflowEffect(workflowId, revision).pipe(
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
    return yield* Effect.try({
      try: () => galaxyWorkflowExportSchema.passthrough().parse(workflow),
      catch: cause => new WorkflowError({
        message: `Invalid workflow export format for workflow ${workflowId}`,
        workflowId,
        cause,
      }),
    })
  }).pipe(withRetry)
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
  }).pipe(withRetry)
}

export function getWorkflows(layer: Layer.Layer<GalaxyFetch>) {
  return getWorkflowsEffect().pipe(
    toGalaxyServiceUnavailable,
    Effect.provide(layer),
    Effect.runPromise,
  )
}

/**
 * Start `workflowId` in the history `historyGalaxyId` with `inputs` and
 * `parameters`.
 *
 * `revision` is the 0-based index of the revision to run, the same integer
 * the export's `version` field carries; Galaxy resolves it with
 * `get_internal_version`. Left out, Galaxy runs the latest revision of the
 * stored workflow, which is what every caller got before #48 and what let a
 * save in Galaxy's editor change what the next analysis ran.
 */
export function invokeWorkflowEffect(historyGalaxyId: string, workflowId: string, inputs: GalaxyWorkflowInput, parameters: GalaxyWorkflowParameters, revision?: number) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const workflow = Effect.tryPromise({
      try: () => fetchApi<GalaxyInvoke>(
        `api/workflows/${workflowId}/invocations`,
        {
          method: 'POST',
          body: {
            history_id: historyGalaxyId,
            inputs,
            parameters,
            ...(revision === undefined ? {} : { version: revision }),
          },
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

export function invokeWorkflow(historyGalaxyId: string, workflowId: string, inputs: GalaxyWorkflowInput, parameters: GalaxyWorkflowParameters, layer: Layer.Layer<GalaxyFetch>, revision?: number) {
  return invokeWorkflowEffect(historyGalaxyId, workflowId, inputs, parameters, revision).pipe(
    toGalaxyServiceUnavailable,
    Effect.provide(layer),
    Effect.runPromise,
  )
}

export function getWorkflowTagVersion(tags: TagCollection): string | null {
  const tag = tags?.find(tag => tag.startsWith('version:'))
  return tag ? tag.replace('version:', '') : null
}

export function getWorkflowTagName(tags: TagCollection): string | null {
  const tag = tags?.find(tag => tag.startsWith('name:'))
  return tag ? tag.replace('name:', '') : null
}
