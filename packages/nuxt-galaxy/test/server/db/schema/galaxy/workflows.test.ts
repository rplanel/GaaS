import { PgPolicy } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { workflows } from '../../../../../src/runtime/server/db/schema/galaxy/workflows'

function sqlToString(sql: any): string {
  if (!sql) {
    return ''
  }
  if (typeof sql.toQuery === 'function') {
    return sql.toQuery({
      escapeName: (name: string) => `"${name}"`,
      escapeParam: (num: number) => `$${num}`,
      escapeString: (str: string) => `'${str}'`,
    }).sql
  }
  return String(sql)
}

// ADR 0004: a version's row is immutable but for `active`, and only an
// administrator flips it. The policy is declared here so the schema and the
// migration agree; the column-level grant that leaves `active` the only
// updatable column has no drizzle declaration and lives in the migration,
// proven against a live database in `test/server/db/workflowsImmutability`.
describe('workflows RLS policies', () => {
  const policies: PgPolicy[] = (workflows as any)[Symbol.for('drizzle:ExtraConfigBuilder')]?.(workflows)
    .filter((item: any) => item instanceof PgPolicy)

  it('lets every authenticated user read every version, retired ones included', () => {
    // hiding a retired version is the list query's job, never the select
    // policy's: a past analysis still has to resolve its version
    const select = policies.find(policy => policy.for === 'select')

    expect(select).toBeDefined()
    expect(sqlToString(select!.using)).toBe('true')
  })

  it('lets an administrator update a version, and nobody else', () => {
    const update = policies.find(policy => policy.for === 'update')

    expect(update).toBeDefined()
    expect(update!.name).toBe('Admin can update workflows')
    expect(update!.to).toMatchObject({ name: 'authenticated' })
    expect(sqlToString(update!.using)).toBe('(SELECT galaxy_rbac.authorize(\'workflows.update\')) = TRUE')
    expect(sqlToString(update!.withCheck)).toBe('(SELECT galaxy_rbac.authorize(\'workflows.update\')) = TRUE')
  })

  // #72. An administrator may delete a version no analysis references; the
  // policy says who, and the foreign key from `analyses` says which, so no
  // column grant is needed here.
  it('lets an administrator delete a version, and nobody else', () => {
    const remove = policies.find(policy => policy.for === 'delete')

    expect(remove).toBeDefined()
    expect(remove!.name).toBe('Admin can delete workflows')
    expect(remove!.to).toMatchObject({ name: 'authenticated' })
    expect(sqlToString(remove!.using)).toBe('(SELECT galaxy_rbac.authorize(\'workflows.delete\')) = TRUE')
  })
})
