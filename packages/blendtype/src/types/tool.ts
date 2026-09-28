export type GalaxyToolParameters = GalaxySelectToolParameter
  | GalaxyBooleanToolParameter
  | GalaxyDataToolParameter
  | GalaxyConditionalParameter
  | GalaxyIntegerToolParameter
  | GalaxyFloatToolParameter

export interface GalaxyDataToolValue {
  values: {
    id: string
    src: string
  }[]
}
export type GalaxyToolParameterValue = string | string[] | GalaxyDataToolValue
export type GalaxyToolParameterType = 'select' | 'boolean' | 'data' | 'float' | 'conditional' | 'integer'
interface BaseToolParameter {
  name: string
  label: string
  argument: string | null
  help: string
  refresh_on_change: boolean
  optional: boolean
  hidden: boolean
  is_dynamic: boolean
  component?: {
    props: GalaxyToolParameters
    instance: any
  } | undefined
}

export interface GalaxyBaseSelectToolParameter extends BaseToolParameter {
  model_class: 'SelectToolParameter'
  type: Extract<GalaxyToolParameterType, 'select'>
  /**
   * Nullable, on all three of these interfaces (#110).
   *
   * `SelectToolParameter.get_initial_value` returns `None` on three paths, the
   * function being character-identical at 22.05 (`basic.py:1053`) and 26.1
   * (`basic.py:1174`) but for a `ParameterOption` dataclass replacing an
   * `(label, value, selected)` tuple:
   *
   * 1. `get_options` raises `ImplicitConversionRequired`;
   * 2. `not options` — a dynamic select whose options come from a dataset that
   *    is not there;
   * 3. nothing selected **and** (`optional` or `multiple`). Galaxy's comment on
   *    the other branch says why: "Nothing selected, but not optional and not a
   *    multiple select, with some values, so we have to default to something".
   *
   * `integron_finder`'s `type_replicon` is the third, recorded: `optional: true`,
   * `multiple: false`, two options and neither marked selected.
   */
  value: Exclude<GalaxyToolParameterValue, GalaxyDataToolValue> | null
  options: Array<[string, string, boolean]>
  display: string | null
  multiple: boolean
  textable: boolean
}

/**
 * The single/multiple split is sound and stays narrow: `get_initial_value`
 * returns a bare `value[0]` unless `self.multiple` *and* more than one option
 * is selected, in which case it returns the list. Only `null` was missing —
 * and from here rather than only from the base, since a widened base alone
 * leaves the recorded `type_replicon` refused by the subtype it actually is.
 */
export interface GalaxySingleSelectToolParameter extends GalaxyBaseSelectToolParameter {
  multiple: false
  value: Extract<GalaxyToolParameterValue, string> | null
}

export interface GalaxyMultipleSelectToolParameter extends GalaxyBaseSelectToolParameter {
  multiple: true
  value: Extract<GalaxyToolParameterValue, string[]> | null
}

export type GalaxySelectToolParameter = GalaxySingleSelectToolParameter | GalaxyMultipleSelectToolParameter

export interface GalaxyBooleanToolParameter extends BaseToolParameter {
  model_class: 'BooleanToolParameter'
  type: Extract<GalaxyToolParameterType, 'boolean'>
  /**
   * A **string** at 22.05 and a real **boolean** at 26.1 — the one release
   * divergence in this file, and the reason `booleanToolParameterValue` exists
   * rather than a caller narrowing this union itself (#110).
   *
   * `BooleanToolParameter.to_json` is the whole of it, one line either way:
   *
   * - 22.05 `json.dumps(self.to_python(value))` (`basic.py:575`), so
   *   `to_dict()["value"]` is `'true'`, `'false'` or — see below — `'null'`.
   * - 26.1 `self.to_python(value, app)` (`basic.py:672`), so it is `true`,
   *   `false` or `null`.
   *
   * Galaxy's own doctests assert exactly that, `('value', 'true')` against
   * `('value', True)`, and 26.1 added two `assert isinstance(value, bool)` to
   * pin it. Measured on both sides of the recording set too: `ccqtl_genome_scan`
   * `adjust` is `"false"` at 22.05, while `integron_finder` carries nine real
   * `false`s at 26.1.
   *
   * **`null` is read off the source, not measured.** `checked` defaults to
   * `None if optional else False` (`tool_util/parser/util.py:68` at 26.1,
   * inline in the constructor at 22.05) and `get_initial_value` returns it
   * straight (`basic.py:579` / `:675`), so an `optional` boolean declaring no
   * `checked` yields `None`. No recorded tool has an optional boolean, so this
   * member is here because the reader must survive it rather than because a
   * fixture shows it.
   */
  value: boolean | string | null
  truevalue: string
  falsevalue: string
}

/**
 * A boolean parameter's value, read the way Galaxy reads it.
 *
 * Published because the wire type *changes between the two releases this
 * project spans*, and Galaxy@Pasteur is about to cross that line: a caller
 * narrowing `boolean | string | null` itself would work on 22.05 and quietly
 * invert on 26.1, or the other way about, and the flip would land as a
 * behaviour change nobody edited. One reader means the upgrade is invisible to
 * every call site.
 *
 * Faithful to `BooleanToolParameter.to_python`, which dispatches on `optional`
 * and is identical on both releases:
 *
 * - not optional → `string_as_bool`, true for `true`, `yes`, `on` **and `1`**;
 * - optional → `string_as_bool_or_none`, `null` for `none` and `null`, true
 *   for `true`, `yes`, `on` — and **not** for `1`, which that function omits.
 *
 * The `1` is not a transcription slip: the two helpers really disagree about
 * it (`util/__init__.py`, both releases), so an optional and a required
 * boolean read `"1"` differently and this follows suit. Comparison is
 * case-insensitive in both, as Galaxy's `str(string).lower()` makes it.
 *
 * That `'null'` is a string at 22.05 costs nothing here, and nothing upstream
 * either: `string_as_bool_or_none` accepts `"null"` as well as `"none"`, so
 * Galaxy's own round trip survives it even though its docstring names only
 * `'None'`.
 */
export function booleanToolParameterValue(
  parameter: Pick<GalaxyBooleanToolParameter, 'value' | 'optional'>,
): boolean | null {
  const { value, optional } = parameter
  if (typeof value === 'boolean') {
    return value
  }
  const spelling = String(value).toLowerCase()
  if (optional) {
    if (spelling === 'none' || spelling === 'null') {
      return null
    }
    return spelling === 'true' || spelling === 'yes' || spelling === 'on'
  }
  return spelling === 'true' || spelling === 'yes' || spelling === 'on' || spelling === '1'
}

export interface GalaxyDataToolParameter extends BaseToolParameter {
  model_class: 'DataToolParameter'
  type: Extract<GalaxyToolParameterType, 'data'>
  /**
   * Nullable by construction, and `null` on every data parameter in every
   * recording — 24 of them across the two fixtures recorded with tools.
   *
   * `ToolParameter.to_dict` fills the key with
   * `value_to_basic(self.get_initial_value(trans, other_values), …)` —
   * verbatim on both releases (`tools/parameters/basic.py:302` at 22.05,
   * `:373` at 26.1) — and for a data parameter `get_initial_value` is not a
   * declared default at all. It is, in order: a `RuntimeValue()` if the
   * request is in workflow-building mode, `None` if the parameter is
   * `optional`, and otherwise a scan of the *requesting account's* history
   * for a dataset of a matching extension (`basic.py:1853` at 22.05, `:2059`
   * at 26.1).
   *
   * So two of those three paths give `null`, which is what all 24 recorded
   * data parameters carry: the description endpoint reads tools outside
   * building mode, so an optional parameter answers `null` outright and a
   * required one answers `null` whenever that account's history holds nothing
   * that fits. Which is also why this is the per-request, per-account content
   * the endpoint strips as `withoutDatasetOptions`.
   */
  value: Extract<GalaxyToolParameterValue, GalaxyDataToolValue> | null
  extensions: string[]
  edam: {
    edam_formats: string[]
    edam_data: string[]
  }
  multiple: boolean
  options: {
    hda: {
      id: string
      hid: number
      name: string
      src: 'hda'
      keep: boolean
    }[]
    hdca: {
      id: string
      hid: number
      name: string
      src: 'hdca'
      keep: boolean

    }[]
  }
}

export interface GalaxyFloatToolParameter extends BaseToolParameter {
  model_class: 'FloatToolParameter'
  type: Extract<GalaxyToolParameterType, 'float'>
  min: number
  max: number
  value: Extract<GalaxyToolParameterValue, string>
  area: boolean

}

export interface GalaxyIntegerToolParameter extends BaseToolParameter {
  model_class: 'IntegerToolParameter'
  type: Extract<GalaxyToolParameterType, 'integer'>
  min: number
  max: number
  value: string
  area: boolean
}

export interface GalaxyConditionalCase {
  model_class: string
  value: Extract<GalaxyToolParameterValue, string>
  inputs: GalaxyToolParameters[]

}

export interface GalaxyConditionalParameter {
  cases: GalaxyConditionalCase[]
  model_class: 'Conditional'
  name: string
  test_param: Extract<GalaxyToolParameters, Extract<GalaxySelectToolParameter, GalaxySingleSelectToolParameter> | GalaxyBooleanToolParameter>
  type: Extract<GalaxyToolParameterType, 'conditional'>
  component?: {
    props: GalaxyToolParameters
    instance: any
  } | undefined
}

export interface GalaxyToolOutput {
  model_class: 'ToolOutput'
  name: string
  format: string
  label: string
  hidden: boolean
  output_type: string
  count: number
}

export interface GalaxyTool {
  model_class: 'Tool'
  id: string
  name: string
  version: string
  description: string
  edam_operations: string[]
  edam_topics: string[]
  tool_shed_repository: {
    name: string
    owner: string
    changeset_revision: string
    tool_shed: string
  }
  inputs: GalaxyToolParameters[]
  outputs: GalaxyToolOutput[]

}
