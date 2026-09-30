import type { GalaxyFetch, ToolError, WorkflowError } from 'blendtype'
import type { PinnedTool } from './workflowTools'
import * as bt from 'blendtype'
import { Effect } from 'effect'
import { galaxyHasNoSuchThing } from './galaxyHasNoSuchThing'
import { missingToolsEffect } from './workflowTools'

/**
 * The state of a version (ADR 0004, #76): the live reading the admin page
 * takes from Galaxy of whether the version can still run. A reading, never
 * stored, and nothing is retired from it: the administrator reads it and
 * decides, retiring being the remedy.
 *
 * - `runnable`: Galaxy lists the stored workflow, holds the revision the
 *   version pinned, and every tool of that revision at its pinned version.
 * - `tools-missing`: the revision is there but Galaxy does not hold every
 *   tool at its pinned version, so Galaxy would refuse to run it
 *   (`require_exact_tool_versions`); the missing ones are named.
 * - `missing-in-galaxy`: the stored workflow no longer exists there.
 * - `revision-mismatch`: the revision Galaxy holds at that index is not the
 *   one the version pinned, or the index names no revision any more: the
 *   history was rewritten or shortened. Galaxy's uuid travels when there is
 *   one, so the administrator can see the two side by side.
 */
export type VersionState
  = | { readonly state: 'runnable' }
    | { readonly state: 'tools-missing', readonly missingTools: PinnedTool[] }
    | { readonly state: 'missing-in-galaxy' }
    | { readonly state: 'revision-mismatch', readonly galaxyRevisionUuid?: string }

/** What of a version row the reading needs: the stored workflow, the revision by index and by uuid. */
export interface PinnedRevision {
  readonly galaxyId: string
  readonly revision: number
  readonly revisionUuid: string
}

/**
 * The state of one version, read from Galaxy in three steps, each stopping
 * the reading when it decides it, so nothing is asked that the answer no
 * longer needs.
 *
 * 1. The stored workflow. Galaxy deletes softly: a deleted stored workflow
 *    is left out of `GET api/workflows` but `GET api/workflows/{id}` still
 *    describes it, `deleted: true`. So both a 4xx and a `deleted` answer read
 *    as missing in Galaxy; the administrator removed it, whatever the status
 *    says.
 * 2. The export of the pinned revision, by index. A 4xx means the index
 *    names no revision any more; an export whose `uuid` is not the one
 *    pinned means another revision sits at that index. Both are a revision
 *    mismatch. Galaxy neither rewrites a revision nor reuses an id (ADR
 *    0004), so this is the one place the stored uuid is compared, never at
 *    analysis start.
 * 3. The tools of that revision at their pinned version, the check publishing
 *    runs (#75). Any missing is tools missing; none is runnable.
 *
 * Galaxy being unwell during any step fails the reading as blendtype's own
 * failure, so the endpoint answers 503 or a logged fault, never a state the
 * administrator might act on. The effect needs a Galaxy client and nothing
 * else: the reading writes nowhere, and its requirement type says so.
 */
export function versionStateEffect(version: PinnedRevision): Effect.Effect<VersionState, WorkflowError | ToolError, GalaxyFetch> {
  return Effect.gen(function* () {
    const stored = yield* bt.getWorkflowEffect(version.galaxyId).pipe(
      Effect.map(answer => ({ found: true as const, deleted: answer.deleted === true })),
      Effect.catchIf(galaxyHasNoSuchThing, () => Effect.succeed({ found: false as const, deleted: false })),
    )
    if (!stored.found || stored.deleted) {
      return { state: 'missing-in-galaxy' } satisfies VersionState
    }

    const exported = yield* bt.exportWorkflowEffect(version.galaxyId, 'export', version.revision).pipe(
      Effect.catchIf(galaxyHasNoSuchThing, () => Effect.succeed(undefined)),
    )
    if (exported === undefined) {
      return { state: 'revision-mismatch' } satisfies VersionState
    }
    if (exported.uuid !== version.revisionUuid) {
      return { state: 'revision-mismatch', galaxyRevisionUuid: exported.uuid } satisfies VersionState
    }

    const missingTools = yield* missingToolsEffect(exported)
    if (missingTools.length > 0) {
      return { state: 'tools-missing', missingTools } satisfies VersionState
    }
    return { state: 'runnable' } satisfies VersionState
  })
}
