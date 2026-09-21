import type { Context } from 'effect'
import { drizzle } from 'drizzle-orm/postgres-js'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'
import { Drizzle } from '../../../../src/runtime/server/utils/drizzle'
import {
  selectCounts,
  selectTrendBuckets,
  selectTrendRange,
  selectWorkflowUsage,
} from '../../../../src/runtime/server/utils/grizzle/analysisMonitoring'

/**
 * The SQL these queries actually emit, checked without a database.
 *
 * The mock Drizzle used by the rest of the server tests is a chainable stub
 * that returns canned rows, so it never generates SQL and cannot see a query
 * Postgres would reject. `drizzle.mock()` is the real query builder with no
 * driver behind it: SQL is generated, nothing is executed, and the suite stays
 * DB-free.
 */
const driverless = Layer.succeed(Drizzle, drizzle.mock() as unknown as Context.Tag.Service<typeof Drizzle>)

const OWNER = '00000000-0000-0000-0000-0000000000aa'

function emitted(query: Effect.Effect<{ toSQL: () => { sql: string, params: unknown[] } }, never, Drizzle>) {
  return Effect.runSync(query.pipe(Effect.provide(driverless))).toSQL()
}

/** Every count in a select list, as written. */
function countExpressions(sql: string): string[] {
  return sql.match(/count\(\*\)(?: filter \(where [^)]*\))?(?:::\w+)?/g) ?? []
}

describe('trend bucket SQL', () => {
  it('states the bucket unit as a literal, so GROUP BY matches the select list', () => {
    const { sql, params } = emitted(selectTrendBuckets(OWNER, 'day'))

    // Postgres matches GROUP BY against the select list by expression. A bound
    // unit is emitted as a different placeholder in each position ($1 and $3),
    // which makes the two expressions unequal and started_at "ungrouped".
    expect(sql).toContain('date_trunc(\'day\'')
    expect(sql.slice(sql.indexOf('group by'))).not.toMatch(/\$\d/)
    expect(params).toEqual([OWNER])
  })

  it('formats the bucket to canonical text, so no driver has to guess a zone', () => {
    // date_trunc returns `timestamp without time zone`, which postgres.js reads
    // in the machine's local zone; formatting in SQL is what keeps a bucket
    // meaning the same day everywhere.
    expect(emitted(selectTrendBuckets(OWNER, 'day')).sql).toContain('to_char(date_trunc(\'day\'')
    expect(emitted(selectTrendBuckets(OWNER, 'day')).sql).toContain('\'YYYY-MM-DD\')')
  })

  it('carries the unit of whichever granularity it is asked for', () => {
    expect(emitted(selectTrendBuckets(OWNER, 'week')).sql).toContain('date_trunc(\'week\'')
    expect(emitted(selectTrendBuckets(OWNER, 'month')).sql).toContain('date_trunc(\'month\'')
  })

  it('binds nothing at all when no owner narrows it', () => {
    expect(emitted(selectTrendBuckets(undefined, 'day')).params).toEqual([])
  })

  it('counts as integers', () => {
    const counts = countExpressions(emitted(selectTrendBuckets(OWNER, 'day')).sql)

    expect(counts.length).toBeGreaterThan(0)
    expect(counts.every(count => count.endsWith('::int'))).toBe(true)
  })
})

describe('counts and per-workflow SQL', () => {
  // postgres.js hands back a bigint count as a string, and "3" + "0" is "30",
  // so an uncast count turns every success rate into nonsense.
  it('counts as integers', () => {
    for (const query of [selectCounts(OWNER), selectWorkflowUsage(OWNER)]) {
      const counts = countExpressions(emitted(query).sql)

      expect(counts.length).toBeGreaterThan(0)
      expect(counts.every(count => count.endsWith('::int'))).toBe(true)
    }
  })
})

/** A month, as the endpoint will hand it down: from inclusive, to exclusive. */
const FROM = new Date('2026-08-01T00:00:00.000Z')
const TO = new Date('2026-09-01T00:00:00.000Z')
// a timestamptz column takes its bound as an ISO string, not as the Date given
const FROM_PARAM = FROM.toISOString()
const TO_PARAM = TO.toISOString()

describe('usage filters', () => {
  it('narrows nothing when no range is asked for', () => {
    for (const query of [selectCounts(OWNER), selectWorkflowUsage(OWNER), selectTrendRange(OWNER)]) {
      const { sql, params } = emitted(query)

      // the trend range names started_at in min()/max(), so it is a bound that
      // must be absent here, not the column
      expect(sql).not.toMatch(/"started_at" (?:>=|<) /)
      expect(params).toEqual([OWNER])
    }
  })

  it('narrows every dimension by the range it is given', () => {
    for (const query of [
      selectCounts(OWNER, { from: FROM, to: TO }),
      selectWorkflowUsage(OWNER, { from: FROM, to: TO }),
      selectTrendBuckets(OWNER, 'day', { from: FROM, to: TO }),
      selectTrendRange(OWNER, { from: FROM, to: TO }),
    ]) {
      const { sql, params } = emitted(query)

      // the trend dimensions name started_at in their own expressions, so the
      // bounds are what is asserted, not the mere mention of the column
      expect(sql).toMatch(/"started_at" >= \$\d/)
      expect(sql).toMatch(/"started_at" < \$\d/)
      expect(params).toEqual([OWNER, FROM_PARAM, TO_PARAM])
    }
  })

  it('narrows by a range with no owner, for the admin endpoint', () => {
    const { sql, params } = emitted(selectCounts(undefined, { from: FROM, to: TO }))

    expect(sql).toMatch(/"started_at" >= \$\d/)
    expect(params).toEqual([FROM_PARAM, TO_PARAM])
  })

  it('narrows the admin variant of every dimension, which binds no owner', () => {
    for (const query of [
      selectWorkflowUsage(undefined, { from: FROM, to: TO }),
      selectTrendBuckets(undefined, 'day', { from: FROM, to: TO }),
      selectTrendRange(undefined, { from: FROM, to: TO }),
    ]) {
      const { sql, params } = emitted(query)

      expect(sql).toMatch(/"started_at" >= \$\d/)
      expect(sql).toMatch(/"started_at" < \$\d/)
      expect(params).toEqual([FROM_PARAM, TO_PARAM])
    }
  })

  it('takes one bound without the other', () => {
    expect(emitted(selectCounts(OWNER, { from: FROM })).params).toEqual([OWNER, FROM_PARAM])
    expect(emitted(selectCounts(OWNER, { to: TO })).params).toEqual([OWNER, TO_PARAM])
  })
})

describe('workflow selection SQL', () => {
  /** The dimensions a selection narrows: counts, and both halves of the trend. */
  const narrowed = (selection: number | 'unknown') => [
    selectCounts(OWNER, { workflowSelection: selection }),
    selectTrendBuckets(OWNER, 'day', { workflowSelection: selection }),
    selectTrendRange(OWNER, { workflowSelection: selection }),
  ]

  it('narrows counts and both halves of the trend to one identifier', () => {
    for (const query of narrowed(3)) {
      const { sql, params } = emitted(query)

      expect(sql).toMatch(/"workflow_id" = \$\d/)
      expect(params).toEqual([OWNER, 3])
    }
  })

  it('narrows the trend span too, so an all-time trend spans that workflow and not the deployment', () => {
    // the span query decides how far the axis reaches when no range is asked
    // for; unnarrowed it would draw one bar in an axis spanning every analysis
    expect(emitted(selectTrendRange(OWNER, { workflowSelection: 3 })).sql).toMatch(/"workflow_id" = \$\d/)
  })

  it('selects the Unknown workflow as a workflow that carried no name, not as a nameless row', () => {
    for (const query of narrowed('unknown')) {
      const { sql } = emitted(query)

      // a workflow deleted halfway through its life keeps its name and its
      // nameless rows sit inside its named row, so a bare `workflow_name is
      // null` would select rows that appear under a named workflow
      expect(sql).toContain('not exists')
      expect(sql).toContain('"workflow_name" is not null')
      expect(sql).not.toMatch(/"analysis_monitoring"\."workflow_name" is null/)
    }
  })

  it('correlates the Unknown subquery on the workflow, so it asks about that workflow alone', () => {
    const { sql } = emitted(selectCounts(OWNER, { workflowSelection: 'unknown' }))

    expect(sql).toMatch(/"named"\."workflow_id" = "galaxy"\."analysis_monitoring"\."workflow_id"/)
  })

  it('judges namelessness over the same owner and range the table itself shows', () => {
    const { sql, params } = emitted(selectCounts(OWNER, { from: FROM, to: TO, workflowSelection: 'unknown' }))

    // otherwise `unknown` selects something other than the Unknown row on
    // screen, and the picker stops agreeing with what it picked
    const subquery = sql.slice(sql.indexOf('not exists'))
    expect(subquery).toMatch(/"named"\."owner_id" = \$\d/)
    expect(subquery).toMatch(/"named"\."started_at" >= \$\d/)
    expect(subquery).toMatch(/"named"\."started_at" < \$\d/)
    // owner and range bound once for the outer query and once for the subquery
    expect(params).toEqual([OWNER, FROM_PARAM, TO_PARAM, OWNER, FROM_PARAM, TO_PARAM])
  })

  it('binds no owner in the Unknown subquery for the admin endpoint', () => {
    const { params } = emitted(selectCounts(undefined, { from: FROM, to: TO, workflowSelection: 'unknown' }))

    expect(params).toEqual([FROM_PARAM, TO_PARAM, FROM_PARAM, TO_PARAM])
  })
})

describe('per-workflow usage ignores the workflow selection', () => {
  // The invariant this whole dimension rests on: the table is the list a
  // reader picks from, so it must go on showing every workflow in range. It is
  // a discipline rather than a type, because a narrow parameter type does not
  // survive TypeScript's structural typing -- the wider object still carries
  // the field at runtime. This test is what stands in for the compiler.
  it.each([
    ['an identifier', 3 as const],
    ['the Unknown workflow', 'unknown' as const],
  ])('emits no workflow predicate when %s is selected', (_label, selection) => {
    const { sql, params } = emitted(selectWorkflowUsage(OWNER, { from: FROM, to: TO, workflowSelection: selection }))

    // grouping by workflow_id is this dimension's own doing, so what must be
    // absent is a comparison against it, not the column
    expect(sql).not.toMatch(/"workflow_id" = \$\d/)
    expect(sql).not.toContain('not exists')
    // and the range it does honour is still there, bound exactly once
    expect(params).toEqual([OWNER, FROM_PARAM, TO_PARAM])
  })
})
