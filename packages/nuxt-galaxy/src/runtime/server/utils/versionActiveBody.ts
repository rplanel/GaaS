/**
 * The body `PATCH /api/db/workflows/:workflowId` accepts, read rather than
 * assumed.
 *
 * Retiring a version, or making it active again (ADR 0004), takes one thing
 * from the administrator: whether users may start an analysis on it. The
 * handler's `defineEventHandler<{ body }>` annotation is erased at build
 * time, so the body is checked here, in the shape `publishBody.ts`
 * established: the schema is the type, and a body nobody can act on costs a
 * round trip and nothing more.
 */
import { createError } from 'h3'
import { z } from 'zod'

/**
 * What a caller is told, per field. One sentence each, written for the
 * administrator who reads it rather than lifted from zod.
 */
const MESSAGES = {
  body: 'The request body must be a JSON object carrying `active`',
  active: '`active` must be a boolean: false retires the version, true makes it active again',
} as const

export const versionActiveBodySchema = z.object({
  // Not coerced: the switch sends a boolean, and a client sending "false" has
  // a bug worth being told about, since `Boolean("false")` is true.
  active: z.boolean(MESSAGES.active),
}, { error: MESSAGES.body })

export type VersionActiveBody = z.infer<typeof versionActiveBodySchema>

/**
 * The body, or a 400 naming what is not what it must be.
 *
 * Thrown rather than failed into the effect because it runs before the
 * program is built; only the first issue is answered, one sentence per round
 * trip, which is what every other refusal on this endpoint gives.
 */
export function readVersionActiveBody(body: unknown): VersionActiveBody {
  const parsed = versionActiveBodySchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? MESSAGES.body,
    })
  }
  return parsed.data
}
