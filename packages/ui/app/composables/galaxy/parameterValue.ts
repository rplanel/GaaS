import type { WorkflowConditionalParametersValue } from 'blendtype'

/**
 * What the encoder and the decoder agree a parameter value is, so that the
 * flat dict Galaxy is sent and the model read back out of a stored analysis
 * cannot drift apart on the question (#95).
 *
 * Not auto-imported: Nuxt scans only the top level of `composables/`, so
 * everything under `composables/galaxy/` is imported by path — which is why
 * these can carry short names without claiming them globally.
 */

/**
 * Whether a parameter is a conditional, whose inputs Galaxy expects flattened
 * to `name|subname`, rather than a value to carry as it stands.
 *
 * `null` has to be ruled out explicitly: `typeof null === 'object'`, so
 * without this a stored `null` took the flattening branch and
 * `for (const key in null)` emitted nothing, dropping the key entirely.
 * An array is a multi-select's value and travels whole.
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
