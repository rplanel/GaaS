import type { UnavailableTool } from '../../types/nuxt-galaxy'
import type { UnconnectedDatasetInput } from './unconnectedDatasetInputs'
import * as z from 'zod'
import { unconnectedInputsRefuseInvocation } from './unconnectedDatasetInputs'

/**
 * Both ways of arriving at an empty name, kept in one place: zod does not
 * cascade a schema-level `error` into `.min()`, so the two have to be written
 * separately and must not drift.
 */
const REQUIRED = 'Required'

/**
 * What a form starting an analysis may send, as a schema a UI validates its
 * state against (#163). It was the invoke form's own until #163 moved it here,
 * so that any UI refuses what `@gaas/ui` refuses and sends what it sends.
 *
 * Rebuilt per workflow, because what the workflow declares is what there is
 * to validate: `inputs` names each input it declares by its step index, the
 * key the datamap uses. That is also what decides what the datamap may
 * contain: `z.object` keeps nothing it does not name, so a dataset stored
 * against a step the workflow has since dropped is not sent.
 *
 * `Dataset` is whatever the UI's picker writes back for an input, typically
 * the uploaded dataset's row; the server reads its `storage_object_id`.
 */
export function startAnalysisSchema<Dataset = unknown>(inputs: readonly string[]) {
  return z.object({
    // `min(1)` is what makes a `required` marker on the field mean something:
    // plain `z.string()` rejects the untouched `undefined` but accepts the
    // `''` a reader leaves behind by typing a name and clearing it again.
    // `trim()` comes first so that a name of only spaces is that same `''`
    // rather than a string with a length: the server refuses it either way
    // (#47), but here the reader is told by the field, not after a round trip.
    // What the schema outputs is the trimmed name, and that is what is sent,
    // so the length rule measures what will be stored (`varchar(256)`, 256
    // allowed).
    analysisName: z
      .string({ error: REQUIRED })
      .trim()
      .min(1, REQUIRED)
      .max(256, 'Must be at most 256 characters'),
    inputs: z.object(
      Object.fromEntries(
        inputs.map(stepId => [
          stepId,
          // There is nothing to check about a selection beyond its being
          // there: the picker writes back one of the rows it was given.
          z.custom<Dataset>(
            selection => selection !== undefined && selection !== null,
            REQUIRED,
          ),
        ]),
      ),
    ),
  })
}

/** What `startAnalysisRefused` reads, all of it from the workflow's description and the Galaxy release. */
export interface StartAnalysisGate {
  /** The tools Galaxy does not hold at the versions the revision pins. */
  readonly blockingTools: readonly UnavailableTool[]
  /** The dataset inputs nothing feeds, by step. */
  readonly unconnectedInputsByStep: Readonly<Record<string, readonly UnconnectedDatasetInput[]>>
  /** The release the Galaxy instance runs, as `version_major` names it; `undefined` until it is known. */
  readonly galaxyRelease: string | undefined
  /** Whether the workflow's description could not be read. */
  readonly descriptionFailed: boolean
}

/**
 * Whether starting this analysis is refused before anything is sent (#163).
 *
 * One answer for everything that refuses, so that a disabled Start button and
 * the refusal a submission meets when Enter submits past it cannot disagree.
 *
 * A step's unconnected inputs refuse by `unconnectedInputsRefuseInvocation`,
 * the verdict a UI also colours that step by, so the two cannot disagree
 * either. A release not known yet refuses nothing on its account.
 *
 * A description that *failed* refuses: the UI then knows neither the inputs
 * nor the tools, so what it would send is whatever the reader could see,
 * which is nothing. A description still *in flight* deliberately does not.
 * It would silently reject a reader who types a name and presses Enter
 * before the answer lands, and the worst it risks is the start Galaxy would
 * have refused anyway. Refusing without being able to say why is worse than
 * refusing late.
 */
export function startAnalysisRefused(gate: StartAnalysisGate): boolean {
  return gate.blockingTools.length > 0
    || Object.values(gate.unconnectedInputsByStep).some(inputs => unconnectedInputsRefuseInvocation(inputs, gate.galaxyRelease))
    || gate.descriptionFailed
}
