import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../src/runtime/types/database'
import { describe, expect, it, vi } from 'vitest'
import {
  analysisByIdForResultsViewQuery,
  SUPABASE_ANALYSES_QUERY_KEYS,
  supabaseAnalysisByIdForResultsViewQuery,
} from '../../../src/runtime/app/queries/supabase/analyses'

/**
 * A Supabase client that records one `.select().eq().limit().single()` chain
 * and answers it with `data`. The shared `createMockSupabase` resolves at
 * `eq`, which this query does not stop at, so the chain is built here.
 */
function createChainMock(data: unknown) {
  const chain = {
    schema: vi.fn(),
    from: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    limit: vi.fn(),
    single: vi.fn().mockResolvedValue({ data, error: null }),
  }
  for (const method of ['schema', 'from', 'select', 'eq', 'limit'] as const) {
    chain[method].mockReturnValue(chain)
  }
  return { chain, supabase: chain as unknown as SupabaseClient<Database> }
}

const dataset = { id: 3, dataset_name: 'genome.fasta' }
const tag = { id: 9, label: 'genome' }

/** The row as PostgREST returns it: input tags hang off the dataset, output tags off the output. */
const analysisRow = {
  id: 7,
  name: 'run',
  workflows: { id: 1, name: 'Satellite Finder', name_key: 'satelliteFinder', version_key: '0.11' },
  analysis_inputs: [
    { id: 11, analysis_id: 7, dataset_id: 3, state: 'ok', datasets: { ...dataset, tags: [tag] } },
  ],
  analysis_outputs: [
    { id: 21, analysis_id: 7, dataset_id: 4, state: 'ok', datasets: { id: 4, dataset_name: 'hits.tsv' }, tags: [] },
  ],
}

describe('analysis for a results view', () => {
  it('keys the query under the analysis, apart from the queries the panel shares', () => {
    expect(SUPABASE_ANALYSES_QUERY_KEYS.byIdForResultsView(7)).toEqual(['supabase', 'analyses', 7, 'results-view'])
    expect(SUPABASE_ANALYSES_QUERY_KEYS.byIdForResultsView(7)).not.toEqual(
      SUPABASE_ANALYSES_QUERY_KEYS.byIdWithOutputsAndWorkflows(7, true, true),
    )
  })

  it('returns query options keyed on the analysis id', () => {
    const { supabase } = createChainMock(analysisRow)

    const options = analysisByIdForResultsViewQuery({ id: 7, supabase })

    expect(options.key).toEqual(['supabase', 'analyses', 7, 'results-view'])
    expect(typeof options.query).toBe('function')
  })

  it('selects the one analysis with its workflow, inputs and outputs, each with dataset and tags', async () => {
    const { chain, supabase } = createChainMock(analysisRow)

    await supabaseAnalysisByIdForResultsViewQuery(supabase, 7)

    expect(chain.schema).toHaveBeenCalledWith('galaxy')
    expect(chain.from).toHaveBeenCalledWith('analyses')
    const select = chain.select.mock.calls[0]![0] as string
    expect(select).toContain('workflows(*)')
    expect(select).toContain('analysis_inputs(')
    expect(select).toContain('analysis_outputs(')
    expect(select).toContain('datasets(*')
    expect(select).toContain('tags(*)')
    expect(chain.eq).toHaveBeenCalledWith('id', 7)
    expect(chain.limit).toHaveBeenCalledWith(1)
    expect(chain.single).toHaveBeenCalled()
  })

  it('lifts an input\'s tags next to its dataset, so inputs and outputs share one shape', async () => {
    const { supabase } = createChainMock(analysisRow)

    const analysis = await supabaseAnalysisByIdForResultsViewQuery(supabase, 7)

    expect(analysis.analysis_inputs).toEqual([
      { id: 11, analysis_id: 7, dataset_id: 3, state: 'ok', datasets: dataset, tags: [tag] },
    ])
    expect(analysis.analysis_outputs).toEqual(analysisRow.analysis_outputs)
    expect(analysis.workflows).toEqual(analysisRow.workflows)
  })

  it('fails rather than answering nothing when the query errors', async () => {
    const { chain, supabase } = createChainMock(null)
    chain.single.mockResolvedValue({ data: null, error: { message: 'row not found' } })

    await expect(supabaseAnalysisByIdForResultsViewQuery(supabase, 404)).rejects.toThrow('row not found')
  })

  // #71, ADR 0004. A retired version's past analyses keep their results
  // views: the analysis is narrowed on its id and nothing else, so the
  // version it embeds comes back whether or not it is still active, and the
  // name and the label the view is matched by come with it.
  it('opens an analysis of a retired version too: it narrows on the analysis alone, never on the version being active', async () => {
    const retired = { ...analysisRow, workflows: { ...analysisRow.workflows, active: false } }
    const { chain, supabase } = createChainMock(retired)

    const analysis = await supabaseAnalysisByIdForResultsViewQuery(supabase, 7)

    expect(chain.eq.mock.calls).toEqual([['id', 7]])
    expect(analysis.workflows).toEqual(retired.workflows)
  })
})
