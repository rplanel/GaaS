export type GalaxyToolParameters = GalaxySelectToolParameter
  | GalaxyBooleanToolParameter
  | GalaxyDataToolParameter
  | GalaxyConditionalParameter
  | GalaxyIntegerToolParameter
  | GalaxyFloatToolParameter
  | GalaxyTextToolParameter
  | GalaxySectionToolParameter
  | GalaxyRepeatToolParameter

export interface GalaxyDataToolValue {
  values: {
    id: string
    src: string
  }[]
}
export type GalaxyToolParameterValue = string | string[] | GalaxyDataToolValue
/**
 * The `type` a tool's `to_dict` writes for a parameter or a group.
 *
 * Not the whole of Galaxy's list, and never was: `data_collection` is
 * declared by recorded tools and is not here (#114). What is here is what a
 * component is mapped for — `useGalaxyToolInputComponent` reads this union as
 * its key set, so a member without a component renders a parameter as
 * nothing at all, which is the defect #101 was and #113 was again for `text`.
 */
export type GalaxyToolParameterType = 'select' | 'boolean' | 'data' | 'float' | 'conditional' | 'integer' | 'text' | 'section' | 'repeat'
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
   * Spelled out rather than derived from `GalaxyToolParameterValue`, which is
   * the only `value` in this file that is not. Adding `boolean` to that union
   * would reach the select types through their
   * `Exclude<…, GalaxyDataToolValue>`, which would then admit a boolean for a
   * select — a shape no release sends. One member spelled out beats four
   * derived ones going wrong.
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

/**
 * A parameter that takes any text (#113) — and the class Galaxy's integer and
 * float parameters subclass, which is where their `area` comes from.
 *
 * `to_dict` writes `ToolParameter.dict_collection_visible_keys` and then
 * `model_class`, `optional`, `hidden`, `is_dynamic` and `value`, and
 * `TextToolParameter.to_dict` adds `area` and `datalist` — the same at 22.05
 * (`tools/parameters/basic.py:156`, `:377-383`) and 26.1 (`:221`, `:465-471`).
 * 26.1's visible keys have also gained `help_format`, which every parameter
 * kind carries rather than this one, so it is not declared here.
 *
 * Seven are recorded: `add_covar`, `strat_covar` and `xp_desc` at the top
 * level of `ccqtl-today` at 22.05, and at 26.1 `identifier` and
 * `suffix_pattern` inside the cases of two conditionals of
 * `conditional-repeat-runtime`, the second declared in three cases.
 */
export interface GalaxyTextToolParameter extends BaseToolParameter {
  model_class: 'TextToolParameter'
  type: Extract<GalaxyToolParameterType, 'text'>
  /**
   * The tool's default, as the serializer that writes a step's saved value
   * writes it — so `string | null` here is also what a saved text parameter
   * holds, on both releases, by two different routes.
   *
   * - 22.05: `TextToolParameter` inherits `SimpleTextToolParameter.to_json`
   *   (`basic.py:335-341`), which writes `None` as `""` unless the parameter
   *   is `optional`, and anything else as `unicodify(value)`.
   * - 26.1: that override is gone, so it inherits `ToolParameter.to_json`
   *   (`:278-280`), a bare `unicodify(value)` — and `unicodify(None)` is
   *   `None` (`util/__init__.py:1230`). A required parameter declaring no
   *   default therefore answers `""` at 22.05 and `null` at 26.1.
   *
   * #113 said the whole of this was `ToolParameter.to_json`, which is only
   * the 26.1 half. Recorded: `""` on the three 22.05 parameters, `null` on
   * `identifier` and `"_#"` on `suffix_pattern` at 26.1.
   */
  value: string | null
  /**
   * Weaker than the word suggests, and weaker at 22.05 than at 26.1.
   *
   * On the server, all it decides about a value that arrives is whether an
   * **empty** one skips the tool's validators: `ToolParameter.validate`
   * returns early `if value in ["", None] and self.optional` and otherwise
   * runs them (`basic.py:288` at 22.05, `:356` at 26.1), so a parameter with
   * no validators accepts `""` whatever this says. (At 22.05 it also picks
   * what a missing value is written as — see `value`.) There it is the
   * `optional` attribute, defaulting to `false` (`:329`); 26.1 infers it for
   * a text parameter declaring none, as optional exactly when its validators
   * accept `""` (`text_input_is_optional`, `tool_util/parser/util.py:90`).
   *
   * So `false` does not mean the parameter must be filled in: all three of
   * `ccqtl-today`'s are `false`, save `""` and run that way in production —
   * `xp_desc` is even labelled "(optional)".
   */
  optional: boolean
  /** Whether the tool asks for a multi-line box rather than a single line. */
  area: boolean
  /**
   * Suggestions built from the parameter's `<option>` children — never a
   * restriction on what may be typed. `{"label": title, "value": value}` per
   * option on both releases, the label falling back to the value; `[]` on
   * every recorded text parameter, so this shape is read off the source.
   */
  datalist: { label: string, value: string }[]
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

/**
 * A **group**, not a parameter: a titled box holding further inputs, which the
 * saved state nests one level deeper under the group's name (#101).
 *
 * Deliberately not extending `BaseToolParameter`. Galaxy's `Section` is a
 * `Group`, not a `ToolParameter`, and its `to_dict` writes exactly
 * `dict_collection_visible_keys = ["name", "type", "title", "help", "expanded"]`
 * plus the `inputs` list it appends by hand — character-identical at 22.05
 * (`tools/parameters/grouping.py:172`, `:220`) and 26.1 (`:198`, `:248`). So a
 * section has no `label`, no `argument`, no `optional`, no `value`, and
 * inheriting the base would have declared six keys no release sends.
 *
 * `title` is a plain attribute initialised to `None`, so it is nullable —
 * unlike a repeat's, which is a property falling back to the name. `help` is
 * `None` on all four recorded sections.
 *
 * `model_class` comes from `dict_for`, which stamps every dictified object
 * with its class name (`util/dictifiable.py`). Measured at 26.1, where the
 * recordings are; read off the source for 22.05, which no recording covers
 * because no workflow in Pasteur's account has a section.
 *
 * The prefix a section contributes to a parameter's submitted name is
 * `f"{name_prefix + input.name}|"` — the same join a conditional makes, which
 * is why `flattenKey` serves both.
 */
export interface GalaxySectionToolParameter {
  model_class: 'Section'
  type: Extract<GalaxyToolParameterType, 'section'>
  name: string
  title: string | null
  help: string | null
  /** Whether the tool asks for the box to start open. Nothing reads it yet. */
  expanded: boolean
  inputs: GalaxyToolParameters[]
}

/**
 * A group the author may hold **several of**, each instance a bag of the same
 * declared inputs (#101).
 *
 * The declaration is one blueprint; how many there are lives in the saved
 * state, as a list of `WorkflowRepeatInstanceValue`. So a reader of a repeat
 * walks the state and resolves each value against these `inputs`, never the
 * other way round — the direction `unconnectedDatasetInputs` already takes.
 *
 * `dict_collection_visible_keys = ["name", "type", "title", "help", "default",
 * "min", "max"]` on both releases (`grouping.py:80` at 22.05, `:100` at 26.1),
 * with `inputs` appended by `to_dict`.
 *
 * `title` is a property returning `self._title or self.name`, so it is never
 * null — the one member that differs from a section's. `min` and `max` are
 * both nullable: 22.05 initialises them to `None` and serialises that
 * straight, while 26.1 initialises `max` to `inf` and `to_dict` turns an
 * infinite one back into `null` (`:187-188`).
 *
 * **`min`, `max` and `default` are declarations this project does not act on**,
 * because #101 decided that adding and removing instances is out of scope —
 * and not merely deferred. `compute_runtime_state` applies invocation
 * parameters by walking the instances the *saved state* already holds, so a
 * name addressing an instance that is not there matches nothing, and there is
 * no spelling at all for removing one. Arity is a workflow-editor operation.
 *
 * The prefix an instance contributes is `f"{input.name}_{i}|"`, where `i` is
 * its **position** in the list — `visit_input_values` overwrites
 * `d["__index__"] = i` immediately before building it
 * (`tools/parameters/__init__.py:175-176` at 22.05, `:239-240` at 26.1).
 */
export interface GalaxyRepeatToolParameter {
  model_class: 'Repeat'
  type: Extract<GalaxyToolParameterType, 'repeat'>
  name: string
  title: string
  help: string | null
  default: number
  min: number | null
  max: number | null
  inputs: GalaxyToolParameters[]
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
