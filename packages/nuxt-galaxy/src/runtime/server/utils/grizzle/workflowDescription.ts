import type { GalaxyFetch, GalaxyTool, GalaxyWorkflow, WorkflowError } from 'blendtype'
import type { GalaxyCache } from '../galaxyCache'
import type { UnavailableTool } from './workflowTools'
import * as bt from 'blendtype'
import { Data, Effect } from 'effect'
import { pinnedToolsOfSteps, resolvePinnedToolsEffect } from './workflowTools'

/**
 * Galaxy holds no such workflow, or no such revision of it: a 404 on the
 * read of the workflow itself.
 *
 * Told apart from every other way that read can fail because it is the one
 * the caller can act on. Galaxy answering 500 for a workflow it does hold is
 * this server's problem to log, not a revision to report as absent.
 */
export class WorkflowRevisionNotFound extends Data.TaggedError('WorkflowRevisionNotFound')<{
  readonly message: string
}> {}

/**
 * Everything a client needs to draw one revision of one workflow and offer
 * its parameters, in one answer (Q13(a)).
 *
 * `steps` and `inputs` are the live payload's own, verbatim: normalising them
 * is #88's job and flipping the source to the stored definition is #12's, and
 * both happen behind this contract. `tools` carries resolved definitions
 * only, keyed `<toolId>@<version>` — a mismatched definition is never
 * rendered, which is exactly what `require_exact_tool_versions` means.
 *
 * The derivation from here — which widget a parameter maps to — stays on the
 * client: it maps to Vue components and cannot move server-side without
 * being split.
 */
export interface WorkflowDescription {
  readonly steps: GalaxyWorkflow['steps']
  readonly inputs: GalaxyWorkflow['inputs']
  readonly tools: Record<string, GalaxyTool>
  readonly unavailable: UnavailableTool[]
}

/**
 * One revision of one workflow, described.
 *
 * The revision is mandatory, and that is what makes the caching rule
 * structural rather than conditional (Q15): a pinned revision is immutable,
 * so caching it for ever is correct, and an unpinned caller has no route here
 * to misuse. The workflow is read from the cache first and written to it
 * after; its tools are resolved in one pass that answers both their
 * definitions and their verdicts (Q22).
 *
 * Only Galaxy refusing the workflow itself fails this. A tool it could not
 * answer for lands in `unavailable`.
 */
export function workflowDescriptionEffect(
  workflowId: string,
  revision: number,
  cache: GalaxyCache,
  galaxyUrl: string,
): Effect.Effect<WorkflowDescription, WorkflowError | WorkflowRevisionNotFound, GalaxyFetch> {
  return Effect.gen(function* () {
    const cached = yield* cache.workflow(galaxyUrl, workflowId, revision)
    const workflow = cached ?? (yield* bt.getWorkflowEffect(workflowId, revision).pipe(
      Effect.catchIf(
        error => error.statusCode === 404,
        () => Effect.fail(new WorkflowRevisionNotFound({
          message: `Galaxy holds no revision ${revision} of workflow ${workflowId}`,
        })),
      ),
    ))
    if (!cached) {
      yield* cache.writeWorkflow(galaxyUrl, workflowId, revision, workflow)
    }
    const pinned = pinnedToolsOfSteps(Object.values(workflow.steps ?? {}))
    const { tools, unavailable } = yield* resolvePinnedToolsEffect(pinned, cache, galaxyUrl)
    return {
      steps: workflow.steps,
      inputs: workflow.inputs,
      tools,
      unavailable,
    }
  })
}
