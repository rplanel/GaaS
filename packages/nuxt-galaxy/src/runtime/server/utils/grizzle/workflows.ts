import type { EventHandlerRequest, H3Event } from 'h3'
import type { PublishVersionBody } from '../publishBody'
import { useRuntimeConfig } from '#imports'
import * as bt from 'blendtype'
import { and, eq, or } from 'drizzle-orm'
import { Data, Effect } from 'effect'
import { workflows } from '../../db/schema/galaxy/workflows'
import { Drizzle } from '../drizzle'
import { takeUniqueOrNull } from './helper'
import { ForbiddenError, GetSupabaseUserError, ServerSupabaseClaims, ServerSupabaseClient } from './supabase'
import { getCurrentUserEffect } from './user'

export class GetWorkflowError extends Data.TaggedError('GetWorkflowError')<{
  readonly message: string
}> {}

export class InsertWorkflowError extends Data.TaggedError('InsertWorkflowError')<{
  readonly message: string
}> {}

/**
 * No published version carries the identifier the caller asked for.
 *
 * Of everything that can go wrong on this path it is the only cause the
 * caller can act on, so it is told apart from the rest and answered with a
 * 404 rather than folded into a fault.
 */
export class WorkflowNotFoundError extends Data.TaggedError('WorkflowNotFoundError')<{
  readonly message: string
}> {}

/**
 * The version is retired (ADR 0004): it stays a version, its past analyses
 * keep their pages, but no analysis may be started on it. The users' list
 * hides it, so only a client that kept a stale id, or never read the list,
 * reaches this; the sentence names the version so that client can say which.
 */
export class WorkflowRetiredError extends Data.TaggedError('WorkflowRetiredError')<{
  readonly message: string
}> {}

/**
 * The update the database answered with something that is neither a refusal
 * nor a row: a fault, cause attached, since the caller can do nothing about it.
 */
export class UpdateWorkflowError extends Data.TaggedError('UpdateWorkflowError')<{
  readonly message: string
}> {}

/**
 * A label already used for this name. The pair names the results view
 * directory (ADR 0003), so it is unique across the application, whichever
 * stored workflow carries the name: a name may span stored workflows (ADR
 * 0004), and its labels are one set.
 */
export class VersionLabelTakenError extends Data.TaggedError('VersionLabelTakenError')<{
  readonly message: string
}> {}

/**
 * The revision is already published for this stored workflow. Labels are
 * immutable and one revision carries at most one, so the answer names the
 * label it already has rather than adding a second.
 */
export class RevisionAlreadyPublishedError extends Data.TaggedError('RevisionAlreadyPublishedError')<{
  readonly message: string
}> {}

/**
 * The stored workflow already carries a name, and every version of it keeps
 * that name: the name is the lineage (ADR 0004). A handler rule rather than a
 * constraint, since the dialog locks the field and this only refuses a client
 * that did not. No constraint backs it, so two publishes racing on the same
 * stored workflow could split a lineage; today they cannot, since both name
 * the latest revision and the unique on the revision refuses the second, but
 * #73, which lets an older revision be chosen, is where that changes.
 */
export class WorkflowNameLockedError extends Data.TaggedError('WorkflowNameLockedError')<{
  readonly message: string
}> {}

/**
 * The insert hit a unique constraint the checks before it did not see. The
 * checks and the insert are two round trips, so a version published between
 * them reaches the database's own rule; a refusal to reload on, not a fault.
 */
export class ConcurrentPublishError extends Data.TaggedError('ConcurrentPublishError')<{
  readonly message: string
}> {}

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

/**
 * Retire a version, or make a retired one active again (ADR 0004). `active`
 * means startable by users and nothing else: the users' list hides a retired
 * version, analysis start refuses it, and everything it already has, its
 * analyses, their results views and its usage statistics, is untouched.
 *
 * The version is read first through the service role, which reveals nothing
 * since the select policy lets every authenticated user read versions, so an
 * id nobody can act on is a 404 before anything is written. The update then
 * goes through the caller's own session, so the database decides who may
 * retire: the `workflows.update` policy, and the column-level grant that
 * leaves `active` the only column an update may touch. An UPDATE policy hides
 * the rows it refuses rather than raising, so a caller without the permission
 * gets zero rows back; the row was read a moment ago, so zero rows can only
 * mean the policy, and it is answered as the refusal it is.
 */
export function setVersionActive(
  workflowId: number,
  active: boolean,
  event: H3Event<EventHandlerRequest>,
) {
  return Effect.gen(function* () {
    const createServerSupabaseClaims = yield* ServerSupabaseClaims
    const supabaseClaims = yield* createServerSupabaseClaims(event)
    if (!supabaseClaims) {
      return yield* Effect.fail(new GetSupabaseUserError({ message: 'Unauthorized' }))
    }
    const createServerSupabaseClient = yield* ServerSupabaseClient
    const supabaseClient = yield* createServerSupabaseClient(event)

    yield* getWorkflowEffect(workflowId)

    const { error, data } = yield* Effect.promise(() => supabaseClient
      .schema('galaxy')
      .from('workflows')
      .update({ active })
      .eq('id', workflowId)
      .select(),
    )
    if (error) {
      if (error.code === '42501') {
        return yield* Effect.fail(new ForbiddenError({ message: 'Permission denied' }))
      }
      return yield* Effect.fail(new UpdateWorkflowError({ message: `supabase error: ${error.message}\ncode : ${error.code}` }))
    }
    const row = data[0]
    if (!row) {
      return yield* Effect.fail(new ForbiddenError({ message: 'Permission denied' }))
    }
    return row
  })
}

/**
 * Publish a version: one row labelling one revision of one Galaxy stored
 * workflow (ADR 0004). Nothing is copied in Galaxy; the only thing asked of
 * it is the export of the revision being published.
 *
 * The revision is the latest, since Galaxy exports the latest unless asked
 * for another; choosing an older one is #73. Every refusal happens before
 * anything is written, in the order the dialog reads them: the label, the
 * revision, the name, and last the permission, which the database decides on
 * the insert itself. The reads before it go through the service role, which
 * reveals nothing: the select policy lets every authenticated user read
 * versions anyway.
 */
export function publishVersion(
  { galaxyId, name, label }: PublishVersionBody,
  galaxyUrl: string,
  galaxyEmail: string,
  event: H3Event<EventHandlerRequest>,
) {
  return Effect.gen(function* () {
    const createServerSupabaseClaims = yield* ServerSupabaseClaims
    const supabaseClaims = yield* createServerSupabaseClaims(event)
    const createServerSupabaseClient = yield* ServerSupabaseClient
    const supabaseClient = yield* createServerSupabaseClient(event)
    if (!supabaseClaims) {
      // without this the generator falls off the end and returns undefined,
      // which resolves as a success -- so the endpoint answered a caller with
      // no session 200 and an empty body, where every sibling answers 401
      return yield* Effect.fail(new GetSupabaseUserError({ message: 'Unauthorized' }))
    }

    const galaxyWorkflow = yield* bt.exportWorkflowEffect(galaxyId)
    const galaxyUser = yield* getCurrentUserEffect(galaxyUrl, galaxyEmail)

    // The export's `version` is not a version and does not start at 1. It is
    // the 0-based index of the revision exported, which Galaxy adds to every
    // downloaded dict as `len(stored.workflows) - 1` (`workflow_to_dict`,
    // `managers/workflows.py:1063`, dev 47c11fe5edbd), and it is the same
    // integer `invoke` takes to run that revision (#48). A workflow imported
    // from a file and never edited has one revision and exports `0` (#66).
    // The export schema has already refused anything that is not a number, so
    // only the range is decided here: an integer of at least 0, which is all
    // Galaxy can produce. Anything else means the export is not what it
    // claims to be, a fault rather than a refusal.
    if (!Number.isInteger(galaxyWorkflow.version) || galaxyWorkflow.version < 0) {
      return yield* Effect.fail(new GetWorkflowError({
        message: `The export's \`version\` (the revision index) is invalid (${galaxyWorkflow.version}). It must be an integer of at least 0.`,
      }))
    }

    // One query answers the three checks below: the versions this stored
    // workflow already has, and whoever holds this name and label.
    const useDrizzle = yield* Drizzle
    const published = yield* Effect.tryPromise({
      try: () => useDrizzle
        .select({
          galaxyId: workflows.galaxyId,
          userId: workflows.userId,
          nameKey: workflows.nameKey,
          versionKey: workflows.versionKey,
          revision: workflows.revision,
        })
        .from(workflows)
        .where(or(
          and(eq(workflows.userId, galaxyUser.user.id), eq(workflows.galaxyId, galaxyId)),
          and(eq(workflows.nameKey, name), eq(workflows.versionKey, label)),
        )),
      catch: error => new GetWorkflowError({ message: `Error reading the published versions: ${error}` }),
    })

    const labelTaken = published.find(version => version.nameKey === name && version.versionKey === label)
    if (labelTaken) {
      return yield* Effect.fail(new VersionLabelTakenError({
        message: `Version "${label}" of "${name}" already exists.`,
      }))
    }
    // `user_id` names the Galaxy service user and so the instance: the same
    // stored workflow id on another instance is another stored workflow
    const ofThisStoredWorkflow = published.filter(version => version.userId === galaxyUser.user.id && version.galaxyId === galaxyId)
    const sameRevision = ofThisStoredWorkflow.find(version => version.revision === galaxyWorkflow.version)
    if (sameRevision) {
      return yield* Effect.fail(new RevisionAlreadyPublishedError({
        message: `Revision ${galaxyWorkflow.version} is already published as version "${sameRevision.versionKey}" of "${sameRevision.nameKey}".`,
      }))
    }
    const lineageName = ofThisStoredWorkflow[0]?.nameKey
    if (lineageName !== undefined && lineageName !== name) {
      return yield* Effect.fail(new WorkflowNameLockedError({
        message: `This workflow is published as "${lineageName}"; a new version keeps that name.`,
      }))
    }

    // The insert goes through the user-scoped client rather than drizzle so
    // that the database, not this server, decides who may publish. The row is
    // the version: the stored workflow, the revision by index and by uuid as
    // the export carries them, the export itself as the snapshot, the name and
    // the label as typed, and who published; `published_at` and `active` are
    // the database's defaults.
    const { error, data } = yield* Effect.promise(() => supabaseClient
      .schema('galaxy')
      .from('workflows')
      .insert({
        galaxy_id: galaxyId,
        revision: galaxyWorkflow.version,
        revision_uuid: galaxyWorkflow.uuid,
        name_key: name,
        version_key: label,
        name: galaxyWorkflow.name,
        user_id: galaxyUser.user.id,
        definition: galaxyWorkflow as any,
        published_by: supabaseClaims.id,
      })
      .select()
      .single(),
    )
    if (error) {
      // an RLS refusal is the database saying this caller may not publish: a
      // refusal, not a fault, which is why it leaves here as a 403 rather
      // than a 500
      if (error.code === '42501') {
        return yield* Effect.fail(new ForbiddenError({ message: 'Permission denied' }))
      }
      // either unique can be the one that fired, the revision's or the
      // name-and-label's, and the second may belong to another stored
      // workflow sharing the name, so the sentence names neither
      if (error.code === '23505') {
        return yield* Effect.fail(new ConcurrentPublishError({
          message: 'Another version was published meanwhile. Reload the page and try again.',
        }))
      }
      return yield* Effect.fail(new InsertWorkflowError({ message: `supabase error: ${error.message}\ncode : ${error.code}` }))
    }
    return data
  })
}
