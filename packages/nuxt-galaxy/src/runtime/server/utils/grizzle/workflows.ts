import type { EventHandlerRequest, H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import * as bt from 'blendtype'
import { and, eq } from 'drizzle-orm'
import { Data, Effect } from 'effect'
import { workflows } from '../../db/schema/galaxy/workflows'
import { Drizzle } from '../drizzle'
import { takeUniqueOrThrow } from './helper'
import { ServerSupabaseClaims, ServerSupabaseClient } from './supabase'
import { getCurrentUserEffect } from './user'

export class GetWorkflowError extends Data.TaggedError('GetWorkflowError')<{
  readonly message: string
}> {}

export function getWorkflowEffect(workflowId: number) {
  const { public: { galaxy: { url } }, galaxy: { email } } = useRuntimeConfig()
  return Effect.gen(function* () {
    const currentUser = yield* getCurrentUserEffect(url, email)
    const useDrizzle = yield* Drizzle
    if (currentUser) {
      return yield* Effect.tryPromise({
        try: () => useDrizzle
          .select()
          .from(workflows)
          .where(
            and(
              eq(workflows.userId, currentUser.user.id),
              eq(workflows.id, workflowId),
            ),
          )
          .then(takeUniqueOrThrow),
        catch: () => new GetWorkflowError({ message: 'Error getting workflow' }),
      })
    }
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
      const tagVersion = bt.getWorkflowTagVersion(galaxyWorkflow.tags)
      const tagName = bt.getWorkflowTagName(galaxyWorkflow.tags)

      const definition = galaxyWorkflow as any
      if (!tagVersion) {
        return yield* Effect.fail(new GetWorkflowError({ message: 'No tag version found' }))
      }
      if (!tagName) {
        return yield* Effect.fail(new GetWorkflowError({ message: 'No tag name found' }))
      }
      if (!galaxyUser) {
        return yield* Effect.fail(new GetWorkflowError({ message: 'No galaxy user found' }))
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
          definition,
        })
        .select(),
      )
      if (error) {
        if (error.code === '42501') {
          return yield* Effect.fail(new Error('Permission denied'))
        }

        if (error.code === '23505') {
          Effect.fail(new WorkflowAlreadyExistsError(
            { message: `Workflow ${galaxyWorkflowId} already exits in the database`, statusCode: 506 },
          ))
        }

        return yield* Effect.fail(new Error(`supabase error: ${error.message}\ncode : ${error.code}`))
      }
      else {
        return data
      }
    }
  })
}

export class WorkflowAlreadyExistsError extends Data.TaggedError('WorkflowAlreadyExistsError')<{
  readonly message: string
  readonly statusCode: number
}> {}
