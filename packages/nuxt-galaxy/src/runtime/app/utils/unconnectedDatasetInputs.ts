import type { GalaxyTool, WorkflowStepConnections, WorkflowToolParameters } from 'blendtype'
import { isWorkflowRepeatInstanceValue, isWorkflowRuntimeValue } from 'blendtype'

/**
 * One data parameter of a tool step that nothing will supply at invoke.
 *
 * `name` is Galaxy's own prefixed name — `settings|attc_settings|covar_matrix`,
 * `datasets_3|input` — because that is the spelling a connection is keyed by,
 * and so the only one the two sides can be compared in.
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
 * That every data parameter of a stored tool step is a runtime marker comes
 * from `add_dummy_datasets`, which writes one for each, and is borne out by
 * every recording. Galaxy says so in as many words too — "All data parameters
 * are represented as runtime values" — though in the narrower setting of
 * `SubworkflowModule.get_runtime_inputs`, explaining why that function skips
 * them, rather than as a declaration about tool state.
 *
 * Which spelling gets written is decided at *save* time by
 * `add_dummy_datasets`, so it says nothing about what will happen at run
 * time, and `isWorkflowRuntimeValue` draws no distinction between the two for
 * the same reason Galaxy's `is_runtime_value` draws none. That is the
 * correction #97 rests on: the ticket read `RuntimeValue` as "the reader must
 * supply this" and `ConnectedValue` as "an edge supplies this", where the
 * recordings show both markers on both kinds of parameter and a marker is not
 * what Galaxy consults.
 *
 * Checked on both releases this project meets, because the recordings span
 * them and the function moved house between them. The test for the two
 * markers is character for character the same (`dict` widened to
 * `MutableMapping`, which changes nothing here):
 *
 * - 22.05: `tools/parameters/basic.py:80`, comment at `workflow/modules.py:602`
 * - 26.1: `tools/parameters/workflow_utils.py:50`, comment at `workflow/modules.py:1029`
 *
 * The predicate itself lives in `blendtype` beside the type it narrows to
 * (#102). It was written out here while `WorkflowParameterValue` could not
 * express a marker at all, which made a local `boolean` test the only thing
 * there was to write.
 */

/**
 * Whether an edge feeds this input.
 *
 * This is the whole test, because it is the whole of what Galaxy does:
 * `replacement_for_input` looks the prefixed name up in
 * `step.input_connections_by_name` and fills the parameter from the upstream
 * output if it is there, leaving the saved value untouched if it is not
 * (`workflow/run.py:290` at 22.05, `:460` at 26.1 — the lookup is the same
 * line on both). A `data_input` step of the workflow is not a separate
 * case — it reaches a tool step through a connection like anything else.
 *
 * An empty array counts as nothing joined. The export models a fan-in as an
 * array under the input's name, so the key existing is not the same as the
 * input being fed.
 */
function isFed(connections: WorkflowStepConnections, prefixedName: string): boolean {
  const connection = connections[prefixedName]
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
  connections: WorkflowStepConnections,
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
      if (isWorkflowRuntimeValue(value) && !isFed(connections, prefixedName)) {
        found.push({ name: prefixedName, label: labelOf(node, name), optional: Boolean(node.optional) })
      }
      continue
    }

    if (type === 'section') {
      walk(inputsOf(node), value, `${prefix}${name}|`, connections, found)
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
        walk(inputsOf(chosen), value, `${prefix}${name}|`, connections, found)
      }
      continue
    }

    if (type === 'repeat') {
      if (!Array.isArray(value)) {
        continue
      }
      for (const instance of value) {
        // The index the instance carries, never its position in the array:
        // Galaxy keys the connection by `__index__`, and a repeat whose
        // middle entry was deleted keeps the gap in its indices. That is the
        // whole of what `isWorkflowRepeatInstanceValue` tests.
        if (!isWorkflowRepeatInstanceValue(instance)) {
          continue
        }
        walk(inputsOf(node), instance, `${prefix}${name}_${instance.__index__}|`, connections, found)
      }
    }
  }
}

/**
 * The data parameters of one tool step that nothing will supply (#97).
 *
 * A data parameter of a tool step is filled by an edge — from an upstream
 * tool, or from one of the workflow's own `data_input` steps — and never by
 * anything the invoke form could offer. So a data parameter with no edge is
 * one nothing will supply, and Galaxy says nothing about it before the fact.
 *
 * What happens then is release-dependent, and
 * `describeUnconnectedDatasetInputs` carries the detail: at 22.05 the marker
 * survives into `from_json`, which returns `None` for it before the required
 * check, so the invocation is accepted whether or not the parameter is
 * required; by 26.1 the marker is replaced with `None` first, so a *required*
 * one raises and the invocation is refused. An **optional** one runs with the
 * input empty on both, which is every instance the recordings hold.
 *
 * **Known limitation.** 26.1 added `default_object` to
 * `DataToolParameter` — a `<param type="data">` may declare a default, and an
 * unconnected one is then filled from it rather than left empty
 * (`basic.py:2364`). Such an input is reported here even though Galaxy would
 * supply it. It cannot be told apart from this side: the tool API's `to_dict`
 * exposes no `default` key, and the `value` it does return comes from
 * `get_initial_value`, which is a scan of the requesting account's history
 * rather than a declaration — which is exactly what the description endpoint
 * strips as `withoutDatasetOptions`. 22.05 has no `default_object` at all.
 *
 * That silence is what this is for. It is not a submission blocker: the
 * invocation is valid and Galaxy will run it, which is why the form marks the
 * step rather than refusing (Q10 — mark only what would refuse it, and this
 * would not).
 *
 * Every one of the recordings' own cases is settled by the edge and not by
 * the marker: `ccqtl-wf` step 4 carries four `RuntimeValue` data inputs and
 * four connections, so it reports nothing, while `integron_finder` step 1
 * carries `topology_file` with no edge, and `__BUILD_LIST__` step 2 keeps
 * five repeat entries against three connections.
 */
export function unconnectedDatasetInputs(
  tool: GalaxyTool,
  step: { readonly tool_inputs: WorkflowToolParameters, readonly input_connections: WorkflowStepConnections },
): UnconnectedDatasetInput[] {
  const found: UnconnectedDatasetInput[] = []
  walk(tool.inputs ?? [], step.tool_inputs, '', step.input_connections ?? {}, found)
  return found
}
