import type { GalaxyFetch, GalaxyTool } from 'blendtype'
import type { GalaxyCache } from '../galaxyCache'
import type { DescribedStep, DescribedWorkflowInput } from './storedDefinition'
import type { GalaxyUserNotFoundError, GetCurrentUserError } from './user'
import type { UnavailableTool } from './workflowTools'
import { galaxyWorkflowExportSchema } from 'blendtype'
import { and, eq } from 'drizzle-orm'
import { Data, Effect } from 'effect'
import { workflows } from '../../db/schema/galaxy/workflows'
import { Drizzle } from '../drizzle'
import { takeUniqueOrNull } from './helper'
import { describedInputsOf, describedStepsOf, predatesWidenedSchema } from './storedDefinition'
import { getCurrentUserEffect } from './user'
import { pinnedToolsOfSteps, resolvePinnedToolsEffect } from './workflowTools'

/**
 * No published version pins that revision of that stored workflow (ADR
 * 0004).
 *
 * Told apart from every other way this read can fail because it is the one
 * the caller can act on: the identifier names nothing. The database being
 * unreachable is this server's problem to log, not a revision to report as
 * absent.
 *
 * It no longer means "Galaxy holds no such revision". Since #88 the answer
 * comes from the export captured at publish, so a revision Galaxy has since
 * lost is still described — which is the point, and what lets an analysis
 * that ran on it keep its page.
 */
export class WorkflowRevisionNotFound extends Data.TaggedError('WorkflowRevisionNotFound')<{
  readonly message: string
}> {}

/**
 * The stored definition is not the revision the version pinned.
 *
 * Q11's refusal, and the reason Q12 was required to implement it: the
 * comparison — the export's `uuid` against the version's `revision_uuid` —
 * already existed in `versionStateEffect`, but the live payload the graph
 * used to read carries only `latest_workflow_uuid`, the newest revision's,
 * whatever version was asked for. Reading the stored definition puts the
 * pinned revision's own uuid in hand, so the check costs no round trip.
 *
 * It should be unreachable: publishing writes both out of one export, and
 * nothing rewrites either afterwards. It is here so that a row the two
 * columns disagree about is **said** rather than drawn — a graph of the
 * wrong revision looks exactly like a graph of the right one.
 */
export class StoredDefinitionStale extends Data.TaggedError('StoredDefinitionStale')<{
  readonly message: string
}> {}

/**
 * The stored definition cannot be read as one, so the revision cannot be
 * described from it.
 *
 * Two causes, both about the row rather than about this request: it does not
 * parse as an export at all, or it was written before the export schema was
 * widened (#82) and so holds a set of steps with nothing joining them. The
 * second is the one worth naming — such a row parses perfectly and would be
 * drawn as a workflow whose steps are unconnected, and nothing about that
 * picture looks wrong.
 *
 * The remedy is to republish the version, never to repair the row: there is
 * no production data, so schema changes here are a drop and republish (ADR
 * 0004).
 */
export class StoredDefinitionUnreadable extends Data.TaggedError('StoredDefinitionUnreadable')<{
  readonly message: string
}> {}

/** The database refused or failed the read of the version row: a fault, not an answer. */
export class ReadStoredDefinitionError extends Data.TaggedError('ReadStoredDefinitionError')<{
  readonly message: string
}> {}

/**
 * Everything a client needs to draw one revision of one workflow and offer
 * its parameters, in one answer (Q13(a)).
 *
 * `steps` and `inputs` come from the **stored definition** — the export
 * captured when the version was published — normalised to one shape (#88,
 * Q12). They used to be the live payload's own, verbatim, and could not stay
 * so: `GET /api/workflows/{id}` keys a step's connections by input name in
 * an overwrite loop, so an input fed by two upstream outputs silently keeps
 * one edge; it carries no output list; and it carries no uuid for the
 * revision asked for, only the latest one's.
 *
 * `tools` carries resolved definitions only, keyed `<toolId>@<version>` — a
 * mismatched definition is never rendered, which is exactly what
 * `require_exact_tool_versions` means, and one workflow may pin the same
 * tool at two versions (#100).
 *
 * The derivation from here — which widget a parameter maps to — stays on the
 * client: it maps to Vue components and cannot move server-side without
 * being split.
 */
export interface WorkflowDescription {
  readonly steps: Record<string, DescribedStep>
  readonly inputs: Record<string, DescribedWorkflowInput>
  readonly tools: Record<string, GalaxyTool>
  readonly unavailable: UnavailableTool[]
}

/**
 * One revision of one workflow, described.
 *
 * The revision is mandatory, and that is what makes this a read of something
 * this server already holds: a published version **is** a stored workflow at
 * one revision (ADR 0004), and its export was captured at publish and never
 * refreshed. So the workflow half costs one local query rather than a Galaxy
 * round trip, and asking Galaxy about the revision would answer a different
 * question anyway — what the editor holds now, not what was published.
 *
 * The version is scoped to the Galaxy service account, as every other read
 * of the table is: `user_id` names the account and so the instance, and the
 * same stored workflow id on two instances is two stored workflows.
 *
 * Only the version row failing fails this. A tool Galaxy could not answer
 * for lands in `unavailable`, and the rest of the revision is still
 * described.
 */
export function workflowDescriptionEffect(
  galaxyWorkflowId: string,
  revision: number,
  cache: GalaxyCache,
  galaxyUrl: string,
  galaxyEmail: string,
): Effect.Effect<
  WorkflowDescription,
  WorkflowRevisionNotFound | StoredDefinitionStale | StoredDefinitionUnreadable
  | ReadStoredDefinitionError | GetCurrentUserError | GalaxyUserNotFoundError,
  GalaxyFetch | Drizzle
> {
  return Effect.gen(function* () {
    const currentUser = yield* getCurrentUserEffect(galaxyUrl, galaxyEmail)
    const useDrizzle = yield* Drizzle

    const version = yield* Effect.tryPromise({
      try: () => useDrizzle
        .select({ definition: workflows.definition, revisionUuid: workflows.revisionUuid })
        .from(workflows)
        .where(
          and(
            eq(workflows.userId, currentUser.user.id),
            eq(workflows.galaxyId, galaxyWorkflowId),
            eq(workflows.revision, revision),
          ),
        )
        .then(takeUniqueOrNull),
      catch: error => new ReadStoredDefinitionError({ message: `Error reading stored definition: ${error}` }),
    })
    if (!version) {
      return yield* Effect.fail(new WorkflowRevisionNotFound({
        message: `No published version pins revision ${revision} of workflow ${galaxyWorkflowId}`,
      }))
    }

    // Checked before parsing, because a row written by the old schema parses
    // perfectly: it is a subset of what the widened one accepts, and the
    // only thing wrong with it is everything it no longer says.
    if (predatesWidenedSchema(version.definition)) {
      return yield* Effect.fail(new StoredDefinitionUnreadable({
        message: `The stored definition of revision ${revision} of workflow ${galaxyWorkflowId} was captured before the export schema kept its connections. Republish the version.`,
      }))
    }

    // `.loose()` for the same reason publishing parses it loosely: a
    // definition exists to be read from later, and the keys this schema does
    // not model are not keys to throw away.
    const parsed = galaxyWorkflowExportSchema.loose().safeParse(version.definition)
    if (!parsed.success) {
      return yield* Effect.fail(new StoredDefinitionUnreadable({
        message: `The stored definition of revision ${revision} of workflow ${galaxyWorkflowId} is not a workflow export. Republish the version.`,
      }))
    }

    if (parsed.data.uuid !== version.revisionUuid) {
      return yield* Effect.fail(new StoredDefinitionStale({
        message: `The stored definition of workflow ${galaxyWorkflowId} is revision ${parsed.data.uuid}; version ${revision} pins ${version.revisionUuid}. Republish the version.`,
      }))
    }

    const steps = describedStepsOf(parsed.data)
    const pinned = pinnedToolsOfSteps(Object.values(steps))
    const { tools, unavailable } = yield* resolvePinnedToolsEffect(pinned, cache, galaxyUrl)
    return {
      steps,
      inputs: describedInputsOf(steps),
      tools,
      unavailable,
    }
  })
}
