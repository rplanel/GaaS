/**
 * The body `POST /api/db/analyses` accepts, read rather than assumed.
 *
 * The handler's `defineEventHandler<{ body: AnalysisBody }>` annotation is
 * erased at build time, so until #47 nothing checked that a body arrived or
 * had the shape the handler destructures. Measured against h3 1.15.11: no
 * body at all was a `TypeError` thrown before the program existed, so a 500
 * that reached no log; `workflowId: "abc"` reached Postgres as a comparison
 * against an integer column; a missing `name` bought a Galaxy history and a
 * row before `varchar(256) notNull` refused the insert; and `datamap: "f"`
 * passed #43's key comparison, because `Object.keys("f")` is `["0"]`.
 *
 * The schema is the type. `AnalysisBody` is inferred from it rather than
 * declared beside it, so the check and the contract cannot disagree.
 */
import type { GalaxyWorkflowParameters } from 'blendtype'
import { createError } from 'h3'
import { z } from 'zod'

/**
 * What a caller is told, per field. One sentence each, written for the caller
 * rather than lifted from zod: zod's own messages name types and received
 * values, which is a debugging aid rather than an answer. The body message
 * lists the three required fields because it is the one a caller with no body
 * at all reads, and "what was missing" is the whole answer there.
 */
const MESSAGES = {
  body: 'The request body must be a JSON object carrying `name`, `workflowId` and `datamap`',
  name: '`name` must be a non-empty string of at most 256 characters',
  workflowId: '`workflowId` must be a number',
  datamap: '`datamap` must be an object whose entries each carry a `storage_object_id`',
  parameters: '`parameters` must be an object when present',
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * One dataset a datamap supplies. `storage_object_id` is the only key this
 * server reads — `uploadDatasetsEffect` destructures it and nothing else — so
 * it is the only key required. The object is loose because the form sends the
 * whole `uploaded_datasets` row it picked, and the stored datamap is what
 * copying an analysis later reads back, so the rest has to survive the check.
 */
const datamapEntrySchema = z.looseObject(
  { storage_object_id: z.string(MESSAGES.datamap) },
  { error: MESSAGES.datamap },
)

export const analysisBodySchema = z.object({
  // Checked, not rewritten: the length rule is the column's (`varchar(256)`),
  // and a blank name is refused by its trimmed length so that whitespace
  // alone cannot satisfy it, but the value stored is the one the reader typed.
  name: z.string(MESSAGES.name)
    .max(256, MESSAGES.name)
    .refine(name => name.trim().length > 0, MESSAGES.name),
  // Not coerced (decided in #47): the form sends a number, and a client
  // sending "1" has a bug worth being told about.
  workflowId: z.number(MESSAGES.workflowId),
  datamap: z.record(z.string(), datamapEntrySchema, { error: MESSAGES.datamap }),
  // Galaxy's to read, not this server's: the values are passed to the
  // invocation unread, so only their container is checked. Typed as
  // `blendtype` types the invocation's argument, which is what they become.
  parameters: z.custom<GalaxyWorkflowParameters>(isRecord, MESSAGES.parameters).optional(),
}, { error: MESSAGES.body })

export type AnalysisBody = z.infer<typeof analysisBodySchema>

/** The datamap as a request carries it, for the code that stores it as sent. */
export type AnalysisDatamap = AnalysisBody['datamap']

/**
 * The body, or a 400 naming the first field that is not what it must be.
 *
 * Thrown rather than failed into the effect because it runs before the
 * program is built, in the shape `workflows.post` established: a body nobody
 * can act on costs a round trip and nothing more, and a refusal is not a
 * failure with a cause worth logging. Only the first issue is answered; a
 * caller fixing fields one at a time gets one sentence per round trip rather
 * than a list, which is what every other refusal on this endpoint gives.
 */
export function readAnalysisBody(body: unknown): AnalysisBody {
  const parsed = analysisBodySchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? MESSAGES.body,
    })
  }
  return parsed.data
}
