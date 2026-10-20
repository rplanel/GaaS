/**
 * That the schema publishing stores a definition with accepts the definitions
 * Galaxy really exports (#82, #89).
 *
 * `exportWorkflowEffect` parses every export through
 * `galaxyWorkflowExportSchema` on the way into `galaxy.workflows.definition`,
 * so a shape the schema refuses is a workflow that **cannot be published at
 * all**, and a shape it silently strips is a row that describes a set of
 * steps with nothing joining them. #82 was the second kind; #89 found the
 * first.
 *
 * This is a characterisation suite, so it asserts against recorded payloads
 * and nothing hand-written: a hand-written fixture can only carry shapes
 * somebody thought of, and the whole point is the ones nobody did. A
 * subworkflow step omits `content_id`, `tool_state`, `tool_version` and
 * `errors` entirely and carries `tool_id: null` — none of which anyone here
 * had written down before the recording was taken.
 */

import { galaxyWorkflowExportSchema } from 'blendtype'
import { describe, expect, it } from 'vitest'
import { FIXTURES, loadFixture } from './fixtures'

/**
 * Parsed the way the application parses it: `exportWorkflowEffect` uses
 * `.passthrough()` and `workflows.vue` uses `.loose()`, which in zod 4 are
 * the same call under two names. Either way the looseness reaches the outer
 * object only, which is the trap #82 was.
 */
function parse(exported: unknown) {
  return galaxyWorkflowExportSchema.loose().safeParse(exported)
}

/** A step of a parsed definition, reached by its `order_index` key. */
function stepOf(parsed: ReturnType<typeof parse>, stepId: string) {
  if (!parsed.success) {
    throw new Error('the definition did not parse')
  }
  const step = parsed.data.steps[stepId]
  if (step === undefined) {
    throw new Error(`no step ${stepId}`)
  }
  return step
}

describe('every recorded definition parses as the schema that stores it', () => {
  for (const slug of Object.values(FIXTURES)) {
    it(`${slug} parses`, () => {
      const parsed = parse(loadFixture(slug).exported)
      // The issues are named rather than counted: a bare `toBe(true)` on a
      // refusal this wide told you only that something was wrong, and the
      // four issues per subworkflow step are what #89 had to read to know
      // which keys Galaxy leaves out.
      expect(parsed.success ? [] : parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.code}`)).toEqual([])
    })
  }
})

describe(`${FIXTURES.subworkflowNested} — a subworkflow step, and one nested inside it`, () => {
  const fixture = loadFixture(FIXTURES.subworkflowNested)

  it('is recorded from the version this refactor targets', () => {
    expect(fixture.manifest.instance).toBe('usegalaxy.eu')
    expect(fixture.manifest.galaxyVersion).toMatch(/^26\.1/)
  })

  it('carries two subworkflow steps among four other step types', () => {
    const types = Object.values(fixture.exported.steps as Record<string, { type: string }>)
      .reduce<Record<string, number>>((count, step) => {
        count[step.type] = (count[step.type] ?? 0) + 1
        return count
      }, {})
    expect(types).toEqual({
      data_collection_input: 3,
      data_input: 2,
      parameter_input: 3,
      subworkflow: 2,
      tool: 4,
    })
  })

  it('omits the three tool keys on a subworkflow step, and writes tool_id as null', () => {
    // Measured, not assumed, and the reason the schema had to change: all
    // three were required keys, so zod reported four issues per subworkflow
    // step — these three plus `type`, which the enum did not list.
    const raw = (fixture.exported.steps as Record<string, Record<string, unknown>>)['8']!
    expect(raw.type).toBe('subworkflow')
    expect('content_id' in raw).toBe(false)
    expect('tool_state' in raw).toBe(false)
    expect('tool_version' in raw).toBe(false)
    // Present but null, unlike the three above. The distinction matters: the
    // schema models it `nullable`, and had it been optional too the type
    // would promise less than Galaxy sends.
    expect('tool_id' in raw).toBe(true)
    expect(raw.tool_id).toBeNull()
  })

  it('omits errors on a subworkflow step while keeping position, so the #82 fingerprint still holds', () => {
    // `predatesWidenedSchema` tells a stripped row apart by there being *no*
    // step with a key outside the fourteen the old schema kept, resting on
    // Galaxy writing `errors` and `position` on every step. A subworkflow
    // step is the one exception to `errors` — so this pins that `position`
    // and `when` are still there to carry the fingerprint on its own.
    const raw = (fixture.exported.steps as Record<string, Record<string, unknown>>)['8']!
    expect('errors' in raw).toBe(false)
    expect('position' in raw).toBe(true)
    expect('when' in raw).toBe(true)
  })

  it('keeps the nested definition, with its own steps and their connections', () => {
    // #82 one level down. The nested export is the only description of the
    // subworkflow there is — it carries a `uuid` and a `name` but no stored
    // workflow id — so a schema that stripped its steps would leave a node
    // with nothing to draw when a reader opens it.
    const step = stepOf(parse(fixture.exported), '8')
    expect(step.subworkflow?.name).toBe('scRNA-seq_preprocessing_10X_v3_Bundle')
    // The nested export's `uuid` is kept by the schema's catchall rather than
    // modelled: nothing reads it, and a nested export Galaxy wrote without
    // one must not make the whole workflow unpublishable. Asserted off the
    // recording, since the type deliberately does not promise it.
    const rawNested = (fixture.exported.steps as Record<string, { subworkflow: Record<string, unknown> }>)['8']!.subworkflow
    expect(rawNested.uuid).toEqual(expect.any(String))
    expect(Object.keys(step.subworkflow?.steps ?? {})).toHaveLength(9)

    const nestedConnections = Object.values(step.subworkflow?.steps ?? {})
      .flatMap(nested => Object.keys(nested.input_connections ?? {}))
    expect(nestedConnections.length).toBeGreaterThan(0)
  })

  it('keeps a subworkflow nested inside a subworkflow, two levels down', () => {
    // The recursion the drill-down navigates, and the reason this recording
    // is two levels deep rather than one: a normaliser that read the first
    // level and stopped would pass against a depth-1 fixture.
    const step = stepOf(parse(fixture.exported), '8')
    const deeper = Object.entries(step.subworkflow?.steps ?? {})
      .filter(([, nested]) => nested.type === 'subworkflow')
    expect(deeper.map(([stepId]) => stepId)).toEqual(['8'])
    expect(Object.keys(deeper[0]![1].subworkflow?.steps ?? {})).toHaveLength(12)
  })

  it('has no version on the nested export, so it is not a revision anything pins', () => {
    // Galaxy adds `version` to a *downloaded* dict, not to a nested one, so
    // `WorkflowSubworkflowExport` cannot be `GalaxyWorkflowExport`. Only the
    // outer workflow has an index an invocation can run (#48).
    const raw = (fixture.exported.steps as Record<string, { subworkflow: Record<string, unknown> }>)['8']!
    expect('version' in raw.subworkflow).toBe(false)
    expect(fixture.exported.version).toBe(fixture.manifest.revision)
  })
})
