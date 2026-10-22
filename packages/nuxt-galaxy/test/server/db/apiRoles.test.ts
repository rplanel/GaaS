import process from 'node:process'
import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'

/**
 * What the API roles may do in the galaxy schema, proven against a live
 * Postgres (#171).
 *
 * `anon` and `authenticated` are the roles PostgREST, Realtime and Storage
 * take for a browser, and the schema is exposed through the API, so their
 * grants and the row-level policies are the whole gate. A user keeps exactly
 * the writes the application makes through their own session: renaming an
 * analysis, recording an upload, and an administrator publishing, retiring
 * and deleting a version. Every other write goes through a server route,
 * which writes with Drizzle or the service role, and neither is bound by
 * these grants. Reads stay as they were, but the tag tables are read only
 * through the reader's own datasets, and galaxy.user by the server alone
 * (#172).
 *
 * Same harness as `workflowsImmutability.test.ts`: the local Supabase (the
 * module's default URL, or `GALAXY_DRIZZLE_DATABASE_URL`), one transaction
 * per case, always rolled back, and the API roles taken with `SET LOCAL ROLE`
 * and the JWT claims `auth.uid()` and `galaxy_rbac.authorize` read. The
 * GitLab pipeline has no Postgres service, so the whole file skips when
 * nothing answers at the URL, and a database behind on migrations fails it.
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

/** The owner every case reads and writes as, and another user whose rows they must not see. */
const OWNER = '00000000-0000-4000-8000-000000000171'
const OTHER = '00000000-0000-4000-8000-000000000172'

class RolledBack extends Error {}

/** Runs `body` in a transaction that is always rolled back. */
async function withRollback(body: (tx: Tx) => Promise<void>) {
  await sql.begin(async (tx) => {
    await body(tx)
    throw new RolledBack()
  }).catch((error) => {
    if (!(error instanceof RolledBack))
      throw error
  })
}

/** Become an API role carrying these JWT claims, the way PostgREST does per request; the service role carries none. */
async function actAs(tx: Tx, role: 'authenticated' | 'anon' | 'service_role', claims: { sub?: string, user_role?: 'admin' | 'user' } = {}) {
  await tx`select set_config('request.jwt.claims', ${JSON.stringify({ ...claims, role })}, true)`
  await tx.unsafe(`set local role ${role}`)
}

/** The refusal a privilege check answers with, as against a policy's (`new row violates row-level security policy`). */
const PERMISSION_DENIED = { code: '42501', message: expect.stringMatching(/^permission denied for/) }

/** How the statement failed, or a failure saying it went through. */
async function refusal(tx: Tx, statement: (tx: Tx) => Promise<unknown>) {
  try {
    await tx.savepoint(statement)
  }
  catch (error) {
    const { code, message } = error as { code?: string, message?: string }
    return { code, message }
  }
  throw new Error('expected the statement to be refused')
}

interface OwnedAnalysis {
  analysisId: number
  historyId: number
  jobId: number
  inputDatasetId: number
  outputDatasetId: number
  outputId: number
  inputTagId: number
  outputTagId: number
}

interface World {
  instanceId: number
  galaxyUserId: number
  versionId: number
  /** A history of the owner's no analysis uses yet, for an analysis to be started on. */
  spareHistoryId: number
  mine: OwnedAnalysis
  theirs: OwnedAnalysis
}

/**
 * One analysis of the owner's start to finish: its history, a job, an input
 * dataset tagged on the dataset, an output tagged on the output (the two ways
 * a tag is stored, ADR 0003), and its monitoring record. The labels are ones
 * no real tag carries, the way a sample name would be.
 */
async function analysisOf(tx: Tx, owner: string, key: string, galaxyUserId: number, versionId: number): Promise<OwnedAnalysis> {
  const [history] = await tx`insert into galaxy.histories (galaxy_id, name, state, user_id, owner_id) values (${`hist-${key}`}, 'run', 'ok', ${galaxyUserId}, ${owner}) returning id`
  const [analysis] = await tx`
    insert into galaxy.analyses (name, state, parameters, owner_id, history_id, workflow_id, workflow_revision, galaxy_id, invocation)
    values ('run', 'scheduled', '{}', ${owner}, ${history!.id}, ${versionId}, 3, ${`inv-${key}`}, '{}')
    returning id`
  const [job] = await tx`insert into galaxy.jobs (state, tool_id, owner_id, galaxy_id, step_id, analysis_id) values ('ok', 'cat1', ${owner}, ${`job-${key}`}, 1, ${analysis!.id}) returning id`
  const [inputDataset] = await tx`
    insert into galaxy.datasets (owner_id, history_id, uuid, galaxy_metadata, dataset_name, galaxy_id)
    values (${owner}, ${history!.id}, gen_random_uuid(), '{"extension": "fasta"}', 'genome.fasta', ${`in-${key}`})
    returning id`
  const [outputDataset] = await tx`
    insert into galaxy.datasets (owner_id, history_id, uuid, galaxy_metadata, dataset_name, galaxy_id)
    values (${owner}, ${history!.id}, gen_random_uuid(), '{"extension": "tsv"}', 'systems.tsv', ${`out-${key}`})
    returning id`
  await tx`insert into galaxy.analysis_inputs (state, dataset_id, analysis_id) values ('ok', ${inputDataset!.id}, ${analysis!.id})`
  const [output] = await tx`insert into galaxy.analysis_outputs (state, dataset_id, analysis_id, job_id) values ('ok', ${outputDataset!.id}, ${analysis!.id}, ${job!.id}) returning id`
  const [inputTag] = await tx`insert into galaxy.tags (label) values (${`sample-${key}-in`}) returning id`
  const [outputTag] = await tx`insert into galaxy.tags (label) values (${`sample-${key}-out`}) returning id`
  await tx`insert into galaxy.datasets_to_tags (dataset_id, tag_id) values (${inputDataset!.id}, ${inputTag!.id})`
  await tx`insert into galaxy.analysis_outputs_to_tags (analysis_output_id, tag_id) values (${output!.id}, ${outputTag!.id})`
  await tx`
    insert into galaxy.analysis_monitoring (analysis_id, owner_id, workflow_id, name, galaxy_invocation_id, workflow_name, galaxy_workflow_id, workflow_version)
    values (${analysis!.id}, ${owner}, ${versionId}, 'run', ${`inv-${key}`}, 'Grants Test Finder', 'wf-171', '0.171-test')`
  return {
    analysisId: analysis!.id,
    historyId: history!.id,
    jobId: job!.id,
    inputDatasetId: inputDataset!.id,
    outputDatasetId: outputDataset!.id,
    outputId: output!.id,
    inputTagId: inputTag!.id,
    outputTagId: outputTag!.id,
  }
}

/**
 * The owner's analysis and another user's, of one published version, with
 * the permissions the seed gives the admin role, so the case holds whatever
 * this database was seeded with. Written as the connection's own role, which
 * neither the grants nor the policies bind.
 */
async function twoOwners(tx: Tx): Promise<World> {
  await tx`insert into auth.users (id) values (${OWNER}), (${OTHER}) on conflict (id) do nothing`
  for (const permission of ['workflows.insert', 'workflows.update', 'workflows.delete', 'instances.insert']) {
    await tx`insert into galaxy_rbac.role_permissions (role_id, permission) select id, ${permission} from galaxy_rbac.roles where name = 'admin' on conflict do nothing`
  }
  const [instance] = await tx`insert into galaxy.instances (url, name) values ('https://galaxy.test/171', 'Test Galaxy') returning id`
  const [galaxyUser] = await tx`insert into galaxy."user" (email, instance_id) values ('service@galaxy.test', ${instance!.id}) returning id`
  const [version] = await tx`
    insert into galaxy.workflows (galaxy_id, name, revision, revision_uuid, version_key, name_key, user_id, definition, published_by)
    values ('wf-171', 'Grants Test Finder', 3, 'fa95ecd4-ed11-49e2-b3d6-8f178b800171', '0.171-test', 'grantsTestFinder', ${galaxyUser!.id}, '{"a_galaxy_workflow": "true"}', ${OWNER})
    returning id`
  const [spareHistory] = await tx`insert into galaxy.histories (galaxy_id, name, state, user_id, owner_id) values ('hist-171-spare', 'spare', 'ok', ${galaxyUser!.id}, ${OWNER}) returning id`
  return {
    instanceId: instance!.id,
    galaxyUserId: galaxyUser!.id,
    versionId: version!.id,
    spareHistoryId: spareHistory!.id,
    mine: await analysisOf(tx, OWNER, '171-mine', galaxyUser!.id, version!.id),
    theirs: await analysisOf(tx, OTHER, '171-theirs', galaxyUser!.id, version!.id),
  }
}

type Write = (tx: Tx, world: World) => Promise<unknown>

/**
 * One insert, one update and one delete per table, each aimed at the owner's
 * own rows, so that what refuses it is the grant and not a policy. An update
 * assigns a column to itself: it needs the privilege and changes nothing.
 */
const WRITES = {
  tags: {
    insert: tx => tx`insert into galaxy.tags (label) values ('sample-171-new')`,
    update: (tx, w) => tx`update galaxy.tags set label = label where id = ${w.mine.inputTagId}`,
    delete: (tx, w) => tx`delete from galaxy.tags where id = ${w.mine.inputTagId}`,
  },
  datasets_to_tags: {
    insert: (tx, w) => tx`insert into galaxy.datasets_to_tags (dataset_id, tag_id) values (${w.mine.outputDatasetId}, ${w.mine.inputTagId})`,
    update: (tx, w) => tx`update galaxy.datasets_to_tags set tag_id = tag_id where dataset_id = ${w.mine.inputDatasetId}`,
    delete: (tx, w) => tx`delete from galaxy.datasets_to_tags where dataset_id = ${w.mine.inputDatasetId}`,
  },
  analysis_outputs_to_tags: {
    insert: (tx, w) => tx`insert into galaxy.analysis_outputs_to_tags (analysis_output_id, tag_id) values (${w.mine.outputId}, ${w.mine.inputTagId})`,
    update: (tx, w) => tx`update galaxy.analysis_outputs_to_tags set tag_id = tag_id where analysis_output_id = ${w.mine.outputId}`,
    delete: (tx, w) => tx`delete from galaxy.analysis_outputs_to_tags where analysis_output_id = ${w.mine.outputId}`,
  },
  workflows_to_tags: {
    insert: (tx, w) => tx`insert into galaxy.workflows_to_tags (workflow_id, tag_id) values (${w.versionId}, ${w.mine.inputTagId})`,
    update: (tx, w) => tx`update galaxy.workflows_to_tags set tag_id = tag_id where workflow_id = ${w.versionId}`,
    delete: (tx, w) => tx`delete from galaxy.workflows_to_tags where workflow_id = ${w.versionId}`,
  },
  analyses: {
    insert: (tx, w) => tx`
      insert into galaxy.analyses (name, state, parameters, owner_id, history_id, workflow_id, workflow_revision, galaxy_id, invocation)
      values ('run', 'scheduled', '{}', ${OWNER}, ${w.spareHistoryId}, ${w.versionId}, 3, 'inv-171-new', '{}')`,
    update: (tx, w) => tx`update galaxy.analyses set galaxy_id = galaxy_id where id = ${w.mine.analysisId}`,
    delete: (tx, w) => tx`delete from galaxy.analyses where id = ${w.mine.analysisId}`,
  },
  histories: {
    insert: (tx, w) => tx`insert into galaxy.histories (galaxy_id, name, state, user_id, owner_id) values ('hist-171-new', 'run', 'ok', ${w.galaxyUserId}, ${OWNER})`,
    update: (tx, w) => tx`update galaxy.histories set galaxy_id = galaxy_id where id = ${w.mine.historyId}`,
    delete: (tx, w) => tx`delete from galaxy.histories where id = ${w.spareHistoryId}`,
  },
  jobs: {
    insert: (tx, w) => tx`insert into galaxy.jobs (state, tool_id, owner_id, galaxy_id, step_id, analysis_id) values ('ok', 'cat1', ${OWNER}, 'job-171-new', 2, ${w.mine.analysisId})`,
    update: (tx, w) => tx`update galaxy.jobs set galaxy_id = galaxy_id where id = ${w.mine.jobId}`,
    delete: (tx, w) => tx`delete from galaxy.jobs where id = ${w.mine.jobId}`,
  },
  datasets: {
    insert: (tx, w) => tx`
      insert into galaxy.datasets (owner_id, history_id, uuid, galaxy_metadata, dataset_name, galaxy_id)
      values (${OWNER}, ${w.mine.historyId}, gen_random_uuid(), '{"extension": "txt"}', 'new.txt', 'ds-171-new')`,
    update: (tx, w) => tx`update galaxy.datasets set galaxy_id = galaxy_id where id = ${w.mine.inputDatasetId}`,
    delete: (tx, w) => tx`delete from galaxy.datasets where id = ${w.mine.outputDatasetId}`,
  },
  analysis_inputs: {
    insert: (tx, w) => tx`insert into galaxy.analysis_inputs (state, dataset_id, analysis_id) values ('ok', ${w.mine.outputDatasetId}, ${w.mine.analysisId})`,
    update: (tx, w) => tx`update galaxy.analysis_inputs set state = state where analysis_id = ${w.mine.analysisId}`,
    delete: (tx, w) => tx`delete from galaxy.analysis_inputs where analysis_id = ${w.mine.analysisId}`,
  },
  analysis_outputs: {
    insert: (tx, w) => tx`insert into galaxy.analysis_outputs (state, dataset_id, analysis_id, job_id) values ('ok', ${w.mine.inputDatasetId}, ${w.mine.analysisId}, ${w.mine.jobId})`,
    update: (tx, w) => tx`update galaxy.analysis_outputs set state = state where analysis_id = ${w.mine.analysisId}`,
    delete: (tx, w) => tx`delete from galaxy.analysis_outputs where analysis_id = ${w.mine.analysisId}`,
  },
  analysis_monitoring: {
    insert: (tx, w) => tx`
      insert into galaxy.analysis_monitoring (owner_id, workflow_id, name, galaxy_invocation_id, outcome)
      values (${OWNER}, ${w.versionId}, 'run', 'inv-171-new', 'success')`,
    update: (tx, w) => tx`update galaxy.analysis_monitoring set outcome = outcome where analysis_id = ${w.mine.analysisId}`,
    delete: (tx, w) => tx`delete from galaxy.analysis_monitoring where analysis_id = ${w.mine.analysisId}`,
  },
  sync_locks: {
    insert: (tx, w) => tx`insert into galaxy.sync_locks (analysis_id, expires_at) values (${w.mine.analysisId}, now() + interval '1 hour')`,
    update: (tx, w) => tx`update galaxy.sync_locks set expires_at = expires_at where analysis_id = ${w.mine.analysisId}`,
    delete: (tx, w) => tx`delete from galaxy.sync_locks where analysis_id = ${w.mine.analysisId}`,
  },
  instances: {
    insert: tx => tx`insert into galaxy.instances (url, name) values ('https://galaxy.test/171-new', 'New Galaxy')`,
    update: (tx, w) => tx`update galaxy.instances set url = url where id = ${w.instanceId}`,
    delete: (tx, w) => tx`delete from galaxy.instances where id = ${w.instanceId}`,
  },
  user: {
    insert: (tx, w) => tx`insert into galaxy."user" (email, instance_id) values ('new@galaxy.test', ${w.instanceId})`,
    update: (tx, w) => tx`update galaxy."user" set email = email where id = ${w.galaxyUserId}`,
    delete: (tx, w) => tx`delete from galaxy."user" where id = ${w.galaxyUserId}`,
  },
  maintenance_windows: {
    insert: tx => tx`insert into galaxy.maintenance_windows (message, start_at, end_at, created_by) values ('new', now(), now() + interval '1 hour', ${OWNER})`,
    update: tx => tx`update galaxy.maintenance_windows set message = message`,
    delete: tx => tx`delete from galaxy.maintenance_windows`,
  },
} satisfies Record<string, Record<'insert' | 'update' | 'delete', Write>>

type Table = keyof typeof WRITES

/** Every write `WRITES` holds for these tables, as `it.each` rows. */
function writesOn(tables: Table[]) {
  return tables.flatMap(table => (['insert', 'update', 'delete'] as const).map(op => [op, table, WRITES[table][op]] as const))
}

const TAG_TABLES: Table[] = ['tags', 'datasets_to_tags', 'analysis_outputs_to_tags', 'workflows_to_tags']

/** The labels of the tags this select returns, sorted. */
async function labels(rows: Promise<postgres.RowList<postgres.Row[]>>) {
  return (await rows).map(({ label }) => label as string).sort()
}

describe.skipIf(!live)('the tag tables', () => {
  // Only the sync writes a tag, through the service role.
  it.each(writesOn(TAG_TABLES))('refuses an anonymous caller any %s on %s', async (_op, _table, write) => {
    await withRollback(async (tx) => {
      const world = await twoOwners(tx)
      await actAs(tx, 'anon', { sub: OWNER })

      expect(await refusal(tx, tx => write(tx, world))).toEqual(PERMISSION_DENIED)
    })
  })

  it.each(writesOn(TAG_TABLES))('refuses a signed-in owner any %s on %s', async (_op, _table, write) => {
    await withRollback(async (tx) => {
      const world = await twoOwners(tx)
      await actAs(tx, 'authenticated', { sub: OWNER, user_role: 'user' })

      expect(await refusal(tx, tx => write(tx, world))).toEqual(PERMISSION_DENIED)
    })
  })

  // A results view reads an analysis's tags through PostgREST embeddings
  // (`supabaseAnalysisByIdForResultsViewQuery`): an input's off its dataset,
  // an output's off the output. PostgREST joins through the link tables with
  // every table's policy applied, as this select does. A tag table with row
  // security and no read policy raises nothing: the view just gets no tags.
  it('gives the results view of an analysis the tags of its own input datasets and outputs', async () => {
    await withRollback(async (tx) => {
      const { mine } = await twoOwners(tx)
      await actAs(tx, 'authenticated', { sub: OWNER, user_role: 'user' })

      const inputTags = await labels(tx`
        select t.label from galaxy.analysis_inputs i
        join galaxy.datasets d on d.id = i.dataset_id
        join galaxy.datasets_to_tags dt on dt.dataset_id = d.id
        join galaxy.tags t on t.id = dt.tag_id
        where i.analysis_id = ${mine.analysisId}`)
      const outputTags = await labels(tx`
        select t.label from galaxy.analysis_outputs o
        join galaxy.analysis_outputs_to_tags ot on ot.analysis_output_id = o.id
        join galaxy.tags t on t.id = ot.tag_id
        where o.analysis_id = ${mine.analysisId}`)

      expect({ inputTags, outputTags }).toEqual({ inputTags: ['sample-171-mine-in'], outputTags: ['sample-171-mine-out'] })
    })
  })

  // A label can carry a sample name, so a reader sees only the tags of their
  // own datasets and outputs, and none of another user's.
  it('shows a signed-in user the tags of their own datasets and outputs, and none of another user\'s', async () => {
    await withRollback(async (tx) => {
      const { mine, theirs } = await twoOwners(tx)
      await actAs(tx, 'authenticated', { sub: OWNER, user_role: 'user' })

      const asked = [mine.inputTagId, mine.outputTagId, theirs.inputTagId, theirs.outputTagId]
      const tags = await labels(tx`select label from galaxy.tags where id in ${tx(asked)}`)
      const datasetLinks = await tx`select dataset_id from galaxy.datasets_to_tags where dataset_id in ${tx([mine.inputDatasetId, theirs.inputDatasetId])}`
      const outputLinks = await tx`select analysis_output_id from galaxy.analysis_outputs_to_tags where analysis_output_id in ${tx([mine.outputId, theirs.outputId])}`

      expect(tags).toEqual(['sample-171-mine-in', 'sample-171-mine-out'])
      expect(datasetLinks).toEqual([{ dataset_id: mine.inputDatasetId }])
      expect(outputLinks).toEqual([{ analysis_output_id: mine.outputId }])
    })
  })

  it('shows an anonymous caller no tag and no tag link', async () => {
    await withRollback(async (tx) => {
      const world = await twoOwners(tx)
      await tx`insert into galaxy.workflows_to_tags (workflow_id, tag_id) values (${world.versionId}, ${world.mine.inputTagId})`
      await actAs(tx, 'anon', { sub: OWNER })

      const [seen] = await tx`
        select
          (select count(*)::int from galaxy.tags) as tags,
          (select count(*)::int from galaxy.datasets_to_tags) as datasets_to_tags,
          (select count(*)::int from galaxy.analysis_outputs_to_tags) as analysis_outputs_to_tags,
          (select count(*)::int from galaxy.workflows_to_tags) as workflows_to_tags`

      expect(seen).toEqual({ tags: 0, datasets_to_tags: 0, analysis_outputs_to_tags: 0, workflows_to_tags: 0 })
    })
  })

  // Nothing reads the tags linked to a version since ADR 0004 made tags a pre-fill.
  it('shows a signed-in user no tag linked to a version', async () => {
    await withRollback(async (tx) => {
      const world = await twoOwners(tx)
      await tx`insert into galaxy.workflows_to_tags (workflow_id, tag_id) values (${world.versionId}, ${world.mine.inputTagId})`
      await actAs(tx, 'authenticated', { sub: OWNER, user_role: 'admin' })

      expect(await tx`select workflow_id from galaxy.workflows_to_tags`).toEqual([])
    })
  })
})

describe.skipIf(!live)('an analysis', () => {
  // The analysis list renames in the browser, the one write a user makes to
  // the row. Everything else on it is the server's: starting it, syncing it
  // and deleting it, with the Galaxy history and the monitoring record.
  it('lets its owner rename it, and nobody else', async () => {
    await withRollback(async (tx) => {
      const { mine } = await twoOwners(tx)

      await actAs(tx, 'authenticated', { sub: OTHER, user_role: 'user' })
      expect(await tx`update galaxy.analyses set name = 'not theirs' where id = ${mine.analysisId} returning id`).toEqual([])

      await actAs(tx, 'authenticated', { sub: OWNER, user_role: 'user' })
      expect(await tx`update galaxy.analyses set name = 'renamed' where id = ${mine.analysisId} returning name`).toEqual([{ name: 'renamed' }])
    })
  })

  it('lets an update touch name and no other column', async () => {
    const grants = await sql`
      select grantee, string_agg(column_name::text, ',' order by column_name) as columns
      from information_schema.column_privileges
      where table_schema = 'galaxy' and table_name = 'analyses' and privilege_type = 'UPDATE' and grantee in ('anon', 'authenticated')
      group by grantee order by grantee`

    expect(grants).toEqual([{ grantee: 'authenticated', columns: 'name' }])
  })

  it.each([
    'id',
    'state',
    'parameters',
    'datamap',
    'created_at',
    'owner_id',
    'history_id',
    'workflow_id',
    'workflow_revision',
    'galaxy_id',
    'stderr',
    'stdout',
    'invocation',
    'is_sync',
    'sync_attempts',
    'last_sync_error_at',
    'next_sync_at',
  ])('refuses its owner an update touching %s', async (column) => {
    await withRollback(async (tx) => {
      const { mine } = await twoOwners(tx)
      await actAs(tx, 'authenticated', { sub: OWNER, user_role: 'user' })

      expect(await refusal(tx, tx => tx`update galaxy.analyses set ${tx(column)} = ${tx(column)} where id = ${mine.analysisId}`)).toEqual(PERMISSION_DENIED)
    })
  })

  it.each(['insert', 'delete'] as const)('refuses its owner any %s', async (op) => {
    await withRollback(async (tx) => {
      const world = await twoOwners(tx)
      await actAs(tx, 'authenticated', { sub: OWNER, user_role: 'user' })

      expect(await refusal(tx, tx => WRITES.analyses[op](tx, world))).toEqual(PERMISSION_DENIED)
    })
  })
})

// The sync and the server routes write these through the service role or
// Drizzle. Through the API, an owner reads them and nothing more.
describe.skipIf(!live)('what the server records of an analysis', () => {
  it.each(writesOn(['histories', 'jobs', 'datasets', 'analysis_inputs', 'analysis_outputs', 'analysis_monitoring']))('refuses its owner any %s on %s', async (_op, _table, write) => {
    await withRollback(async (tx) => {
      const world = await twoOwners(tx)
      await actAs(tx, 'authenticated', { sub: OWNER, user_role: 'user' })

      expect(await refusal(tx, tx => write(tx, world))).toEqual(PERMISSION_DENIED)
    })
  })
})

// The sync task takes and drops its locks through the service role.
describe.skipIf(!live)('the sync locks', () => {
  it.each(writesOn(['sync_locks']))('refuses a signed-in user any %s on %s', async (_op, _table, write) => {
    await withRollback(async (tx) => {
      const world = await twoOwners(tx)
      await actAs(tx, 'authenticated', { sub: OWNER, user_role: 'user' })

      expect(await refusal(tx, tx => write(tx, world))).toEqual(PERMISSION_DENIED)
    })
  })

  it.each(['anon', 'authenticated'] as const)('refuses %s the routine that takes a lock', async (role) => {
    await withRollback(async (tx) => {
      const { mine } = await twoOwners(tx)
      await actAs(tx, role, { sub: OWNER, user_role: 'user' })

      expect(await refusal(tx, tx => tx`select galaxy.acquire_sync_lock(${mine.analysisId}, 60)`)).toEqual(PERMISSION_DENIED)
    })
  })

  // No client calls a galaxy routine, and the server's one call goes through
  // the service role. A routine is executable by PUBLIC unless its migration
  // says otherwise, and no default privilege per schema can change that, so
  // this is what catches a new one on a database. routineRevokes.test.ts
  // reads the migrations instead, for CI, which has none.
  it('leaves the API roles no galaxy routine to execute', async () => {
    const executable = await sql`
      select p.proname, r.rolname
      from pg_proc p cross join (values ('anon'), ('authenticated')) as r(rolname)
      where p.pronamespace = 'galaxy'::regnamespace and has_function_privilege(r.rolname, p.oid, 'EXECUTE')
      order by 1, 2`

    expect(executable).toEqual([])
  })
})

// An administrator configures the instance through the server or the seed.
describe.skipIf(!live)('the instance configuration', () => {
  it.each(writesOn(['instances', 'user', 'maintenance_windows']))('refuses even an administrator any %s on %s', async (_op, _table, write) => {
    await withRollback(async (tx) => {
      const world = await twoOwners(tx)
      await actAs(tx, 'authenticated', { sub: OWNER, user_role: 'admin' })

      expect(await refusal(tx, tx => write(tx, world))).toEqual(PERMISSION_DENIED)
    })
  })

  // galaxy.user holds the Galaxy service account the server runs every job
  // as, and the server reads it with Drizzle. Nothing in the browser reads
  // it, so no session does, whatever this database was seeded with.
  it.each([
    ['an anonymous caller', 'anon', { sub: OWNER }],
    ['a signed-in user', 'authenticated', { sub: OWNER, user_role: 'user' }],
    ['an administrator', 'authenticated', { sub: OWNER, user_role: 'admin' }],
  ] as const)('shows %s no row of galaxy.user', async (_who, role, claims) => {
    await withRollback(async (tx) => {
      await twoOwners(tx)
      await tx`insert into galaxy_rbac.role_permissions (role_id, permission) select id, 'users.select' from galaxy_rbac.roles on conflict do nothing`
      await actAs(tx, role, claims)

      expect(await tx`select id from galaxy."user"`).toEqual([])
    })
  })
})

describe.skipIf(!live)('the API roles across the schema', () => {
  // The writes the application makes through a user's session, and nothing
  // else: no write through a view, and no TRUNCATE.
  it('hold no privilege beyond reading, but for the writes the browser makes', async () => {
    const held = await sql`
      select c.relname as table, r.rolname as role, p.privilege
      from pg_class c
      cross join (values ('anon'), ('authenticated')) as r(rolname)
      cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(privilege)
      where c.relnamespace = 'galaxy'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f')
        and case when p.privilege in ('INSERT', 'UPDATE', 'REFERENCES')
          then has_any_column_privilege(r.rolname, c.oid, p.privilege)
          else has_table_privilege(r.rolname, c.oid, p.privilege) end
      order by 1, 2, 3`

    expect(held).toEqual([
      { table: 'analyses', role: 'authenticated', privilege: 'UPDATE' },
      { table: 'uploaded_datasets', role: 'authenticated', privilege: 'INSERT' },
      { table: 'workflows', role: 'authenticated', privilege: 'DELETE' },
      { table: 'workflows', role: 'authenticated', privilege: 'INSERT' },
      { table: 'workflows', role: 'authenticated', privilege: 'UPDATE' },
    ])
  })

  it('still read every table and view, under its policies', async () => {
    const unreadable = await sql`
      select c.relname, r.rolname
      from pg_class c cross join (values ('anon'), ('authenticated')) as r(rolname)
      where c.relnamespace = 'galaxy'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f')
        and not has_table_privilege(r.rolname, c.oid, 'SELECT')`

    expect(unreadable).toEqual([])
  })

  // A serial id is drawn as the inserting role, so the two inserts the
  // browser makes need their sequence, and nothing else does.
  it('draw ids from the sequences of the rows they insert, and from no other', async () => {
    const held = await sql`
      select c.relname as sequence, r.rolname as role, p.privilege
      from pg_class c
      cross join (values ('anon'), ('authenticated')) as r(rolname)
      cross join (values ('USAGE'), ('SELECT'), ('UPDATE')) as p(privilege)
      where c.relnamespace = 'galaxy'::regnamespace and c.relkind = 'S' and has_sequence_privilege(r.rolname, c.oid, p.privilege)
      order by 1, 2, 3`

    expect(held).toEqual([
      { sequence: 'uploaded_datasets_id_seq', role: 'authenticated', privilege: 'USAGE' },
      { sequence: 'workflows_id_seq', role: 'authenticated', privilege: 'USAGE' },
    ])
  })

  // A table a later migration adds is the service role's alone until that
  // migration grants the API roles what they need.
  it('get nothing by default on what a later migration creates, while the service role keeps it all', async () => {
    const defaults = await sql`
      select distinct d.defaclobjtype as type, a.grantee::regrole::text as grantee
      from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
      where d.defaclnamespace = 'galaxy'::regnamespace
      order by 1, 2`
    expect(defaults).toEqual([
      { type: 'S', grantee: 'service_role' },
      { type: 'f', grantee: 'service_role' },
      { type: 'r', grantee: 'service_role' },
    ])

    await withRollback(async (tx) => {
      await tx`create table galaxy.later_171 (id serial primary key)`
      const [privileges] = await tx`
        select
          has_table_privilege('authenticated', 'galaxy.later_171', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') as authenticated_table,
          has_table_privilege('anon', 'galaxy.later_171', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') as anon_table,
          has_sequence_privilege('authenticated', 'galaxy.later_171_id_seq', 'USAGE, SELECT, UPDATE') as authenticated_sequence,
          has_sequence_privilege('anon', 'galaxy.later_171_id_seq', 'USAGE, SELECT, UPDATE') as anon_sequence,
          has_table_privilege('service_role', 'galaxy.later_171', 'SELECT, INSERT, UPDATE, DELETE') as service_role_table`

      expect(privileges).toEqual({ authenticated_table: false, anon_table: false, authenticated_sequence: false, anon_sequence: false, service_role_table: true })
    })
  })

  // A policy grants nothing without the privilege it is for, so one left
  // behind reads as a write the API allows when it does not.
  it('leave no policy without a privilege behind it', async () => {
    const dead = await sql`
      select p.tablename, p.policyname
      from pg_policies p cross join lateral unnest(p.roles) as r(rolname)
      where p.schemaname = 'galaxy' and r.rolname in ('anon', 'authenticated')
        and not case p.cmd
          when 'SELECT' then has_table_privilege(r.rolname, format('%I.%I', p.schemaname, p.tablename), 'SELECT')
          when 'INSERT' then has_any_column_privilege(r.rolname, format('%I.%I', p.schemaname, p.tablename), 'INSERT')
          when 'UPDATE' then has_any_column_privilege(r.rolname, format('%I.%I', p.schemaname, p.tablename), 'UPDATE')
          when 'DELETE' then has_table_privilege(r.rolname, format('%I.%I', p.schemaname, p.tablename), 'DELETE')
          else has_table_privilege(r.rolname, format('%I.%I', p.schemaname, p.tablename), 'SELECT, DELETE')
            and has_any_column_privilege(r.rolname, format('%I.%I', p.schemaname, p.tablename), 'INSERT')
            and has_any_column_privilege(r.rolname, format('%I.%I', p.schemaname, p.tablename), 'UPDATE')
        end
      order by 1, 2`

    expect(dead).toEqual([])
  })
})

describe.skipIf(!live)('the writes a user makes through their own session', () => {
  // The Datasets page uploads to storage in the browser, then records the
  // upload. The dataset-input route uploads through the session too.
  it('lets an owner upload a file, read it back and record it as their dataset', async () => {
    await withRollback(async (tx) => {
      await twoOwners(tx)
      await actAs(tx, 'authenticated', { sub: OWNER, user_role: 'user' })

      const [object] = await tx`insert into storage.objects (bucket_id, name, owner, owner_id) values ('analysis_files', '171-test/genome.fasta', ${OWNER}, ${OWNER}) returning id`
      expect(await tx`select name from storage.objects where id = ${object!.id}`).toEqual([{ name: '171-test/genome.fasta' }])

      const recorded = await tx`insert into galaxy.uploaded_datasets (owner_id, dataset_name, storage_object_id) values (${OWNER}, 'genome.fasta', ${object!.id}) returning dataset_name`
      expect(recorded).toEqual([{ dataset_name: 'genome.fasta' }])
    })
  })

  it('refuses to record an upload in another user\'s name', async () => {
    await withRollback(async (tx) => {
      await twoOwners(tx)
      await actAs(tx, 'authenticated', { sub: OWNER, user_role: 'user' })
      const [object] = await tx`insert into storage.objects (bucket_id, name, owner, owner_id) values ('analysis_files', '171-test/genome.fasta', ${OWNER}, ${OWNER}) returning id`

      const refused = await refusal(tx, tx => tx`insert into galaxy.uploaded_datasets (owner_id, dataset_name, storage_object_id) values (${OTHER}, 'genome.fasta', ${object!.id})`)

      expect(refused).toEqual({ code: '42501', message: expect.stringMatching(/row-level security policy/) })
    })
  })

  // The admin page's routes write through the administrator's session, so
  // the policy's `galaxy_rbac.authorize` sees who they are.
  it('lets an administrator publish a version, retire it, make it active again and delete it', async () => {
    await withRollback(async (tx) => {
      const { galaxyUserId } = await twoOwners(tx)
      await actAs(tx, 'authenticated', { sub: OWNER, user_role: 'admin' })

      const [version] = await tx`
        insert into galaxy.workflows (galaxy_id, name, revision, revision_uuid, version_key, name_key, user_id, definition, published_by)
        values ('wf-171', 'Grants Test Finder', 4, 'fa95ecd4-ed11-49e2-b3d6-8f178b800174', '0.172-test', 'grantsTestFinder', ${galaxyUserId}, '{"a_galaxy_workflow": "true"}', ${OWNER})
        returning id`
      expect(await tx`update galaxy.workflows set active = false where id = ${version!.id} returning active`).toEqual([{ active: false }])
      expect(await tx`update galaxy.workflows set active = true where id = ${version!.id} returning active`).toEqual([{ active: true }])
      expect(await tx`delete from galaxy.workflows where id = ${version!.id} returning id`).toEqual([{ id: version!.id }])
    })
  })
})

describe.skipIf(!live)('the server', () => {
  // The revokes bind the server only if it writes as a role they name. Its
  // Drizzle client connects with the URL this file does, as the role that
  // owns every table, which no grant binds and no policy does unless forced.
  it('writes with Drizzle as the owner of every table', async () => {
    const notOwned = await sql`
      select c.relname
      from pg_class c
      where c.relnamespace = 'galaxy'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'S')
        and (c.relowner <> (select oid from pg_roles where rolname = current_user) or c.relforcerowsecurity)
      order by 1`

    expect(notOwned).toEqual([])
  })

  // The sync task writes through the service-role client, whose grants this
  // change leaves alone. One of each write it makes, as that role.
  it('keeps every write the sync makes through the service role', async () => {
    await withRollback(async (tx) => {
      const { mine } = await twoOwners(tx)
      await actAs(tx, 'service_role')

      expect(await tx`select galaxy.acquire_sync_lock(${mine.analysisId}, 60) as locked`).toEqual([{ locked: true }])
      await tx`update galaxy.analyses set state = 'scheduled', is_sync = true, sync_attempts = 0 where id = ${mine.analysisId}`
      await tx`update galaxy.histories set state = 'ok', is_sync = true where id = ${mine.historyId}`
      const [job] = await tx`insert into galaxy.jobs (state, tool_id, owner_id, galaxy_id, step_id, analysis_id) values ('running', 'cat1', ${OWNER}, 'job-171-synced', 2, ${mine.analysisId}) returning id`
      await tx`update galaxy.jobs set state = 'ok', update_time = now() where id = ${job!.id}`
      const [dataset] = await tx`
        insert into galaxy.datasets (owner_id, history_id, uuid, galaxy_metadata, dataset_name, galaxy_id)
        values (${OWNER}, ${mine.historyId}, gen_random_uuid(), '{"extension": "tsv"}', 'genes.tsv', 'out-171-synced')
        returning id`
      await tx`update galaxy.datasets set galaxy_metadata = '{"extension": "tsv", "data_lines": 3}' where id = ${dataset!.id}`
      const [output] = await tx`insert into galaxy.analysis_outputs (state, dataset_id, analysis_id, job_id) values ('queued', ${dataset!.id}, ${mine.analysisId}, ${job!.id}) returning id`
      await tx`update galaxy.analysis_outputs set state = 'ok' where id = ${output!.id}`
      await tx`update galaxy.analysis_monitoring set outcome = 'success', completed_at = now() where analysis_id = ${mine.analysisId}`
      const released = await tx`delete from galaxy.sync_locks where analysis_id = ${mine.analysisId} returning analysis_id`

      expect(released).toEqual([{ analysis_id: mine.analysisId }])
    })
  })

  // `galaxy_rbac.authorize()` reads the role permissions for a policy, as
  // its definer; the API roles themselves read and write none of them.
  it('leaves the API roles nothing in galaxy_rbac.role_permissions', async () => {
    const [held] = await sql`
      select
        has_schema_privilege('anon', 'galaxy_rbac', 'USAGE') or has_schema_privilege('authenticated', 'galaxy_rbac', 'USAGE') as schema,
        has_table_privilege('anon', 'galaxy_rbac.role_permissions', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
          or has_table_privilege('authenticated', 'galaxy_rbac.role_permissions', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') as table`

    expect(held).toEqual({ schema: false, table: false })
  })
})
