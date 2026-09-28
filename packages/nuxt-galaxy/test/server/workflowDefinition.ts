import type { GalaxyWorkflowExport, WorkflowStepConnection, WorkflowStepExport, WorkflowSubworkflowExport } from 'blendtype'

/**
 * Builders for a stored `definition` — the `json` column publishing fills
 * with `bt.exportWorkflowEffect` (style `export`) after
 * `galaxyWorkflowExportSchema` has parsed it.
 *
 * Typed against `GalaxyWorkflowExport` on purpose: the endpoint's refusal in
 * #43 is read off this shape, so a change to the real type has to break these
 * fixtures rather than quietly leave the reconciliation reading a field that
 * is no longer there.
 *
 * Nothing here imports a value, so a test that mocks `blendtype` can use it
 * without the mock's exports getting in the way.
 */

/**
 * One incoming connection, as an export writes it: the upstream step's index
 * and the output of that step feeding this input (#82). Several of them may
 * feed one input, and then the value under that input name is an array.
 *
 * `output` is the name a data input's single output carries, which is what a
 * step declares nothing in `outputs` for.
 */
export function connection(fromStep: number, outputName = 'output'): WorkflowStepConnection {
  return { id: fromStep, output_name: outputName }
}

/** A step's index, which is both its key here and the key a datamap uses. */
export function dataInputStep(
  id: number,
  label: string | null,
  overrides: Partial<WorkflowStepExport> = {},
): WorkflowStepExport {
  return {
    annotation: '',
    content_id: null,
    id,
    // An input step is where the workflow starts, so it genuinely has none.
    input_connections: {},
    inputs: [{ description: '', name: label ?? 'Input dataset' }],
    label,
    name: 'Input dataset',
    outputs: [],
    position: { left: 0, top: id * 120 },
    tool_id: null,
    // A JSON *string* in the export format, which is where Galaxy's
    // `WorkflowStep.input_optional` reads its flag from.
    tool_state: '{"optional": false, "tag": null}',
    tool_version: null,
    type: 'data_input',
    uuid: `uuid-${id}`,
    workflow_outputs: [],
    ...overrides,
  }
}

/**
 * A tool step pinned to one tool at one version, as the export names them:
 * `tool_id` is the id Galaxy knows the tool by (a toolshed guid carries the
 * version inside it, a built-in id does not) and `tool_version` the version
 * the revision was saved with. Galaxy refuses to run a revision whose tools
 * are not installed at exactly these versions (#75).
 *
 * Fed by the step before it unless `overrides` says otherwise: a tool step
 * with no incoming connection is not something Galaxy exports, and a fixture
 * that said it did certified #82's stripping as correct.
 *
 * The input is named `input1`, as a real tool names it, and deliberately not
 * `input`: the broken schema modelled a single optional key literally called
 * `input`, so a default keyed that way would still have survived it and left
 * every suite built on this builder unable to tell fixed from broken.
 */
export function toolStep(
  id: number,
  toolId: string,
  toolVersion: string,
  overrides: Partial<WorkflowStepExport> = {},
): WorkflowStepExport {
  if (id < 1 && overrides.input_connections === undefined) {
    throw new Error('a tool step at index 0 has no step before it: pass its own input_connections')
  }
  return {
    annotation: '',
    content_id: toolId,
    id,
    input_connections: { input1: connection(id - 1) },
    inputs: [],
    label: null,
    name: toolId.split('/').at(-2) ?? toolId,
    outputs: [],
    position: { left: 240, top: id * 120 },
    tool_id: toolId,
    tool_state: '{}',
    tool_version: toolVersion,
    type: 'tool',
    uuid: `uuid-${id}`,
    workflow_outputs: [],
    ...overrides,
  }
}

/**
 * The workflow a subworkflow step embeds, as an export writes it.
 *
 * The same shape as a whole definition **without `version`**: Galaxy adds
 * that to a downloaded dict and not to a nested one, so a nested export is
 * not a revision anything can pin (#89). Measured on `subworkflow-nested`.
 */
export function nestedWorkflow(
  name: string,
  steps: Record<string, WorkflowStepExport>,
): WorkflowSubworkflowExport {
  // `uuid`, `annotation` and `tags` are on a real nested export and are not
  // here: the schema leaves them to its catchall and nothing reads them, so a
  // fixture carrying them would suggest they are depended on.
  return { name, steps }
}

/**
 * A step that runs a whole workflow of its own.
 *
 * Its shape is the reason `WorkflowStepExport` has optional keys at all:
 * Galaxy leaves `content_id`, `tool_state`, `tool_version` and `errors`
 * **out** of a subworkflow step — not `null`, absent — and writes `tool_id`
 * as `null`. This builder omits exactly those three, so a schema that made
 * any of them required again would fail to parse what it produces, as it did
 * before #89.
 *
 * `nestedSteps` may itself hold a subworkflow step: that is the recursion
 * `describedStepsOf` walks and the one a reader drills into.
 */
export function subworkflowStep(
  id: number,
  name: string,
  nestedSteps: Record<string, WorkflowStepExport>,
  overrides: Partial<WorkflowStepExport> = {},
): WorkflowStepExport {
  return {
    annotation: '',
    id,
    input_connections: { [name]: connection(id - 1) },
    inputs: [{ description: '', name }],
    label: name,
    // What Galaxy calls the step is the *subworkflow's* name, while `label`
    // is what the author called the node in the outer editor.
    name,
    // Empty even when a downstream step reads from this one: Galaxy names a
    // subworkflow's real outputs in `workflow_outputs` and writes `outputs`
    // as `[]`.
    outputs: [],
    position: { left: 480, top: id * 120 },
    tool_id: null,
    type: 'subworkflow',
    uuid: `uuid-${id}`,
    when: null,
    workflow_outputs: [],
    subworkflow: nestedWorkflow(name, nestedSteps),
    ...overrides,
  }
}

export function workflowDefinition(steps: Record<string, WorkflowStepExport>): GalaxyWorkflowExport {
  return {
    'a_galaxy_workflow': true,
    'format-version': '0.1',
    'name': 'Test Workflow',
    'annotation': '',
    'tags': ['name:test-workflow', 'version:1.0'],
    steps,
    'version': 1,
    'uuid': 'fa95ecd4-ed11-49e2-b3d6-8f178b807256',
  }
}
