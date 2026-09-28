/**
 * Steps in the shape the description endpoint answers with, for the suites
 * that read them (#89).
 *
 * Two ways in, and the choice between them is the point:
 *
 * - `describedRevision` and `describedSteps` take a **recorded** definition
 *   through the real normalisers, so a claim about a shape Galaxy emits — a
 *   fan-in, a subworkflow nested in a subworkflow — is measured against what
 *   the endpoint really serves rather than against what somebody thought of.
 * - `aStep` builds one by hand, for the claims that are about this
 *   application's own code and not about Galaxy.
 *
 * `describedStepsOf` and `describedInputsOf` come from `nuxt-galaxy`'s public
 * entry, through the `workspace:*` dependency this package declares. They
 * were reached by path into `runtime/server/` first, which is the route the
 * layer's own dependency rules forbid.
 */

import type { DescribedStep, DescribedWorkflowInput } from 'nuxt-galaxy'
import type { WorkflowFixture } from './characterisation/fixtures'
import { galaxyWorkflowExportSchema } from 'blendtype'
import { describedInputsOf, describedStepsOf } from 'nuxt-galaxy'
import { loadFixture } from './characterisation/fixtures'

/**
 * One recording's revision as the description endpoint answers it: the
 * stored definition's steps, normalised, and the inputs derived from those
 * steps.
 *
 * The pair rather than either half, because the pair is what the endpoint
 * builds — `workflowDescriptionEffect` calls `describedInputsOf` on the
 * steps `describedStepsOf` has just returned — and a caller handed only the
 * steps would derive the inputs itself, which is the second copy this module
 * exists to prevent.
 *
 * Takes the loaded fixture rather than its slug: a caller reaching for the
 * description usually holds one already, and `loadFixture` re-reads the
 * manifest, both payloads and every tool definition from disk on each call.
 */
export function describedRevision(fixture: WorkflowFixture): {
  steps: Record<string, DescribedStep>
  inputs: Record<string, DescribedWorkflowInput>
} {
  const steps = describedStepsOf(galaxyWorkflowExportSchema.loose().parse(fixture.exported))
  return { steps, inputs: describedInputsOf(steps) }
}

/** One recording's stored definition, normalised exactly as the endpoint normalises it. */
export function describedSteps(slug: string): Record<string, DescribedStep> {
  return describedRevision(loadFixture(slug)).steps
}

/** A tool step, fed by nothing and running one tool, unless `over` says otherwise. */
export function aStep(id: number, over: Partial<DescribedStep> = {}): DescribedStep {
  return {
    id,
    type: 'tool',
    label: null,
    uuid: `uuid-${id}`,
    annotation: null,
    tool_id: 'toolshed.g2.bx.psu.edu/repos/iuc/foo/foo/1.2.3',
    tool_version: '1.2.3',
    tool_inputs: {},
    input_connections: {},
    outputs: [],
    subworkflow: null,
    ...over,
  }
}
