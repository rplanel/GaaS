import type { RequestFetch } from '../../src/runtime/app/queries/utils'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { globalUsageStatisticsQuery, ownUsageStatisticsQuery } from '../../src/runtime/app/queries/db/usageStatistics'
import { versionStateQuery } from '../../src/runtime/app/queries/db/versionState'
import { galaxyHealthQuery } from '../../src/runtime/app/queries/galaxy/health'
import { galaxyInstanceQuery } from '../../src/runtime/app/queries/galaxy/instance'
import {
  galaxyRevisionToolsQuery,
  galaxyWorkflowDescriptionQuery,
  galaxyWorkflowRevisionsQuery,
  galaxyWorkflowsListQuery,
} from '../../src/runtime/app/queries/galaxy/workflows'

/** What Pinia Colada hands a query when it runs it; the entry plays no part in these queries. */
type QueryContext = Parameters<ReturnType<typeof galaxyWorkflowDescriptionQuery>['query']>[0]
const context = { signal: new AbortController().signal } as unknown as QueryContext

/** A request fetch that records what it was asked and answers `answer`. */
function recordingFetch(answer: unknown) {
  const calls = vi.fn(async (..._args: unknown[]) => answer)
  return { calls, requestFetch: calls as unknown as RequestFetch }
}

interface Case {
  readonly name: string
  readonly options: (requestFetch: RequestFetch) => { query: (context: QueryContext) => unknown }
  /** What the request fetch is called with, written out rather than derived. */
  readonly asked: readonly unknown[]
}

const cases: readonly Case[] = [
  {
    name: 'the stored workflows Galaxy lists',
    options: requestFetch => galaxyWorkflowsListQuery({ requestFetch }),
    asked: ['/api/galaxy/workflows'],
  },
  {
    name: 'the revisions of a stored workflow',
    options: requestFetch => galaxyWorkflowRevisionsQuery({ workflowId: '0bd41bf44b0f6f7d', requestFetch }),
    asked: ['/api/galaxy/workflows/0bd41bf44b0f6f7d/versions'],
  },
  {
    name: 'the tool check of a revision',
    options: requestFetch => galaxyRevisionToolsQuery({ workflowId: '0bd41bf44b0f6f7d', revision: 1, requestFetch }),
    asked: ['/api/galaxy/workflows/0bd41bf44b0f6f7d/revisions/1/tools'],
  },
  {
    name: 'a revision\'s description',
    options: requestFetch => galaxyWorkflowDescriptionQuery({ workflowId: '0bd41bf44b0f6f7d', revision: 1, requestFetch }),
    asked: ['/api/galaxy/workflows/0bd41bf44b0f6f7d/revisions/1/description'],
  },
  {
    name: 'Galaxy\'s health',
    options: requestFetch => galaxyHealthQuery({ requestFetch }),
    asked: ['/api/galaxy/health'],
  },
  {
    name: 'the Galaxy instance and its release',
    options: requestFetch => galaxyInstanceQuery({ requestFetch }),
    asked: ['/api/galaxy/instance'],
  },
  {
    name: 'the reader\'s own usage',
    options: requestFetch => ownUsageStatisticsQuery({ granularity: 'month', requestFetch }),
    asked: ['/api/db/analyses/monitoring', { query: { granularity: 'month' } }],
  },
  {
    name: 'every user\'s usage',
    options: requestFetch => globalUsageStatisticsQuery({ granularity: 'month', requestFetch }),
    asked: ['/api/db/analyses/monitoring/admin', { query: { granularity: 'month' } }],
  },
  {
    name: 'a version\'s state',
    options: requestFetch => versionStateQuery({ id: 7, requestFetch }),
    asked: ['/api/db/workflows/7/state'],
  },
]

// #139. During server-side rendering the global `$fetch` forwards neither
// headers nor cookies, so a query calling it reaches the server without the
// reader's session, and Pinia Colada rethrows the 401 into Nuxt's error page.
// `useRequestFetch()` forwards them; each query is handed it, the way the
// Supabase queries are handed `supabase`, and must not reach past it.
describe('a query calling this application\'s server', () => {
  it.each(cases.map(each => [each.name, each] as const))('reads %s through the fetch it is handed', async (_name, { options, asked }) => {
    const answer = { answered: true }
    const { calls, requestFetch } = recordingFetch(answer)

    await expect(options(requestFetch).query(context)).resolves.toBe(answer)
    expect(calls).toHaveBeenCalledExactlyOnceWith(...asked)
  })
})

const queriesDir = join(dirname(fileURLToPath(import.meta.url)), '../../src/runtime/app/queries')

/** A query module's source with its comments taken out, since several explain `$fetch` by name. */
function codeOf(file: string) {
  return readFileSync(join(queriesDir, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

// The table above covers the queries there are; this is for the next one,
// which would otherwise be written the way these all were.
describe('the query modules', () => {
  const files = readdirSync(queriesDir, { recursive: true, encoding: 'utf8' }).filter(file => file.endsWith('.ts'))

  it('are all read', () => {
    expect(files).toContain(join('galaxy', 'workflows.ts'))
  })

  it.each(files)('%s never calls the global $fetch', (file) => {
    expect(codeOf(file)).not.toMatch(/\$fetch\b/)
  })
})
