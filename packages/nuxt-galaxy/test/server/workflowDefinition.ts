import type { GalaxyWorkflowExport, WorkflowStepExport } from 'blendtype'

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
    input_connections: {},
    inputs: [{ description: '', name: label ?? 'Input dataset' }],
    label,
    name: 'Input dataset',
    outputs: [],
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
 */
export function toolStep(
  id: number,
  toolId: string,
  toolVersion: string,
  overrides: Partial<WorkflowStepExport> = {},
): WorkflowStepExport {
  return {
    annotation: '',
    content_id: toolId,
    id,
    input_connections: {},
    inputs: [],
    label: null,
    name: toolId.split('/').at(-2) ?? toolId,
    outputs: [],
    tool_id: toolId,
    tool_state: '{}',
    tool_version: toolVersion,
    type: 'tool',
    uuid: `uuid-${id}`,
    workflow_outputs: [],
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
