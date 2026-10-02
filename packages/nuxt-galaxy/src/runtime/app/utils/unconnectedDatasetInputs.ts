import type { GalaxyTool, WorkflowStepConnections, WorkflowToolParameters } from 'blendtype'
import { isWorkflowRepeatInstanceValue, isWorkflowRuntimeValue } from 'blendtype'

/**
 * One data parameter of a tool step that nothing will supply at invoke.
 *
 * `name` is Galaxy's own prefixed name — `settings|attc_settings|covar_matrix`,
 * `datasets_3|input` — because that is the spelling a connection is keyed by,
 * and so the only one the two sides can be compared in. Inside a repeat the
 * number is the instance's position in the saved list; see the walk below for
 * why that is not the same claim as the `__index__` it carries.
 */
export interface UnconnectedDatasetInput {
  readonly name: string
  /** What the tool calls it on screen, falling back to its name when it is unlabelled. */
  readonly label: string
  /** Whether Galaxy would run the step without it. */
  readonly optional: boolean
}

/**
 * The parameter types of a tool step that carry a **dataset**, and so are fed
 * by an edge rather than typed into a form.
 *
 * Exported because the invoke form's widget filter has to agree with it. The
 * two are the same judgement read in opposite directions — "this is fed by the
 * graph, so offer no widget" and "this is fed by the graph, and nothing is
 * feeding it" — and stated twice they drifted: the filter tested
 * `type !== 'data'` alone, so a `data_collection` parameter was at once given a
 * widget slot *and* reported as unconnected. `data_collection` is not in
 * `GalaxyToolParameterType` at all, which is why nothing caught it.
 *
 * Galaxy's own list is `["data", "data_collection"]`, in the `is_data` test
 * both `add_dummy_datasets` and `ToolModule.execute`'s callback make.
 */
export const DATASET_INPUT_TYPES: ReadonlySet<string> = new Set(['data', 'data_collection'])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * That every data parameter of a stored tool step carries one of the two
 * markers is two functions' doing, not one — the correction made while
 * checking this file's citations against the source (#102):
 *
 * - `BaseDataToolParameter.get_initial_value` returns `RuntimeValue()` from
 *   its first branch whenever `workflow_building_mode is ENABLED`, so opening
 *   a workflow in the editor makes every data parameter a runtime value
 *   before anything looks at the graph (`tools/parameters/basic.py:1853` at
 *   22.05, `:2059` at 26.1).
 * - `ToolModule.add_dummy_datasets` then returns `ConnectedValue()` for each
 *   input a connection names (`workflow/modules.py:1710` at 22.05, `:2688`
 *   at 26.1).
 *
 * Galaxy says the first part in as many words too — "All data parameters are
 * represented as runtime values" — though in the narrower setting of
 * `SubworkflowModule.get_runtime_inputs`, explaining why that function skips
 * them, rather than as a declaration about tool state.
 *
 * Both are *save*-time decisions, so the marker says nothing about what will
 * happen at run time, and `isWorkflowRuntimeValue` draws no distinction
 * between the two for the reason Galaxy draws none: `ConnectedValue`
 * subclasses `RuntimeValue`, and `is_runtime_value` tests the base class.
 * That is the correction #97 rests on — the ticket read `RuntimeValue` as
 * "the reader must supply this" and `ConnectedValue` as "an edge supplies
 * this", where the recordings show both markers on both kinds of parameter
 * and a marker is not what Galaxy consults.
 *
 * Checked on both releases this project meets, because the recordings span
 * them and the marker test moved house between them. It is character for
 * character the same (`dict` widened to `MutableMapping`, which changes
 * nothing here):
 *
 * - 22.05: `tools/parameters/basic.py:80`, comment at `workflow/modules.py:602`
 * - 26.1: `tools/parameters/workflow_utils.py:50`, comment at `workflow/modules.py:1029`
 *
 * The predicate itself lives in `blendtype` beside the type it narrows to
 * (#102). It was written out here while `WorkflowParameterValue` could not
 * express a marker at all, which made a local `boolean` test the only thing
 * there was to write.
 */

/** What a step says, beside its saved state, about where its inputs come from. */
interface StepSources {
  readonly connections: WorkflowStepConnections
  readonly defaults: Readonly<Record<string, unknown>>
}

/**
 * Whether something will supply this input: an edge, or a default the
 * workflow gives it.
 *
 * Those are what `replacement_for_input` reads. It looks the prefixed name up
 * in `step.input_connections_by_name` first and fills the parameter from the
 * upstream output if it is there (`workflow/run.py:290` at 22.05, `:460` at
 * 26.1). A `data_input` step of the workflow is not a separate case — it
 * reaches a tool step through a connection like anything else.
 *
 * Through 23.1 that lookup is the whole of it, which is what #97 found at
 * 22.05. #105 found two more branches after it: from 23.2 the step input's
 * own default (`run.py:491` at 26.1), which `defaults` carries, and from 24.1
 * a step value that is not a runtime marker, which `walk` never reports in
 * the first place. A default is counted on every release, 22.05 included,
 * where Galaxy ignores it: missing a gap there is the safe reading, for the
 * reason `walk` gives.
 *
 * An empty array counts as nothing joined. The export models a fan-in as an
 * array under the input's name, so the key existing is not the same as the
 * input being fed.
 */
function isSupplied(sources: StepSources, prefixedName: string): boolean {
  if (Object.hasOwn(sources.defaults, prefixedName)) {
    return true
  }
  const connection = sources.connections[prefixedName]
  if (connection === undefined || connection === null) {
    return false
  }
  return Array.isArray(connection) ? connection.length > 0 : true
}

function labelOf(node: Record<string, unknown>, name: string): string {
  const label = node.label
  return typeof label === 'string' && label.trim().length > 0 ? label : name
}

function inputsOf(node: Record<string, unknown>): unknown[] {
  return Array.isArray(node.inputs) ? node.inputs : []
}

/**
 * Walk the **saved state**, using the definition only to resolve what each
 * value is.
 *
 * This direction round is what makes a repeat work. A tool declares one
 * blueprint for its repeat block and the saved state holds however many
 * instances the author added, each with its own `__index__` — which is the
 * number Galaxy's prefixed name carries (`datasets_3|input`). Walking the
 * definition instead would find the blueprint and have no idea how many of it
 * there are.
 *
 * `unknown` rather than `GalaxyToolParameters` for the same reason
 * `withoutDatasetOptions` is structural: a data parameter can sit inside a
 * conditional's case, a repeat block or a section, and only the first of
 * those three is in that union at all.
 */
function walk(
  nodes: unknown[],
  state: unknown,
  prefix: string,
  sources: StepSources,
  found: UnconnectedDatasetInput[],
): void {
  if (!isPlainObject(state)) {
    return
  }
  for (const node of nodes) {
    if (!isPlainObject(node)) {
      continue
    }
    const name = node.name
    const type = node.type
    if (typeof name !== 'string' || typeof type !== 'string') {
      continue
    }
    const value = state[name]

    if (DATASET_INPUT_TYPES.has(type)) {
      const prefixedName = `${prefix}${name}`
      // A value that is not a runtime marker is one this function did not
      // model, and saying nothing is the safe reading of that: the warning
      // exists to name a gap, so inventing one costs more than missing one.
      if (isWorkflowRuntimeValue(value) && !isSupplied(sources, prefixedName)) {
        found.push({ name: prefixedName, label: labelOf(node, name), optional: Boolean(node.optional) })
      }
      continue
    }

    if (type === 'section') {
      walk(inputsOf(node), value, `${prefix}${name}|`, sources, found)
      continue
    }

    if (type === 'conditional') {
      // Only the case the revision was saved on. `__current_case__` is the
      // index Galaxy wrote there, and the other cases will not run at all, so
      // reporting a parameter out of one would name a gap that does not exist.
      const cases = Array.isArray(node.cases) ? node.cases : []
      const currentCase = isPlainObject(value) ? value.__current_case__ : undefined
      const chosen = typeof currentCase === 'number' ? cases[currentCase] : undefined
      if (isPlainObject(chosen)) {
        walk(inputsOf(chosen), value, `${prefix}${name}|`, sources, found)
      }
      continue
    }

    if (type === 'repeat') {
      if (!Array.isArray(value)) {
        continue
      }
      // The instance's **position** in the saved list, not the `__index__` it
      // carries — corrected by #101 against the source, where this file used
      // to say the opposite.
      //
      // `visit_input_values` overwrites the stored index with the position
      // before it builds the name:
      //
      //     for i, d in enumerate(values):
      //         d["__index__"] = i
      //         new_name_prefix = name_prefix + f"{input.name}_{i}|"
      //
      // `tools/parameters/__init__.py:174-176` at 22.05, `:238-240` at 26.1.
      // `ToolModule.execute`'s callback is what looks the resulting name up in
      // `input_connections_by_name`, so the position is the spelling both this
      // mark and the invocation are keyed by. They agree on any state Galaxy
      // wrote, because every save-time visit renumbers the indices; on state
      // edited elsewhere the position is the one that is right, and reading
      // `__index__` here while `useGalaxyEncodeParameters` names the position
      // would spell one input two ways in the same panel.
      //
      // Enumerated over the whole list, as Galaxy enumerates it, so an entry
      // carrying no `__index__` still takes up a position rather than shifting
      // the ones after it.
      value.forEach((instance, position) => {
        if (!isWorkflowRepeatInstanceValue(instance)) {
          return
        }
        walk(inputsOf(node), instance, `${prefix}${name}_${position}|`, sources, found)
      })
    }
  }
}

/**
 * The data parameters of one tool step that nothing will supply (#97).
 *
 * A data parameter of a tool step is filled by an edge — from an upstream
 * tool, or from one of the workflow's own `data_input` steps — or, since
 * 23.2, by a default the workflow gives that step input (#105), and never by
 * anything the invoke form could offer. So a data parameter with neither is
 * one nothing will supply, and Galaxy says nothing about it before the fact.
 *
 * What happens then is release-dependent, and
 * `describeUnconnectedDatasetInputs` carries the detail: through 24.1 the
 * marker survives into `from_json`, which returns `None` for it before the
 * required check, so the invocation is accepted whether or not the parameter
 * is required; from 24.2 the marker is replaced with `None` first, so a
 * required one raises and the invocation is refused. An **optional** one
 * runs with the input empty on every release, which is every instance the
 * recordings hold. `unconnectedInputsRefuseInvocation` draws that line.
 *
 * **Known limitation.** Releases after 22.05 give `DataToolParameter` a
 * `default_object` — a `<param type="data">` may declare a default, only on
 * a parameter that is not optional, and an unconnected one is then filled
 * from it rather than left empty (`basic.py:2364` at 26.1). Such an input is
 * reported here even though Galaxy would supply it, and because it is always
 * required, from 24.2 the form **refuses** a submission Galaxy would run. It
 * cannot be told apart from this side: the tool API's `to_dict` exposes no
 * `default` key, and the `value` it does return comes from
 * `get_initial_value`, which is a scan of the requesting account's history
 * rather than a declaration — which is exactly what the description endpoint
 * strips as `withoutDatasetOptions`. From 26.0, `/api/tools/{id}/inputs`
 * does carry it, as a data parameter model's `url_default`: #142.
 *
 * Every one of the recordings' own cases is settled by the edge and not by
 * the marker: `ccqtl-wf` step 4 carries four `RuntimeValue` data inputs and
 * four connections, so it reports nothing, while `integron_finder` step 1
 * carries `topology_file` with no edge, and `__BUILD_LIST__` step 2 keeps
 * five repeat entries against three connections. None of them gives an
 * input a default.
 *
 * `input_defaults` is required, not defaulted: a caller that dropped it would
 * have every defaulted input reported, and from 24.2 refused.
 */
export function unconnectedDatasetInputs(
  tool: GalaxyTool,
  step: {
    readonly tool_inputs: WorkflowToolParameters
    readonly input_connections: WorkflowStepConnections
    readonly input_defaults: Readonly<Record<string, unknown>>
  },
): UnconnectedDatasetInput[] {
  const found: UnconnectedDatasetInput[] = []
  const sources = { connections: step.input_connections ?? {}, defaults: step.input_defaults }
  walk(tool.inputs ?? [], step.tool_inputs, '', sources, found)
  return found
}

/**
 * The first release that refuses an invocation leaving a required dataset
 * input with nothing to supply it. Galaxy's `version_major` is
 * `<year>.<number>` — `22.05`, `24.2`, `26.1` — and is compared as the two.
 */
const FIRST_REFUSING_RELEASE = { year: 24, number: 2 } as const

/**
 * Whether the Galaxy that answers `/api/version` with this `version_major`
 * refuses an invocation in which a **required** dataset input is left with
 * nothing to supply it.
 *
 * From 24.2. `ToolModule.execute` visits the step's state with
 * `replace_optional_connections=True`, and what that visit does to a runtime
 * marker nothing replaced is what changed:
 *
 * - Through 24.1 it is replaced only under `hasattr(input, "value")`
 *   (`tools/parameters/__init__.py:160` at 22.05, `:169` at 24.1), which a
 *   `DataToolParameter` fails — nothing on its chain sets `value` — so the
 *   marker survives, and `from_json` returns `None` for it *before* the
 *   required check. Accepted.
 * - From 24.2 the guard is gone and a parameter with no `value` is set to
 *   `None` (`:196-208` at 24.2, `:202-212` at 26.1), so `from_json` reaches
 *   `if not value and not self.optional and not self.default_object` and
 *   raises `ParameterValueError`. Refused.
 *
 * `from_json` reads the same on 24.1 and 24.2, so the visit is the whole
 * difference.
 *
 * A release this cannot read — not answered yet, refused, or a string it does
 * not parse — refuses nothing. That is Q10: the form refuses only what Galaxy
 * is known to refuse, and Pasteur answers 22.05.
 */
function releaseRefusesUnconnectedRequired(versionMajor: string | undefined): boolean {
  const match = /^(\d+)\.(\d+)/.exec(versionMajor ?? '')
  if (!match) {
    return false
  }
  const year = Number(match[1])
  const number = Number(match[2])
  return year > FIRST_REFUSING_RELEASE.year
    || (year === FIRST_REFUSING_RELEASE.year && number >= FIRST_REFUSING_RELEASE.number)
}

/**
 * Whether one step's unconnected dataset inputs make the Galaxy answering
 * `/api/version` with this `version_major` refuse the invocation (#105) — and
 * so whether the form must refuse it first, before the datasets are
 * uploaded, as it does for `blockingTools`.
 *
 * Both halves in one place: a **required** input among them, on a release
 * that refuses one. An optional one runs with the input empty on every
 * release, so it never refuses; a release this cannot read refuses nothing.
 */
export function unconnectedInputsRefuseInvocation(
  inputs: readonly UnconnectedDatasetInput[],
  versionMajor: string | undefined,
): boolean {
  return releaseRefusesUnconnectedRequired(versionMajor) && inputs.some(input => !input.optional)
}
