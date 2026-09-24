import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../src/runtime/types/database'
import { describe, expect, it, vi } from 'vitest'
import {
  adminWorkflowsListQuery,
  SUPABASE_WORKFLOWS_QUERY_KEYS,
  workflowsListQuery,
} from '../../../src/runtime/app/queries/supabase/workflows'

/**
 * A Supabase client that records one `.schema().from().select()[.eq()]`
 * chain and answers it with `data` wherever the chain is awaited.
 */
function createChainMock(data: unknown) {
  const chain = {
    schema: vi.fn(),
    from: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data, error: null })),
  }
  for (const method of ['schema', 'from', 'select', 'eq'] as const) {
    chain[method].mockReturnValue(chain)
  }
  return { chain, supabase: chain as unknown as SupabaseClient<Database> }
}

const active = { id: 1, name_key: 'satelliteFinder', version_key: '0.11', active: true }

/** What Pinia Colada hands a query when it runs it; the entry plays no part in these queries. */
type QueryContext = Parameters<ReturnType<typeof workflowsListQuery>['query']>[0]
const context = { signal: new AbortController().signal } as unknown as QueryContext

// #71, ADR 0004. Hiding a retired version happens in the users' list query
// and never in a select policy, because a past analysis still has to resolve
// its version. The admin page keeps seeing every version, so it reads its own
// query rather than the users' one.
describe('the users\' workflows list', () => {
  it('lists active versions only', async () => {
    const { chain, supabase } = createChainMock([active])

    const options = workflowsListQuery({ supabase })
    const rows = await options.query(context)

    expect(options.key).toEqual(SUPABASE_WORKFLOWS_QUERY_KEYS.list())
    expect(chain.schema).toHaveBeenCalledWith('galaxy')
    expect(chain.from).toHaveBeenCalledWith('workflows')
    expect(chain.eq).toHaveBeenCalledWith('active', true)
    expect(rows).toEqual([active])
  })
})

describe('the administrator\'s workflows list', () => {
  it('lists every version, retired ones included', async () => {
    const retired = { ...active, id: 2, version_key: '0.10', active: false }
    const { chain, supabase } = createChainMock([active, retired])

    const options = adminWorkflowsListQuery({ supabase })
    const rows = await options.query(context)

    expect(chain.schema).toHaveBeenCalledWith('galaxy')
    expect(chain.from).toHaveBeenCalledWith('workflows')
    expect(chain.eq).not.toHaveBeenCalled()
    expect(rows).toEqual([active, retired])
  })

  it('is keyed apart from the users\' list, so neither cache answers for the other', () => {
    const { supabase } = createChainMock([])

    expect(adminWorkflowsListQuery({ supabase }).key).toEqual(SUPABASE_WORKFLOWS_QUERY_KEYS.adminList())
    expect(SUPABASE_WORKFLOWS_QUERY_KEYS.adminList()).not.toEqual(SUPABASE_WORKFLOWS_QUERY_KEYS.list())
  })
})
