import type { Layer } from 'effect'
import type { GalaxyInvoke, GalaxyWorkflow, GalaxyWorkflowInput, GalaxyWorkflowParameters, GalaxyWorkflowRevision, GalaxyWorkflowsItem, rawGalaxyWorkflowExport, TagCollection } from './types'
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

/**
 * The export of one revision of a stored workflow.
 *
 * Galaxy exports the latest revision unless `version` names another: the
 * 0-based index `getWorkflowRevisionsEffect` lists and an invocation takes
 * (#48). A published version may pin an older revision (ADR 0004, #73), so
 * the export is asked for the one being published and its `version` and
 * `uuid` are that revision's. Left out, the latest is exported, as before.
 */
export function exportWorkflowEffect(workflowId: string, style: 'export' | 'run' | 'editor' | 'instance' = 'export', revision?: number) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const workflowEffect = Effect.tryPromise({
      try: () => fetchApi<rawGalaxyWorkflowExport>(
        `api/workflows/${workflowId}/download?style=${style}${revision === undefined ? '' : `&version=${revision}`}`,
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

export function exportWorkflow(workflowId: string, layer: Layer.Layer<GalaxyFetch>, style: 'export' | 'run' | 'editor' | 'instance' = 'export', revision?: number) {
  return exportWorkflowEffect(workflowId, style, revision).pipe(
    toGalaxyServiceUnavailable,
    Effect.provide(layer),
    Effect.runPromise,
  )
}

/** What `getWorkflowsEffect` lists beyond Galaxy's default answer. */
export interface GetWorkflowsOptions {
  /**
   * Also list the stored workflows the account hid in Galaxy's own list.
   * Galaxy's `GET /api/workflows` applies `hidden == show_hidden`: the
   * default answers the visible ones only, and `show_hidden=true` answers
   * only the hidden ones, so both are asked and the visible ones come first.
   * Hidden is a display flag of Galaxy's list and says nothing about whether
   * a workflow can be published or run.
   */
  readonly includeHidden?: boolean
}

/**
 * The stored workflows of the account, as Galaxy lists them: the visible
 * ones, and with `includeHidden` the hidden ones after them. Deleted ones are
 * never listed; Galaxy deletes softly and describes a deleted stored workflow
 * by id, `deleted: true`, which is how a reader tells one that is gone.
 */
export function getWorkflowsEffect(options: GetWorkflowsOptions = {}) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const list = (query?: { show_hidden: true }) => Effect.tryPromise({
      try: () => fetchApi<GalaxyWorkflowsItem[]>(
        'api/workflows',
        {
          method: 'GET',
          ...(query === undefined ? {} : { query }),
        },
      ),
      catch: caughtError => new WorkflowError({
        message: formatErrorMessage('workflows', undefined, 'Error getting', caughtError),
        statusCode: extractStatusCode(caughtError),
        cause: caughtError,
      }),
    })
    if (!options.includeHidden) {
      return yield* list()
    }
    const [visible, hidden] = yield* Effect.all([list(), list({ show_hidden: true })], { concurrency: 2 })
    return [...visible, ...hidden]
  }).pipe(withRetry)
}

export function getWorkflows(layer: Layer.Layer<GalaxyFetch>, options: GetWorkflowsOptions = {}) {
  return getWorkflowsEffect(options).pipe(
    toGalaxyServiceUnavailable,
    Effect.provide(layer),
    Effect.runPromise,
  )
}

/**
 * The revisions of a stored workflow, as Galaxy indexes them.
 *
 * `GET /api/workflows/{id}/versions` answers one entry per save, oldest
 * first, each with its 0-based index as `version`, when it was saved and how
 * many steps it has. The index is the one `exportWorkflowEffect` and an
 * invocation take, so this is the list a version is chosen from (ADR 0004).
 */
export function getWorkflowRevisionsEffect(workflowId: string) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const revisions = Effect.tryPromise({
      try: () => fetchApi<GalaxyWorkflowRevision[]>(
        `api/workflows/${workflowId}/versions`,
        {
          method: 'GET',
        },
      ),
      catch: caughtError => new WorkflowError({
        message: formatErrorMessage('workflow', workflowId, 'Error listing the revisions of', caughtError),
        workflowId,
        statusCode: extractStatusCode(caughtError),
        cause: caughtError,
      }),
    })
    return yield* revisions
  }).pipe(withRetry)
}

export function getWorkflowRevisions(workflowId: string, layer: Layer.Layer<GalaxyFetch>) {
  return getWorkflowRevisionsEffect(workflowId).pipe(
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

/**
 * The number Galaxy's editor gives a revision, from the 0-based index the API
 * carries.
 *
 * Galaxy indexes a stored workflow's revisions from 0: that index is what
 * `GET api/workflows/{id}/versions` lists as `version`, what the export
 * carries as `version`, what `download?version=` and an invocation take, and
 * what GaaS stores as a version's `revision`. Galaxy's editor shows the same
 * revision to a person as `version + 1` (`WorkflowVersionSelector.vue`), so
 * "Revision 3" to the API is "4" in the editor. Everything a person reads
 * goes through this; everything that travels keeps the index.
 */
export function galaxyRevisionNumber(index: number): number {
  return index + 1
}

export function getWorkflowTagVersion(tags: TagCollection): string | null {
  const tag = tags?.find(tag => tag.startsWith('version:'))
  return tag ? tag.replace('version:', '') : null
}

export function getWorkflowTagName(tags: TagCollection): string | null {
  const tag = tags?.find(tag => tag.startsWith('name:'))
  return tag ? tag.replace('name:', '') : null
}
