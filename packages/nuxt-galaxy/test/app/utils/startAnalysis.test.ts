import { describe, expect, it } from 'vitest'
import { startAnalysisRefused, startAnalysisSchema } from '../../../src/runtime/app/utils/startAnalysis'

/**
 * #163. What a request to start an analysis may carry, and what refuses one
 * before it is sent, as any UI starting an analysis takes them from here.
 * `@gaas/ui`'s invoke form reads both; its own test pins what a reader sees.
 */

/** Each issue a refused form carries, as the path a field is named by and its sentence. */
function issuesOf(form: unknown, inputs: string[] = []) {
  const parsed = startAnalysisSchema(inputs).safeParse(form)
  return parsed.success ? [] : parsed.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message }))
}

describe('startAnalysisSchema', () => {
  it('sends the name trimmed', () => {
    const parsed = startAnalysisSchema([]).parse({ analysisName: '  Integrons of E. coli  ', inputs: {} })

    expect(parsed.analysisName).toBe('Integrons of E. coli')
  })

  // The three ways a reader arrives at no name: never typing one, typing one
  // and clearing it, and typing only spaces. The server refuses all three
  // (#47); here they are refused with the one word the field shows.
  it.each([
    ['never typed', undefined],
    ['cleared', ''],
    ['only spaces', '   '],
  ])('refuses a name %s as required', (_, analysisName) => {
    expect(issuesOf({ analysisName, inputs: {} })).toEqual([{ path: 'analysisName', message: 'Required' }])
  })

  // The column is `varchar(256)`, and the rule measures what will be stored:
  // the trimmed name, so spaces around a name of 256 do not count against it.
  it('accepts a name of 256 characters, spaces around it trimmed, and refuses one of 257', () => {
    expect(issuesOf({ analysisName: ` ${'a'.repeat(256)} `, inputs: {} })).toEqual([])
    expect(issuesOf({ analysisName: 'a'.repeat(257), inputs: {} })).toEqual([
      { path: 'analysisName', message: 'Must be at most 256 characters' },
    ])
  })

  // A copied analysis can carry a selection for a step its workflow has
  // since dropped. What the form showed is what it asks for, so that one is
  // not sent.
  it('sends a datamap holding only the inputs the workflow declares', () => {
    const reads = { storage_object_id: 'object-1', dataset_name: 'reads.fasta' }
    const dropped = { storage_object_id: 'object-2', dataset_name: 'old.fasta' }

    const parsed = startAnalysisSchema(['0']).parse({ analysisName: 'Integrons', inputs: { 0: reads, 3: dropped } })

    expect(parsed.inputs).toEqual({ 0: reads })
  })

  // Named `inputs.<step>`, the path a field for that input is named by, so
  // the refusal renders beside the input it is about.
  it.each([
    ['never chosen', undefined],
    ['cleared', null],
  ])('refuses an input whose dataset was %s as required', (_, selection) => {
    expect(issuesOf({ analysisName: 'Integrons', inputs: { 2: selection } }, ['0', '2'])).toEqual([
      { path: 'inputs.0', message: 'Required' },
      { path: 'inputs.2', message: 'Required' },
    ])
  })
})

describe('startAnalysisRefused', () => {
  /** A workflow nothing stops: every tool installed, every input fed, its description read. */
  const runnable = {
    blockingTools: [],
    unconnectedInputsByStep: {},
    galaxyRelease: '26.1',
    descriptionFailed: false,
  }

  it('refuses nothing when nothing stops the workflow', () => {
    expect(startAnalysisRefused(runnable)).toBe(false)
  })

  // Galaxy will not run a revision whose tools it does not hold at the
  // versions the revision pins, so the start is refused before the datasets
  // are uploaded rather than by Galaxy after.
  it('refuses a workflow whose tool is not installed at the version it pins', () => {
    expect(startAnalysisRefused({
      ...runnable,
      blockingTools: [{ toolId: 'toolshed.g2.bx.psu.edu/repos/iuc/integron_finder/integron_finder', toolVersion: '2.0.5+galaxy0', reason: 'not_installed' }],
    })).toBe(true)
  })

  const required = { name: 'reference', label: 'Reference genome', optional: false }
  const optional = { name: 'covar_matrix', label: 'Covariance matrix', optional: true }

  // From 24.2 Galaxy refuses an invocation in which a step leaves a required
  // dataset input with nothing to supply it (#105).
  it('refuses a required dataset input nothing feeds on Galaxy 24.2', () => {
    expect(startAnalysisRefused({ ...runnable, unconnectedInputsByStep: { 3: [optional, required] }, galaxyRelease: '24.2' })).toBe(true)
  })

  // Galaxy runs these with the input empty, and a release that is not known
  // yet, or never will be, refuses nothing on its account.
  it.each([
    ['a required input on 24.1', [required], '24.1'],
    ['an optional input on 24.2', [optional], '24.2'],
    ['a required input while the release is unknown', [required], undefined],
  ])('lets %s through', (_, inputs, galaxyRelease) => {
    expect(startAnalysisRefused({ ...runnable, unconnectedInputsByStep: { 3: inputs }, galaxyRelease })).toBe(false)
  })

  // A UI that could not read the workflow knows neither its inputs nor its
  // tools, so what it would send is whatever the reader could see: nothing.
  it('refuses a workflow whose description could not be read', () => {
    expect(startAnalysisRefused({ ...runnable, descriptionFailed: true })).toBe(true)
  })
})
