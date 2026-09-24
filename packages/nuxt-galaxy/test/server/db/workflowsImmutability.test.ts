import process from 'node:process'
import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'

/**
 * ADR 0004's immutability rule, proven against a live Postgres (#71).
 *
 * Every other server test mocks the database, so none of them can see what
 * the database itself refuses: the column-level grant that leaves `active`
 * the only column an update may touch, and the update policy that lets an
 * administrator flip it and nobody else. Both are SQL in a hand-written
 * migration with no drizzle declaration to read, so the only proof is to ask
 * Postgres. This file connects to the local Supabase (the module's default
 * URL, or `GALAXY_DRIZZLE_DATABASE_URL`), runs each case inside a transaction
 * it rolls back, and switches to the API roles with `SET LOCAL ROLE` and the
 * JWT claims `galaxy_rbac.authorize` reads.
 *
 * The GitLab pipeline has no Postgres service, so the whole file skips when
 * nothing answers at the URL; it runs wherever `pnpm supabase:start` has, and
 * a database behind on migrations fails it rather than skipping, since that
 * is a real signal.
 */

const DATABASE_URL = process.env.GALAXY_DRIZZLE_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const sql = postgres(DATABASE_URL, { max: 1, connect_timeout: 2, onnotice: () => {} })

async function reachable() {
  try {
    await sql`select 1`
    return true
  }
  catch {
    return false
  }
}

const live = await reachable()

afterAll(async () => {
  await sql.end({ timeout: 1 })
})

type Tx = postgres.TransactionSql

/** The one owner and administrator these cases act as, an auth user of their own. */
const OWNER = '00000000-0000-4000-8000-000000000071'

class RolledBack extends Error {}

/**
 * Runs `body` in a transaction that is always rolled back, so nothing these
 * cases insert survives them. The role and the claims set inside are
 * transaction-local too.
 */
async function withRollback(body: (tx: Tx) => Promise<void>) {
  await sql.begin(async (tx) => {
    await body(tx)
    throw new RolledBack()
  }).catch((error) => {
    if (!(error instanceof RolledBack))
      throw error
  })
}

/** Become an API role carrying these JWT claims, the way PostgREST does per request. */
async function actAs(tx: Tx, role: 'authenticated' | 'anon', claims: { sub: string, user_role?: 'admin' | 'user' }) {
  await tx`select set_config('request.jwt.claims', ${JSON.stringify({ ...claims, role })}, true)`
  await tx.unsafe(`set local role ${role}`)
}

/** Back to the connection's own role, which the grants do not bind. */
async function actAsPostgres(tx: Tx) {
  await tx.unsafe('reset role')
}

/**
 * One published version, with the Galaxy instance and service user it needs,
 * and the `workflows.update` permission the seed gives the admin role, so
 * the case holds whatever this database was seeded with. The name and the
 * label are ones no real version carries: the pair is unique application-wide.
 */
async function publishedVersion(tx: Tx) {
  await tx`insert into auth.users (id) values (${OWNER}) on conflict (id) do nothing`
  await tx`insert into galaxy_rbac.role_permissions (role_id, permission) select id, 'workflows.update' from galaxy_rbac.roles where name = 'admin' on conflict do nothing`
  const [instance] = await tx`insert into galaxy.instances (url, name) values ('https://galaxy.test/71', 'Test Galaxy') returning id`
  const [galaxyUser] = await tx`insert into galaxy."user" (email, instance_id) values ('service@galaxy.test', ${instance!.id}) returning id`
  const [version] = await tx`
    insert into galaxy.workflows (galaxy_id, name, revision, revision_uuid, version_key, name_key, user_id, definition, published_by)
    values ('wf-71', 'Retire Test Finder', 3, 'fa95ecd4-ed11-49e2-b3d6-8f178b807271', '0.71-test', 'retireTestFinder', ${galaxyUser!.id}, '{"a_galaxy_workflow": "true"}', ${OWNER})
    returning id`
  return { versionId: version!.id as number, galaxyUserId: galaxyUser!.id as number }
}

/** A past analysis of that version, with its history and its monitoring record. */
async function pastAnalysis(tx: Tx, versionId: number, galaxyUserId: number) {
  const [history] = await tx`insert into galaxy.histories (galaxy_id, name, state, user_id, owner_id) values ('hist-71', 'run', 'ok', ${galaxyUserId}, ${OWNER}) returning id`
  const [analysis] = await tx`
    insert into galaxy.analyses (name, state, parameters, owner_id, history_id, workflow_id, workflow_revision, galaxy_id, invocation)
    values ('run', 'scheduled', '{}', ${OWNER}, ${history!.id}, ${versionId}, 3, 'inv-71', '{}')
    returning id`
  await tx`
    insert into galaxy.analysis_monitoring (analysis_id, owner_id, workflow_id, name, galaxy_invocation_id, outcome, workflow_name, galaxy_workflow_id, workflow_version)
    values (${analysis!.id}, ${OWNER}, ${versionId}, 'run', 'inv-71', 'success', 'Retire Test Finder', 'wf-71', '0.71-test')`
  return analysis!.id as number
}

/** The SQLSTATE the statement failed with, or a failure saying it went through. */
async function refusal(tx: Tx, statement: (tx: Tx) => Promise<unknown>) {
  try {
    await tx.savepoint(statement)
  }
  catch (error) {
    return (error as { code?: string }).code
  }
  throw new Error('expected the statement to be refused')
}

describe.skipIf(!live)('a version row in Postgres', () => {
  it('has the update policy and the column grant the migration carries', async () => {
    const [policy] = await sql`select cmd from pg_policies where schemaname = 'galaxy' and tablename = 'workflows' and policyname = 'Admin can update workflows'`
    expect(policy).toEqual({ cmd: 'UPDATE' })

    const grants = await sql`
      select grantee, string_agg(column_name::text, ',' order by column_name) as columns
      from information_schema.column_privileges
      where table_schema = 'galaxy' and table_name = 'workflows' and privilege_type = 'UPDATE' and grantee in ('anon', 'authenticated', 'service_role')
      group by grantee order by grantee`
    expect(grants).toEqual([
      { grantee: 'authenticated', columns: 'active' },
      { grantee: 'service_role', columns: 'active' },
    ])
  })

  // An administrator may retire, and that is the only thing an administrator
  // may change: a label never moves, a revision never moves (ADR 0004). The
  // self-assignment needs the UPDATE privilege on the column and nothing
  // else, so it is the grant alone that answers.
  it.each([
    'version_key',
    'name_key',
    'revision',
    'revision_uuid',
    'definition',
    'galaxy_id',
    'name',
    'user_id',
    'published_at',
    'published_by',
  ])('refuses an administrator an update touching %s', async (column) => {
    await withRollback(async (tx) => {
      const { versionId } = await publishedVersion(tx)
      await actAs(tx, 'authenticated', { sub: OWNER, user_role: 'admin' })

      const code = await refusal(tx, tx => tx`update galaxy.workflows set ${tx(column)} = ${tx(column)} where id = ${versionId}`)

      expect(code).toBe('42501')
    })
  })

  it('lets an administrator retire a version and make it active again', async () => {
    await withRollback(async (tx) => {
      const { versionId } = await publishedVersion(tx)
      await actAs(tx, 'authenticated', { sub: OWNER, user_role: 'admin' })

      const retired = await tx`update galaxy.workflows set active = false where id = ${versionId} returning active`
      expect(retired).toEqual([{ active: false }])

      const active = await tx`update galaxy.workflows set active = true where id = ${versionId} returning active`
      expect(active).toEqual([{ active: true }])
    })
  })

  it('lets nobody but an administrator change active: a user\'s update touches no row', async () => {
    await withRollback(async (tx) => {
      const { versionId } = await publishedVersion(tx)
      // the policy hides the rows it refuses rather than raising, so the
      // update is not an error: it finds nothing to update
      await actAs(tx, 'authenticated', { sub: OWNER, user_role: 'user' })
      const touched = await tx`update galaxy.workflows set active = false where id = ${versionId} returning id`
      expect(touched).toEqual([])

      await actAsPostgres(tx)
      const [row] = await tx`select active from galaxy.workflows where id = ${versionId}`
      expect(row).toEqual({ active: true })
    })
  })

  it('refuses an anonymous caller any update at all', async () => {
    await withRollback(async (tx) => {
      const { versionId } = await publishedVersion(tx)
      await actAs(tx, 'anon', { sub: OWNER })

      const code = await refusal(tx, tx => tx`update galaxy.workflows set active = false where id = ${versionId}`)

      expect(code).toBe('42501')
    })
  })

  // Retired means no new analysis, nothing else: the past analyses keep
  // their pages, their results views and their usage statistics. Hiding
  // happens in the users' list query, never in a select policy, so the
  // analysis still resolves the version it ran, name and label included,
  // which is what the results view match is made from.
  it('keeps a retired version\'s past analysis readable by its owner, with the name and the label its results view is matched by', async () => {
    await withRollback(async (tx) => {
      const { versionId, galaxyUserId } = await publishedVersion(tx)
      const analysisId = await pastAnalysis(tx, versionId, galaxyUserId)
      await actAs(tx, 'authenticated', { sub: OWNER, user_role: 'admin' })
      await tx`update galaxy.workflows set active = false where id = ${versionId}`

      await actAs(tx, 'authenticated', { sub: OWNER, user_role: 'user' })
      const opened = await tx`
        select a.id, a.workflow_revision, w.name_key, w.version_key, w.active
        from galaxy.analyses a join galaxy.workflows w on w.id = a.workflow_id
        where a.id = ${analysisId}`

      expect(opened).toEqual([{ id: analysisId, workflow_revision: 3, name_key: 'retireTestFinder', version_key: '0.71-test', active: false }])
    })
  })

  it('keeps a retired version\'s past analysis in its owner\'s usage statistics', async () => {
    await withRollback(async (tx) => {
      const { versionId, galaxyUserId } = await publishedVersion(tx)
      await pastAnalysis(tx, versionId, galaxyUserId)
      await actAs(tx, 'authenticated', { sub: OWNER, user_role: 'admin' })
      await tx`update galaxy.workflows set active = false where id = ${versionId}`

      await actAs(tx, 'authenticated', { sub: OWNER, user_role: 'user' })
      const [usage] = await tx`
        select count(*)::int as started, count(*) filter (where outcome = 'success')::int as succeeded, max(workflow_version) as version
        from galaxy.analysis_monitoring where workflow_id = ${versionId}`

      expect(usage).toEqual({ started: 1, succeeded: 1, version: '0.71-test' })
    })
  })
})
