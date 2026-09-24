import process from 'node:process'
import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'

/**
 * Deleting a version no analysis references, proven against a live Postgres
 * (#72, ADR 0004).
 *
 * Two rules live in the database and nowhere else: the delete policy that
 * lets an administrator delete a version and nobody else, and the foreign
 * key from `analyses` that refuses while an analysis references the row.
 * Every other server test mocks the database, so this file connects to the
 * local Supabase (the module's default URL, or `GALAXY_DRIZZLE_DATABASE_URL`),
 * runs each case inside a transaction it rolls back, and switches to the API
 * roles with `SET LOCAL ROLE` and the JWT claims `galaxy_rbac.authorize`
 * reads, the way `workflowsImmutability.test.ts` does for the update rule.
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
const OWNER = '00000000-0000-4000-8000-000000000072'

class RolledBack extends Error {}

/**
 * Runs `body` in a transaction that is always rolled back, so nothing these
 * cases insert or delete survives them.
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

/** Back to the connection's own role, which the policies do not bind. */
async function actAsPostgres(tx: Tx) {
  await tx.unsafe('reset role')
}

/**
 * One published version, with the Galaxy instance and service user it needs,
 * and the `workflows.delete` and `workflows.insert` permissions the seed
 * gives the admin role, so the case holds whatever this database was seeded
 * with. The name and the label are ones no real version carries.
 */
async function publishedVersion(tx: Tx) {
  await tx`insert into auth.users (id) values (${OWNER}) on conflict (id) do nothing`
  await tx`insert into galaxy_rbac.role_permissions (role_id, permission) select id, 'workflows.delete' from galaxy_rbac.roles where name = 'admin' on conflict do nothing`
  await tx`insert into galaxy_rbac.role_permissions (role_id, permission) select id, 'workflows.insert' from galaxy_rbac.roles where name = 'admin' on conflict do nothing`
  const [instance] = await tx`insert into galaxy.instances (url, name) values ('https://galaxy.test/72', 'Test Galaxy') returning id`
  const [galaxyUser] = await tx`insert into galaxy."user" (email, instance_id) values ('service@galaxy.test', ${instance!.id}) returning id`
  const [version] = await tx`
    insert into galaxy.workflows (galaxy_id, name, revision, revision_uuid, version_key, name_key, user_id, definition, published_by)
    values ('wf-72', 'Delete Test Finder', 3, 'fa95ecd4-ed11-49e2-b3d6-8f178b807272', '0.72-test', 'deleteTestFinder', ${galaxyUser!.id}, '{"a_galaxy_workflow": "true"}', ${OWNER})
    returning id`
  return { versionId: version!.id as number, galaxyUserId: galaxyUser!.id as number }
}

/** An analysis of that version, with its history. */
async function analysisOf(tx: Tx, versionId: number, galaxyUserId: number) {
  const [history] = await tx`insert into galaxy.histories (galaxy_id, name, state, user_id, owner_id) values ('hist-72', 'run', 'ok', ${galaxyUserId}, ${OWNER}) returning id`
  const [analysis] = await tx`
    insert into galaxy.analyses (name, state, parameters, owner_id, history_id, workflow_id, workflow_revision, galaxy_id, invocation)
    values ('run', 'scheduled', '{}', ${OWNER}, ${history!.id}, ${versionId}, 3, 'inv-72', '{}')
    returning id`
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

describe.skipIf(!live)('deleting a version row in Postgres', () => {
  it('has the delete policy the migration carries, and no ON DELETE on the analyses foreign key', async () => {
    const [policy] = await sql`select cmd from pg_policies where schemaname = 'galaxy' and tablename = 'workflows' and policyname = 'Admin can delete workflows'`
    expect(policy).toEqual({ cmd: 'DELETE' })

    // the rule that a referenced version stays: NO ACTION, which is what a
    // foreign key with no ON DELETE clause means
    const [analyses] = await sql`select confdeltype from pg_constraint where conname = 'analyses_workflow_id_workflows_id_fkey'`
    expect(analyses).toEqual({ confdeltype: 'a' })
    // the legacy tag association goes with its version instead
    const [tags] = await sql`select confdeltype from pg_constraint where conname = 'workflows_to_tags_workflow_id_workflows_id_fkey'`
    expect(tags).toEqual({ confdeltype: 'c' })
  })

  it('lets an administrator delete a version no analysis references, and the revision is publishable again under another label', async () => {
    await withRollback(async (tx) => {
      const { versionId, galaxyUserId } = await publishedVersion(tx)
      await actAs(tx, 'authenticated', { sub: OWNER, user_role: 'admin' })

      const deleted = await tx`delete from galaxy.workflows where id = ${versionId} returning id`
      expect(deleted).toEqual([{ id: versionId }])

      // the unique on (user_id, galaxy_id, revision) was what refused a second
      // label for revision 3; with the row gone, the same revision takes a new one
      const republished = await tx`
        insert into galaxy.workflows (galaxy_id, name, revision, revision_uuid, version_key, name_key, user_id, definition, published_by)
        values ('wf-72', 'Delete Test Finder', 3, 'fa95ecd4-ed11-49e2-b3d6-8f178b807272', '0.72-test-again', 'deleteTestFinder', ${galaxyUserId}, '{"a_galaxy_workflow": "true"}', ${OWNER})
        returning revision, version_key`
      expect(republished).toEqual([{ revision: 3, version_key: '0.72-test-again' }])
    })
  })

  it('refuses to delete a version an analysis references, and the row is unchanged', async () => {
    await withRollback(async (tx) => {
      const { versionId, galaxyUserId } = await publishedVersion(tx)
      await analysisOf(tx, versionId, galaxyUserId)
      await actAs(tx, 'authenticated', { sub: OWNER, user_role: 'admin' })

      const code = await refusal(tx, tx => tx`delete from galaxy.workflows where id = ${versionId}`)

      expect(code).toBe('23503')
      await actAsPostgres(tx)
      const [row] = await tx`select version_key, active from galaxy.workflows where id = ${versionId}`
      expect(row).toEqual({ version_key: '0.72-test', active: true })
    })
  })

  it('lets nobody but an administrator delete: a user\'s delete touches no row', async () => {
    await withRollback(async (tx) => {
      const { versionId } = await publishedVersion(tx)
      // the policy hides the rows it refuses rather than raising, so the
      // delete is not an error: it finds nothing to delete
      await actAs(tx, 'authenticated', { sub: OWNER, user_role: 'user' })
      const touched = await tx`delete from galaxy.workflows where id = ${versionId} returning id`
      expect(touched).toEqual([])

      await actAsPostgres(tx)
      const [row] = await tx`select id from galaxy.workflows where id = ${versionId}`
      expect(row).toEqual({ id: versionId })
    })
  })

  it('takes a tag association from before ADR 0004 along with the version rather than letting it block the delete', async () => {
    await withRollback(async (tx) => {
      const { versionId } = await publishedVersion(tx)
      const [tag] = await tx`insert into galaxy.tags (label) values ('legacy-72') returning id`
      await tx`insert into galaxy.workflows_to_tags (workflow_id, tag_id) values (${versionId}, ${tag!.id})`
      await actAs(tx, 'authenticated', { sub: OWNER, user_role: 'admin' })

      const deleted = await tx`delete from galaxy.workflows where id = ${versionId} returning id`
      expect(deleted).toEqual([{ id: versionId }])

      await actAsPostgres(tx)
      const associations = await tx`select workflow_id from galaxy.workflows_to_tags where workflow_id = ${versionId}`
      expect(associations).toEqual([])
    })
  })
})
