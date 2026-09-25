/**
 * What the encoder and the decoder agree a parameter is, so that the flat
 * dict Galaxy is sent and the model read back out of a stored analysis cannot
 * drift apart on the question (#95).
 *
 * Everything the two sides must answer identically lives here: which values
 * are omitted, and how a conditional's name is joined and taken apart again.
 * A separator written out at each end is the kind of agreement that holds
 * right up until one end changes.
 *
 * Not auto-imported: Nuxt scans only the top level of `composables/`, so
 * everything under `composables/galaxy/` is reached by path — which is why
 * these can carry short names without claiming them globally.
 */

import type { WorkflowConditionalParametersValue } from 'blendtype'

/** What Galaxy joins a conditional's name to its input's with. */
const CONDITIONAL_SEPARATOR = '|'

/**
 * Whether a parameter is a conditional, whose inputs Galaxy expects flattened
 * to `name|subname`, rather than a value to carry as it stands.
 *
 * Structural on purpose: against `WorkflowParameterValue` — a string, a
 * string array, or a nested bag — being an object that is neither of the
 * first two is what makes it a conditional. `null` has to be ruled out
 * explicitly, because `typeof null === 'object'` sent a stored `null` down
 * the flattening branch, where `for (const key in null)` emitted nothing and
 * the key vanished entirely.
 */
export function isConditional(param: unknown): param is WorkflowConditionalParametersValue {
  return typeof param === 'object' && param !== null && !Array.isArray(param)
}

/**
 * Whether a value is one the reader or the workflow chose, as opposed to one
 * that was never there.
 *
 * Only `undefined` is an absence. Every other value Galaxy saved — `0`, an
 * empty-string select option, `null`, `false` — is a choice, and omitting it
 * makes Galaxy substitute the tool's own default for a parameter the workflow
 * had already set, with no error and nothing on screen to say so (#95).
 *
 * The guard this replaced tested truthiness, and the encoder applied it only
 * to the nested path, so the same `0` was kept at the top of a step and
 * dropped one level down.
 */
export function isPresent<T>(value: T): value is Exclude<T, undefined> {
  return value !== undefined
}

/** The name a conditional's input is submitted under. */
export function flattenKey(parent: string, child: string): string {
  return `${parent}${CONDITIONAL_SEPARATOR}${child}`
}

/** `flattenKey` read backwards: the path a submitted name stands for. */
export function splitKey(name: string): string[] {
  return name.split(CONDITIONAL_SEPARATOR)
}
