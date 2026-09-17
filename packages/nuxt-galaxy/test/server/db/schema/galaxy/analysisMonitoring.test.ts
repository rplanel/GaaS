import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PgPolicy } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { analysisMonitoring } from '../../../../../src/runtime/server/db/schema/galaxy/analysisMonitoring'

function sqlToString(sql: any): string {
  if (!sql) {
    return ''
  }
  if (typeof sql.toQuery === 'function') {
    return sql.toQuery({
      escapeName: name => `"${name}"`,
      escapeParam: num => `$${num}`,
      escapeString: str => `'${str}'`,
    }).sql
  }
  return String(sql)
}

describe('analysisMonitoring RLS policies', () => {
  const policies = (analysisMonitoring as any)[Symbol.for('drizzle:ExtraConfigBuilder')]?.(analysisMonitoring)
    .filter((item: any) => item instanceof PgPolicy)

  it('should define an admin SELECT policy that relies solely on is_admin()', () => {
    const adminPolicy = policies.find(
      (policy: PgPolicy) => policy.name === 'Admin can view all monitoring rows',
    )

    expect(adminPolicy).toBeDefined()
    expect(adminPolicy!.for).toBe('select')
    const usingSql = sqlToString(adminPolicy!.using)
    expect(usingSql).toBe(
      '(SELECT galaxy_rbac.is_admin()) = TRUE',
    )
    expect(usingSql).not.toContain(' OR ')
    expect(usingSql).not.toContain('monitoring.select')
  })

  it('should keep the owner-scoped SELECT policy unchanged', () => {
    const ownerPolicy = policies.find(
      (policy: PgPolicy) => policy.name === 'Authenticated users can view their own monitoring rows',
    )

    expect(ownerPolicy).toBeDefined()
    expect(ownerPolicy!.for).toBe('select')
    const usingSql = sqlToString(ownerPolicy!.using)
    expect(usingSql).toBe(
      '\"galaxy\".\"analysis_monitoring\".\"owner_id\" = (select auth.uid())',
    )
  })
})

describe('analysisMonitoring migrations', () => {
  const migrationsDir = join(process.cwd(), 'src/runtime/server/db/migrations')

  it('should include a migration that creates galaxy_rbac.is_admin() with the expected body and grants', () => {
    const entries = readdirSync(migrationsDir, { withFileTypes: true })
    const migrationFiles = entries
      .filter(entry => entry.isDirectory())
      .map(entry => join(migrationsDir, entry.name, 'migration.sql'))

    const found = migrationFiles.some((file) => {
      const content = readFileSync(file, 'utf8')

      const hasFunction = /create\s+or\s+replace\s+function\s+galaxy_rbac\.is_admin\s*\(\s*\)/i.test(content)
      const hasSecurityDefiner = /security\s+definer/i.test(content)
      const hasSearchPath = /set\s+search_path\s*=\s*''/i.test(content)
      const hasUserRolesJoin = /galaxy_rbac\.user_roles\s+ur\s+inner\s+join\s+galaxy_rbac\.roles\s+r\s+on\s+ur\.role_id\s*=\s*r\.id/i.test(content)
      const hasAuthUid = /ur\.user_id\s*=\s*auth\.uid\(\)/i.test(content)
      const hasAdminRole = /r\.name\s*=\s*'admin'/i.test(content)
      const revokesPublic = /revoke\s+execute\s+on\s+function\s+galaxy_rbac\.is_admin\s*\(\s*\)\s+from\s+public/i.test(content)
      const grantsAuthenticated = /grant\s+execute\s+on\s+function\s+galaxy_rbac\.is_admin\s*\(\s*\)\s+to\s+authenticated/i.test(content)

      return (
        hasFunction
        && hasSecurityDefiner
        && hasSearchPath
        && hasUserRolesJoin
        && hasAuthUid
        && hasAdminRole
        && revokesPublic
        && grantsAuthenticated
      )
    })

    expect(found).toBe(true)
  })
})

describe('analysisMonitoring survival columns', () => {
  const migrationsDir = join(process.cwd(), 'src/runtime/server/db/migrations')

  function migrationFiles(): string[] {
    return readdirSync(migrationsDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => join(migrationsDir, entry.name, 'migration.sql'))
  }

  it('should ADD COLUMN all three nullable snapshot columns and the two composite indexes', () => {
    const found = migrationFiles().some((file) => {
      const content = readFileSync(file, 'utf8')

      const addWorkflowName = /alter\s+table\s+"galaxy"\."analysis_monitoring"\s+add\s+column\s+"workflow_name"\s+varchar\(256\)/i.test(content)
      const addGalaxyWorkflowId = /alter\s+table\s+"galaxy"\."analysis_monitoring"\s+add\s+column\s+"galaxy_workflow_id"\s+varchar\(256\)/i.test(content)
      const addWorkflowVersion = /alter\s+table\s+"galaxy"\."analysis_monitoring"\s+add\s+column\s+"workflow_version"\s+varchar\(255\)/i.test(content)
      const indexOwnerWorkflow = /create\s+index\s+"idx_analysis_monitoring_owner_workflow"\s+on\s+"galaxy"\."analysis_monitoring"\s+\("owner_id","workflow_id"\)/i.test(content)
      const indexOwnerStartedAt = /create\s+index\s+"idx_analysis_monitoring_owner_started_at"\s+on\s+"galaxy"\."analysis_monitoring"\s+\("owner_id","started_at"\)/i.test(content)

      return addWorkflowName && addGalaxyWorkflowId && addWorkflowVersion
        && indexOwnerWorkflow && indexOwnerStartedAt
    })

    expect(found).toBe(true)
  })

  it('should backfill via an UPDATE joining galaxy.workflows with known values only (idempotent, offline)', () => {
    const found = migrationFiles().some((file) => {
      const content = readFileSync(file, 'utf8')

      const updateAlias = /update\s+galaxy\.analysis_monitoring\s+am/i.test(content)
      const setWorkflowName = /workflow_name\s*=\s*coalesce\(am\.workflow_name,\s*w\.name\)/i.test(content)
      const setGalaxyWorkflowId = /galaxy_workflow_id\s*=\s*coalesce\(am\.galaxy_workflow_id,\s*w\.galaxy_id\)/i.test(content)
      const setWorkflowVersion = /workflow_version\s*=\s*coalesce\(am\.workflow_version,\s*w\.version_key\)/i.test(content)
      const fromWorkflows = /from\s+galaxy\.workflows\s+w/i.test(content)
      const joinCondition = /am\.workflow_id\s*=\s*w\.id/i.test(content)
      const idempotencyGuard = /is\s+null/i.test(content)
      const noApiOrInvocation = !/galaxy\.(?:api|invocation)/i.test(content)

      return updateAlias && setWorkflowName && setGalaxyWorkflowId && setWorkflowVersion
        && fromWorkflows && joinCondition && idempotencyGuard && noApiOrInvocation
    })

    expect(found).toBe(true)
  })

  it('should expose the three nullable snapshot fields on the Drizzle schema', () => {
    expect(analysisMonitoring.workflowName).toBeDefined()
    expect(analysisMonitoring.galaxyWorkflowId).toBeDefined()
    expect(analysisMonitoring.workflowVersion).toBeDefined()
    // D-05: all three are nullable — declared without .notNull()
    expect((analysisMonitoring.workflowVersion as any).notNull).toBeFalsy()
  })
})
