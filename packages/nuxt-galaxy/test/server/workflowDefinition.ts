import type { GalaxyWorkflowExport, WorkflowStepExport } from 'blendtype'

/**
 * Builders for a stored `definition` — the `json` column `insertWorkflow`
 * fills with `bt.exportWorkflowEffect` (style `export`) after
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

export function workflowDefinition(steps: Record<string, WorkflowStepExport>): GalaxyWorkflowExport {
  return {
    'a_galaxy_workflow': true,
    'format-version': '0.1',
    'name': 'Test Workflow',
    'annotation': '',
    'tags': ['name:test-workflow', 'version:1.0'],
    steps,
    'version': 1,
  }
}
