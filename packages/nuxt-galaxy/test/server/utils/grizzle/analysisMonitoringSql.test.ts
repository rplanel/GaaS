import { drizzle } from 'drizzle-orm/postgres-js'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'
import { Drizzle } from '../../../../src/runtime/server/utils/drizzle'
import {
  selectCounts,
  selectTrendBuckets,
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
const driverless = Layer.succeed(Drizzle, drizzle.mock() as unknown as Parameters<typeof Layer.succeed<typeof Drizzle>>[1])

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
