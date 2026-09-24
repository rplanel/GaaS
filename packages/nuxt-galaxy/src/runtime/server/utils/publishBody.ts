/**
 * The body `POST /api/db/workflows` accepts, read rather than assumed.
 *
 * Publishing a version (ADR 0004) takes three things from the administrator:
 * the Galaxy stored workflow, the name of the lineage it joins and the label
 * the version carries. The handler's `defineEventHandler<{ body }>` annotation
 * is erased at build time, so the body is checked here, in the shape
 * `analysisBody.ts` established: the schema is the type, and a body nobody
 * can act on costs a round trip and nothing more.
 */
import { createError } from 'h3'
import { z } from 'zod'
import { canNameResultsViewDirectory } from './grizzle/resultsViewDirectoryName'

/**
 * What a caller is told, per field. One sentence each, written for the
 * administrator who reads it in the publish dialog rather than lifted from
 * zod. The directory rule is spelled out in full because the value it refuses
 * was typed a moment ago and the fix is to type another.
 */
const DIRECTORY_RULE = 'Use letters, digits, dots, hyphens and underscores, starting with a letter or digit.'

const MESSAGES = {
  body: 'The request body must be a JSON object carrying `galaxyId`, `name` and `label`',
  galaxyId: '`galaxyId` must be a non-empty string',
  name: '`name` must be a non-empty string of at most 255 characters',
  label: '`label` must be a non-empty string of at most 255 characters',
  nameDirectory: `\`name\` cannot name a results view directory. ${DIRECTORY_RULE}`,
  labelDirectory: `\`label\` cannot name a results view directory. ${DIRECTORY_RULE}`,
} as const

/**
 * A name or a label: checked, not rewritten. The length rule is the column's
 * (`varchar(255)`), a blank value is refused by its trimmed length so that
 * whitespace alone cannot satisfy it, and the directory rule (ADR 0003) is
 * checked on the value as typed, case included, since that is what is stored
 * and what the results view directory is matched against.
 */
function directoryName(message: string, directoryMessage: string) {
  return z.string(message)
    .max(255, message)
    .refine(value => value.trim().length > 0, { message, abort: true })
    .refine(canNameResultsViewDirectory, directoryMessage)
}

export const publishVersionBodySchema = z.object({
  galaxyId: z.string(MESSAGES.galaxyId).refine(value => value.trim().length > 0, MESSAGES.galaxyId),
  name: directoryName(MESSAGES.name, MESSAGES.nameDirectory),
  label: directoryName(MESSAGES.label, MESSAGES.labelDirectory),
}, { error: MESSAGES.body })

export type PublishVersionBody = z.infer<typeof publishVersionBodySchema>

/**
 * The body, or a 400 naming the first field that is not what it must be.
 *
 * Thrown rather than failed into the effect because it runs before the
 * program is built; only the first issue is answered, one sentence per round
 * trip, which is what every other refusal on this endpoint gives.
 */
export function readPublishVersionBody(body: unknown): PublishVersionBody {
  const parsed = publishVersionBodySchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? MESSAGES.body,
    })
  }
  return parsed.data
}
