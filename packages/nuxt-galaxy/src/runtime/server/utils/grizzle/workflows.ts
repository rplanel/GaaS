import type { EventHandlerRequest, H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import * as bt from 'blendtype'
import { and, eq } from 'drizzle-orm'
import { Data, Effect } from 'effect'
import { workflows } from '../../db/schema/galaxy/workflows'
import { Drizzle } from '../drizzle'
import { takeUniqueOrNull } from './helper'
import { ForbiddenError, GetSupabaseUserError, ServerSupabaseClaims, ServerSupabaseClient } from './supabase'
import { getCurrentUserEffect } from './user'
import { canNameResultsViewDirectory } from './workflowTagValue'

export class GetWorkflowError extends Data.TaggedError('GetWorkflowError')<{
  readonly message: string
}> {}

export class InsertWorkflowError extends Data.TaggedError('InsertWorkflowError')<{
  readonly message: string
}> {}

/**
 * No activated workflow carries the identifier the caller asked for.
 *
 * Of everything that can go wrong on this path it is the only cause the
 * caller can act on, so it is told apart from the rest and answered with a
 * 404 rather than folded into a fault.
 */
export class WorkflowNotFoundError extends Data.TaggedError('WorkflowNotFoundError')<{
  readonly message: string
}> {}

/** The two tags a workflow is identified by (ADR 0003). */
export type WorkflowTagKind = 'name' | 'version'

/**
 * A `name:` or `version:` tag value that cannot name the directory a results
 * view is found in (ADR 0003).
 *
 * Galaxy lets such a value through, so the administrator learns of it here,
 * at activation, and fixes the tag in Galaxy; nothing about the request itself
 * was wrong. The handler answers it with a status the administrator can act
 * on, carrying this message, rather than folding it into a fault. Workflows
 * activated before the rule are left as they are.
 */
export class InvalidWorkflowTagError extends Data.TaggedError('InvalidWorkflowTagError')<{
  readonly message: string
  readonly tag: WorkflowTagKind
  readonly value: string
}> {}

/**
 * The failure above, worded once. Each guard still writes its own
 * `Effect.fail`, as `galaxyUserNotFound` does; this only keeps the two guards
 * from drifting apart in what they tell the administrator.
 */
export function invalidWorkflowTag(tag: WorkflowTagKind, value: string): InvalidWorkflowTagError {
  return new InvalidWorkflowTagError({
    tag,
    value,
    message: `The \`${tag}:\` tag value \`${value}\` cannot name a results view directory. `
      + 'Use letters, digits, dots, hyphens and underscores, starting with a letter or digit.',
  })
}

/**
 * The workflow, or a named reason there is none (ADR 0002). The whole body
 * used to sit inside `if (currentUser)` with no `else`, and the query itself
 * answers `null` for a workflow that does not exist — so both a deployment
 * fault and an identifier the caller made up arrived as the same successful
 * `undefined`/`null`. The first of those is now `getCurrentUserEffect`'s own
 * failure (#33), so only the second is decided here.
 */
export function getWorkflowEffect(workflowId: number) {
  const { public: { galaxy: { url } }, galaxy: { email } } = useRuntimeConfig()
  return Effect.gen(function* () {
    const currentUser = yield* getCurrentUserEffect(url, email)
    const useDrizzle = yield* Drizzle

    const workflow = yield* Effect.tryPromise({
      try: () => useDrizzle
        .select()
        .from(workflows)
        .where(
          and(
            eq(workflows.userId, currentUser.user.id),
            eq(workflows.id, workflowId),
          ),
        )
        .then(takeUniqueOrNull),
      catch: error => new GetWorkflowError({ message: `Error getting workflow: ${error}` }),
    })
    if (!workflow) {
      return yield* Effect.fail(new WorkflowNotFoundError({
        message: `No workflow ${workflowId} is available`,
      }))
    }
    return workflow
  })
}

export function insertWorkflow(
  galaxyWorkflowId: string,
  galaxyUrl: string,
  galaxyEmail: string,
  event: H3Event<EventHandlerRequest>,
) {
  return Effect.gen(function* () {
    const createServerSupabaseClaims = yield* ServerSupabaseClaims
    const supabaseClaims = yield* createServerSupabaseClaims(event)
    const createServerSupabaseClient = yield* ServerSupabaseClient
    const supabaseClient = yield* createServerSupabaseClient(event)
    if (supabaseClaims) {
      const galaxyWorkflow = yield* bt.exportWorkflowEffect(galaxyWorkflowId)
      const galaxyUser = yield* getCurrentUserEffect(galaxyUrl, galaxyEmail)

      if (!galaxyWorkflow.name || typeof galaxyWorkflow.name !== 'string' || galaxyWorkflow.name.trim().length === 0) {
        return yield* Effect.fail(new GetWorkflowError({
          message: 'Workflow has no name. Set a name in Galaxy before exporting.',
        }))
      }
      // The export's `version` is not a version and does not start at 1. It is
      // the 0-based index of the revision exported, which Galaxy adds to every
      // downloaded dict as `len(stored.workflows) - 1` (`workflow_to_dict`,
      // `managers/workflows.py:1063`, dev 47c11fe5edbd), and it is the same
      // integer `invoke` takes to run that revision (#48). A workflow imported
      // from a file and never edited has one revision and exports `0`; the
      // check used to refuse it as an invalid version (#66). The export schema
      // has already refused anything that is not a number, so only the range
      // is decided here: an integer of at least 0, which is all Galaxy can
      // produce. Anything else means the export is not what it claims to be.
      if (!Number.isInteger(galaxyWorkflow.version) || galaxyWorkflow.version < 0) {
        return yield* Effect.fail(new GetWorkflowError({
          message: `The export's \`version\` (the revision index) is invalid (${galaxyWorkflow.version}). It must be an integer of at least 0.`,
        }))
      }

      const tagVersion = bt.getWorkflowTagVersion(galaxyWorkflow.tags)
      const tagName = bt.getWorkflowTagName(galaxyWorkflow.tags)
      if (!tagVersion) {
        return yield* Effect.fail(new GetWorkflowError({
          message: 'Workflow is missing a version tag. Add a tag like "version:1.0.0" in Galaxy.',
        }))
      }
      if (!tagName) {
        return yield* Effect.fail(new GetWorkflowError({
          message: 'Workflow is missing a name tag. Add a tag like "name:MyWorkflow" in Galaxy.',
        }))
      }
      // the two values are stored as tagged and matched against a directory
      // name verbatim, so a value no directory can carry is refused here,
      // where the tag it came from is still known, instead of being tidied
      // into something the developer would then have to guess at
      if (!canNameResultsViewDirectory(tagName)) {
        return yield* Effect.fail(invalidWorkflowTag('name', tagName))
      }
      if (!canNameResultsViewDirectory(tagVersion)) {
        return yield* Effect.fail(invalidWorkflowTag('version', tagVersion))
      }

      // use supabaseClient to insert the workflow instead of drizzle because
      // need to be sure that not anybody can insert a workflow
      const { error, data } = yield* Effect.promise(() => supabaseClient
        .schema('galaxy')
        .from('workflows')
        .insert({
          version_key: tagVersion,
          name_key: tagName,
          auto_version: galaxyWorkflow.version,
          name: galaxyWorkflow.name,
          galaxy_id: galaxyWorkflowId,
          user_id: galaxyUser.user.id,
          definition: galaxyWorkflow as any,
        })
        .select(),
      )
      if (error) {
        // the insert goes through the user-scoped client, so an RLS refusal is
        // the database saying this caller may not import workflows: a refusal,
        // not a fault, which is why it leaves here as a 403 rather than a 500
        if (error.code === '42501') {
          return yield* Effect.fail(new ForbiddenError({ message: 'Permission denied' }))
        }

        if (error.code === '23505') {
          return yield* Effect.fail(new WorkflowAlreadyExistsError(
            { message: `Workflow ${galaxyWorkflowId} already exists in the database`, statusCode: 409 },
          ))
        }

        return yield* Effect.fail(new InsertWorkflowError({ message: `supabase error: ${error.message}\ncode : ${error.code}` }))
      }
      else {
        return data
      }
    }
    else {
      // without this the generator falls off the end and returns undefined,
      // which resolves as a success -- so the endpoint answered a caller with
      // no session 200 and an empty body, where every sibling answers 401
      return yield* Effect.fail(new GetSupabaseUserError({ message: 'Unauthorized' }))
    }
  })
}

export class WorkflowAlreadyExistsError extends Data.TaggedError('WorkflowAlreadyExistsError')<{
  readonly message: string
  readonly statusCode: number
}> {}
