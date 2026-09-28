/**
 * Steps in the shape the description endpoint answers with, for the suites
 * that read them (#89).
 *
 * Two ways in, and the choice between them is the point:
 *
 * - `describedSteps` takes a **recorded** definition through the real
 *   normaliser, so a claim about a shape Galaxy emits — a fan-in, a
 *   subworkflow nested in a subworkflow — is measured against what the
 *   endpoint really serves rather than against what somebody thought of.
 * - `aStep` builds one by hand, for the claims that are about this
 *   application's own code and not about Galaxy.
 *
 * `describedStepsOf` comes from `nuxt-galaxy`'s public entry, through the
 * `workspace:*` dependency this package declares. It was reached by path into
 * `runtime/server/` first, which is the route the layer's own dependency
 * rules forbid.
 */

import type { DescribedStep } from 'nuxt-galaxy'
import { galaxyWorkflowExportSchema } from 'blendtype'
import { describedStepsOf } from 'nuxt-galaxy'
import { loadFixture } from './characterisation/fixtures'

/** One recording's stored definition, normalised exactly as the endpoint normalises it. */
export function describedSteps(slug: string): Record<string, DescribedStep> {
  return describedStepsOf(galaxyWorkflowExportSchema.loose().parse(loadFixture(slug).exported))
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
