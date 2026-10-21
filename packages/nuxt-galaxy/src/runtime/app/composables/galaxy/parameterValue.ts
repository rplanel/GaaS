/**
 * What the encoder and the decoder agree a parameter is, so that the flat
 * dict Galaxy is sent and the model read back out of a stored analysis cannot
 * drift apart on the question (#95).
 *
 * Everything the two sides must answer identically lives here: which values
 * are omitted, and how a parameter group's name is joined to its child's and
 * taken apart again. A separator written out at each end is the kind of agreement that
 * holds right up until one end changes.
 *
 * Not auto-imported, which is why these can carry short names without
 * claiming them globally: `module.ts` registers composables one name at a
 * time, and the only one registered from here is `isParameterGroupValue`,
 * which tells a group's bag from a scalar and is what `parameterGroupValue`
 * reads a section's bag with (#166). The rest are reached by path.
 */

import type { WorkflowConditionalParametersValue } from 'blendtype'

/**
 * What Galaxy joins a parameter group's name to its child's with.
 *
 * One separator for all three groups, because `visit_input_values` builds the
 * same prefix for a conditional, a section and a repeat instance:
 * `f"{name_prefix + input.name}|"` for the first two and
 * `f"{input.name}_{i}|"` for the third, so the pipe is what separates the
 * levels in every case (`tools/parameters/__init__.py:172-215` at 22.05,
 * `:236-279` at 26.1).
 */
const GROUP_SEPARATOR = '|'

/**
 * What Galaxy joins a repeat's name to one instance's number with — and the
 * number is the instance's **position**, never the `__index__` it carries.
 *
 * `visit_input_values` overwrites the stored index with the position
 * immediately before building the name:
 *
 *     for i, d in enumerate(values):
 *         d["__index__"] = i
 *         new_name_prefix = name_prefix + f"{input.name}_{i}|"
 *
 * — `tools/parameters/__init__.py:174-176` at 22.05, `:238-240` at 26.1. In
 * practice the two always agree, for that same reason: every save-time visit
 * renumbers them, so a state Galaxy wrote has contiguous indices. They part
 * company only on state that has been edited elsewhere, and there the
 * position is the one Galaxy will look up. #101's acceptance criteria asked
 * for the opposite and were corrected against this.
 */
const REPEAT_INSTANCE_SEPARATOR = '_'

/**
 * Whether a saved value is a **parameter group**'s — a bag of further
 * parameters, which Galaxy expects flattened to `name|subname`, rather than a
 * value to carry as it stands.
 *
 * Named for the conditional until #101, which is the only group that existed
 * here when #95 wrote it and is now one of three: a section saves the same
 * shape, and so does one instance of a repeat. The type it narrows to still
 * carries the older name, `WorkflowConditionalParametersValue`, because that
 * one is `blendtype`'s published surface; its own documentation already calls
 * it "the plain nesting a `conditional` or a `section` saves".
 *
 * Structural on purpose: against `WorkflowParameterValue` — a string, a
 * string array, or a bag — being an object that is neither of the first two
 * is what makes it a group's. `null` has to be ruled out explicitly, because
 * `typeof null === 'object'` sent a stored `null` down the flattening branch,
 * where `for (const key in null)` emitted nothing and the key vanished
 * entirely.
 */
export function isParameterGroupValue(param: unknown): param is WorkflowConditionalParametersValue {
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

/** The name a parameter group's child is submitted under. */
export function flattenKey(parent: string, child: string): string {
  return `${parent}${GROUP_SEPARATOR}${child}`
}

/** `flattenKey` read backwards: the path a submitted name stands for. */
export function splitKey(name: string): string[] {
  return name.split(GROUP_SEPARATOR)
}

/** The name one instance of a repeat is submitted under. */
export function repeatInstanceKey(parent: string, position: number): string {
  return `${parent}${REPEAT_INSTANCE_SEPARATOR}${position}`
}

/**
 * `repeatInstanceKey` read backwards, and the one place the two sides have to
 * be careful rather than merely consistent.
 *
 * A name is ambiguous in this direction: `datasets_0` is one instance of a
 * repeat called `datasets`, and it is also a perfectly legal name for a
 * conditional or a section. Galaxy never has to choose — it reads the
 * tool's declaration — and the decoder has none, holding only the stored
 * dict. So this answers the *shape* of the name and leaves the decision to
 * the caller, which makes it on the marker the encoder sends alongside:
 * an instance carries `__index__` and nothing else does.
 */
export function splitRepeatInstanceKey(name: string): { parent: string, position: number } | undefined {
  const match = /^(.+)_(\d+)$/.exec(name)
  if (match === null || match[1] === undefined || match[2] === undefined) {
    return undefined
  }
  return { parent: match[1], position: Number(match[2]) }
}
