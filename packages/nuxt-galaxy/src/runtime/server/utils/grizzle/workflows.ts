import type { EventHandlerRequest, H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import * as bt from 'blendtype'
import { and, eq } from 'drizzle-orm'
import { Data, Effect } from 'effect'
import { workflows } from '../../db/schema/galaxy/workflows'
import { Drizzle } from '../drizzle'
import { takeUniqueOrNull } from './helper'
import { ForbiddenError, GetSupabaseUserError, ServerSupabaseClaims, ServerSupabaseClient } from './supabase'
import { galaxyUserNotFound, getCurrentUserEffect } from './user'
import { generateWorkflowSlug } from './workflowSlug'

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

/**
 * The workflow, or a named reason there is none (ADR 0002). The whole body
 * used to sit inside `if (currentUser)` with no `else`, and the query itself
 * answers `null` for a workflow that does not exist — so both a deployment
 * fault and an identifier the caller made up arrived as the same successful
 * `undefined`/`null`.
 */
export function getWorkflowEffect(workflowId: number) {
  const { public: { galaxy: { url } }, galaxy: { email } } = useRuntimeConfig()
  return Effect.gen(function* () {
    const currentUser = yield* getCurrentUserEffect(url, email)
    const useDrizzle = yield* Drizzle
    if (!currentUser) {
      return yield* Effect.fail(galaxyUserNotFound(url, email))
    }

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
      if (typeof galaxyWorkflow.version !== 'number' || !Number.isInteger(galaxyWorkflow.version) || galaxyWorkflow.version < 1) {
        return yield* Effect.fail(new GetWorkflowError({
          message: `Workflow version is invalid (${galaxyWorkflow.version}). Version must be a positive integer.`,
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
      if (!galaxyUser) {
        return yield* Effect.fail(new GetWorkflowError({ message: 'No galaxy user found' }))
      }

      let workflowSlug: string
      try {
        workflowSlug = generateWorkflowSlug(tagName, tagVersion)
      }
      catch (e) {
        const message = e instanceof Error
          ? e.message
          : 'Failed to generate workflow slug'
        return yield* Effect.fail(new GetWorkflowError({ message }))
      }

      // use supabaseClient to insert the workflow instead of drizzle because
      // need to be sure that not anybody can insert a workflow
      const { error, data } = yield* Effect.promise(() => supabaseClient
        .schema('galaxy')
        .from('workflows')
        .insert({
          workflow_slug: workflowSlug,
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
