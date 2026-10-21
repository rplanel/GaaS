/**
 * What a parameter's widget decides, as against how it looks (#166): which
 * instances a repeat has and how one is written back, the parameters a
 * conditional's case holds, what a select offers, and how a boolean reads and
 * is written.
 *
 * A UI renders with these and decides nothing of its own about what is
 * offered or stored, so `@gaas/ui`'s widgets and the second UI in the
 * playground cannot disagree about it (ADR 0009). Which component renders a
 * parameter type stays in `@gaas/ui`. Auto-imported, as every export of this
 * directory is, which is why each name says which parameter type it is about.
 */

import type {
  GalaxyBooleanToolParameter,
  GalaxyConditionalParameter,
  GalaxySelectToolParameter,
  GalaxyToolParameters,
  WorkflowConditionalParametersValue,
  WorkflowParameterValue,
  WorkflowRepeatInstanceValue,
} from 'blendtype'
import { booleanToolParameterValue, isWorkflowRepeatInstanceValue } from 'blendtype'
import { isParameterGroupValue } from '../composables/galaxy/parameterValue'

/** One instance of a repeat and where it sits in the saved list. */
export interface RepeatInstance {
  /** Where the instance sits in the saved list, which is what Galaxy names it by. */
  position: number
  instance: WorkflowRepeatInstanceValue
}

/**
 * One instance per saved block, and only for the entries that really are
 * instances.
 *
 * The arity is read from the saved value and never from the declaration: the
 * tool declares one blueprint and the state holds however many blocks the
 * author added. An analysis cannot add or remove one (`CONTEXT.md`, #101).
 *
 * `isWorkflowRepeatInstanceValue` is the test, so an entry with no
 * `__index__` is skipped rather than read: Galaxy back-fills a missing one
 * "for backward compatibility" (`grouping.py`, both releases), which makes
 * such an entry legacy state no widget can name, not an impossibility. It
 * still takes up its position, as it does when Galaxy enumerates the list.
 */
export function repeatInstances(saved: WorkflowParameterValue): RepeatInstance[] {
  if (!Array.isArray(saved)) {
    return []
  }
  const found: RepeatInstance[] = []
  saved.forEach((value, position) => {
    if (isWorkflowRepeatInstanceValue(value)) {
      found.push({ position, instance: value })
    }
  })
  return found
}

/**
 * The saved list with one parameter of the instance at `position` written,
 * every other entry kept as it was. A new list: the saved one is not touched.
 *
 * Mapped over the **saved** list rather than over `repeatInstances`, so an
 * entry that reading skipped is carried through instead of being dropped by
 * the first edit anywhere in the repeat.
 */
export function repeatWithChild(
  saved: WorkflowParameterValue,
  position: number,
  name: string,
  value: WorkflowParameterValue,
): WorkflowParameterValue[] {
  const list = Array.isArray(saved) ? saved : []
  return list.map((entry, index) => (
    index === position && isWorkflowRepeatInstanceValue(entry)
      ? { ...entry, [name]: value }
      : entry
  ))
}

/**
 * The bag a parameter group saved, read as empty when the saved value is not
 * one.
 *
 * Anything else is state no widget modelled. Reading it as empty renders the
 * group with no children rather than throwing on the way past, which is the
 * same reading a step gives a parameter it holds no value for.
 */
export function parameterGroupValue(saved: WorkflowParameterValue): WorkflowConditionalParametersValue {
  return isParameterGroupValue(saved) ? saved : {}
}

/**
 * The group's bag with one child written: a new bag, the saved one is not
 * touched.
 *
 * A section can be nested (`settings` holds `attc_settings` holds
 * `dist_thresh`), so every level has to hand its parent a new value for the
 * chain to reach the step's model. Mutating in place happens to work while the
 * model is the same object all the way down, and stops working the first time
 * any level copies.
 */
export function parameterGroupWithChild(
  saved: WorkflowParameterValue,
  name: string,
  value: WorkflowParameterValue,
): WorkflowConditionalParametersValue {
  return { ...parameterGroupValue(saved), [name]: value }
}

/**
 * The parameters of the case a conditional was saved on, or `undefined` when
 * the saved value names no case the tool declares.
 *
 * `__current_case__` is the index Galaxy wrote into the saved state, so the
 * declared cases are indexed with it as they stand. That is why
 * `offeredToolInputs` filters each case's inputs and never drops a case:
 * dropping one would renumber the rest.
 */
export function conditionalCaseInputs(
  conditional: Pick<GalaxyConditionalParameter, 'cases'>,
  saved: WorkflowParameterValue,
): GalaxyToolParameters[] | undefined {
  const currentCase = parameterGroupValue(saved).__current_case__
  return typeof currentCase === 'number' ? conditional.cases[currentCase]?.inputs : undefined
}

/** One option of a select: what the reader is shown, and what the state saves. */
export interface SelectOption {
  label: string
  value: string
}

/**
 * What a select offers: each option its tool declares, by label and value,
 * in the declared order (#183). Galaxy declares an option as `[label, value,
 * selected]`, shows the label and saves the value, on both releases
 * (`ui-misc.js:208` at 22.05, `FormSelection.vue:76` at 26.1), so a widget
 * that listed the values showed `--circ` where the tool says "circular
 * (--circ)".
 *
 * `options` is read without a guard: blendtype declares it on every select,
 * and Galaxy's `SelectToolParameter.to_dict` always writes it, as an empty
 * list when a dynamic select has nothing to offer (`basic.py:1106` at 22.05,
 * `:1228` at 26.1).
 */
export function selectOptions(select: Pick<GalaxySelectToolParameter, 'options'>): SelectOption[] {
  return select.options.map(([label, value]) => ({ label, value }))
}

/**
 * The label of each option the saved value holds, in the saved order, which
 * is the order Galaxy keeps a multiple select's values in. A value no option
 * holds is named by nothing (#183).
 *
 * A multiple select saves a list and a single one a string, which reads here
 * as a list of one. Reading the string alone named nothing for a multiple
 * select, because the saved list matched no single value.
 */
export function selectOptionLabels(
  select: Pick<GalaxySelectToolParameter, 'options'>,
  saved: WorkflowParameterValue,
): string[] {
  const options = selectOptions(select)
  const savedValues = Array.isArray(saved) ? saved : [saved]
  return savedValues.flatMap(savedValue => options.find(option => option.value === savedValue)?.label ?? [])
}

/**
 * Whether a boolean's saved value reads as true, the way Galaxy reads it.
 *
 * Not by comparing against `truevalue` and `falsevalue`: those are not the
 * saved spelling at all. Galaxy writes them in exactly one place,
 * `BooleanToolParameter.to_param_dict_string`, which picks one or the other
 * on the way to a **command line** (`basic.py:582` at 22.05, `:678` at 26.1),
 * while the state holds `to_json`, which is `json.dumps(self.to_python(value,
 * app))` at 22.05 (`:575`) and `self.to_python(value, app)` at 26.1 (`:672`).
 * `integron_finder`'s `gbk` saves `true` and declares `truevalue: "--gbk"`
 * (#111).
 *
 * `booleanToolParameterValue` is that reading, published by #110 against
 * `to_python` on both releases. The same function serves the saved state and
 * the tool's declared default because Galaxy reads both through `to_python`:
 * `ToolParameter.value_from_basic` delegates to it for anything that is not a
 * runtime marker (`basic.py:243` at 22.05, `:306` at 26.1). What this adds is
 * the two ends it does not cover: the shapes `to_python` is never handed, and
 * the `null` a two-state widget has no place for.
 */
export function isBooleanParameterTrue(
  parameter: Pick<GalaxyBooleanToolParameter, 'optional'>,
  saved: WorkflowParameterValue,
): boolean {
  // Nothing `to_python` is ever asked to read. A boolean the workflow editor
  // marked "set at runtime" saves `{__class__: "RuntimeValue"}` and Galaxy
  // short-circuits it before `to_python` sees it (`basic.py:230` at 22.05,
  // `:295` at 26.1); a list or a nested object belongs to a group rather than
  // to a boolean at all. They read as false.
  if (typeof saved === 'object' && saved !== null) {
    return false
  }
  // A number is not a shape Galaxy's own `to_json` writes for a boolean, but
  // `string_as_bool` would still read one: it compares `str(string).lower()`,
  // so a saved `1` is true. Stringified rather than refused, because refusing
  // it would disagree with `to_python` about a value the saved-value type
  // admits.
  const read = booleanToolParameterValue({
    value: typeof saved === 'number' ? String(saved) : saved,
    optional: parameter.optional,
  })
  // And `null`: an optional boolean is tri-state in Galaxy and a widget that
  // shows true or false has no third state, so `null` reads as false.
  return read ?? false
}

/**
 * How a boolean is written back: `'true'` or `'false'`, the 22.05 state
 * spelling, which is what Galaxy reads on the way back in.
 * `BooleanToolParameter.from_json` is `to_python` is `string_as_bool`
 * (`basic.py:565` at 22.05, `:662` at 26.1), which accepts it on both
 * releases, whereas writing `truevalue` would be read as `false` for every
 * tool whose `truevalue` is not one of `true`/`yes`/`on`/`1`, `gbk` among
 * them.
 */
export function booleanParameterSpelling(value: boolean): 'true' | 'false' {
  return value ? 'true' : 'false'
}
