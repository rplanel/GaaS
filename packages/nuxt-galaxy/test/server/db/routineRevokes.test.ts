import { describe, expect, it } from 'vitest'
import { readMigrations, routinesNotRevokedFromPublic } from './routineRevokes'

describe('the galaxy routines the migrations create', () => {
  const migrations = readMigrations()

  it('are each revoked from PUBLIC', () => {
    expect(routinesNotRevokedFromPublic(migrations)).toEqual([])
  })

  // So that an empty reading cannot pass the test above.
  it('include galaxy.acquire_sync_lock, which #171\'s schema-wide revoke covers', () => {
    const beforeApiRoleGrants = migrations.filter(migration => migration.name < '20261019120528_api_role_grants')

    expect(routinesNotRevokedFromPublic(beforeApiRoleGrants)).toEqual([
      { migration: '20260808071319_smart_tyrannus', routine: 'galaxy.acquire_sync_lock' },
    ])
  })
})

describe('routinesNotRevokedFromPublic', () => {
  it('names a function no revoke follows, and the migration that created it', () => {
    const found = routinesNotRevokedFromPublic([
      { name: '20270101000000_count_jobs', sql: `CREATE FUNCTION "galaxy"."count_jobs"() RETURNS integer LANGUAGE sql AS $$ SELECT count(*)::integer FROM "galaxy"."jobs" $$;` },
    ])

    expect(found).toEqual([{ migration: '20270101000000_count_jobs', routine: 'galaxy.count_jobs' }])
  })

  it('names a function created with CREATE OR REPLACE and no revoke', () => {
    const found = routinesNotRevokedFromPublic([
      { name: '20270101000000_count_jobs', sql: `CREATE OR REPLACE FUNCTION galaxy.count_jobs() RETURNS integer LANGUAGE sql AS $$ SELECT count(*)::integer FROM "galaxy"."jobs" $$;` },
    ])

    expect(found).toEqual([{ migration: '20270101000000_count_jobs', routine: 'galaxy.count_jobs' }])
  })

  it('names a procedure no revoke follows', () => {
    const found = routinesNotRevokedFromPublic([
      { name: '20270101000000_clear_locks', sql: `CREATE PROCEDURE "galaxy"."clear_locks"() LANGUAGE sql AS $$ DELETE FROM "galaxy"."sync_locks" $$;` },
    ])

    expect(found).toEqual([{ migration: '20270101000000_clear_locks', routine: 'galaxy.clear_locks' }])
  })

  it('names a routine created after a schema-wide revoke, which covers only those before it', () => {
    const found = routinesNotRevokedFromPublic([
      { name: '20270101000000_count_jobs', sql: `CREATE FUNCTION "galaxy"."count_jobs"() RETURNS integer LANGUAGE sql AS $$ SELECT count(*)::integer FROM "galaxy"."jobs" $$;` },
      {
        name: '20270102000000_count_histories',
        sql: `REVOKE ALL ON ALL ROUTINES IN SCHEMA "galaxy" FROM PUBLIC, anon, authenticated;--> statement-breakpoint
CREATE FUNCTION "galaxy"."count_histories"() RETURNS integer LANGUAGE sql AS $$ SELECT count(*)::integer FROM "galaxy"."histories" $$;`,
      },
    ])

    expect(found).toEqual([{ migration: '20270102000000_count_histories', routine: 'galaxy.count_histories' }])
  })

  it('names a procedure a schema-wide revoke on functions leaves', () => {
    const found = routinesNotRevokedFromPublic([
      {
        name: '20270101000000_locks',
        sql: `CREATE FUNCTION "galaxy"."count_locks"() RETURNS integer LANGUAGE sql AS $$ SELECT count(*)::integer FROM "galaxy"."sync_locks" $$;
CREATE PROCEDURE "galaxy"."clear_locks"() LANGUAGE sql AS $$ DELETE FROM "galaxy"."sync_locks" $$;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA galaxy FROM PUBLIC;`,
      },
    ])

    expect(found).toEqual([{ migration: '20270101000000_locks', routine: 'galaxy.clear_locks' }])
  })

  // Replacing a routine keeps its privileges only when the argument list is
  // unchanged, and the SQL cannot say whether it is.
  it('names a routine re-created after its revoke, in the migration that re-created it', () => {
    const found = routinesNotRevokedFromPublic([
      {
        name: '20270101000000_count_jobs',
        sql: `CREATE FUNCTION "galaxy"."count_jobs"() RETURNS integer LANGUAGE sql AS $$ SELECT count(*)::integer FROM "galaxy"."jobs" $$;
REVOKE EXECUTE ON FUNCTION "galaxy"."count_jobs"() FROM PUBLIC;`,
      },
      { name: '20270102000000_count_jobs_by_owner', sql: `CREATE OR REPLACE FUNCTION "galaxy"."count_jobs"(p_owner uuid) RETURNS integer LANGUAGE sql AS $$ SELECT count(*)::integer FROM "galaxy"."jobs" WHERE "owner_id" = p_owner $$;` },
    ])

    expect(found).toEqual([{ migration: '20270102000000_count_jobs_by_owner', routine: 'galaxy.count_jobs' }])
  })

  // Drizzle runs each chunk between two breakpoints on its own, so a chunk's
  // last statement may leave out its semicolon.
  it('reads a statement breakpoint as the end of a statement', () => {
    const found = routinesNotRevokedFromPublic([
      {
        name: '20270101000000_count_jobs',
        sql: `REVOKE ALL ON ALL ROUTINES IN SCHEMA "galaxy" FROM PUBLIC
--> statement-breakpoint
CREATE FUNCTION "galaxy"."count_jobs"() RETURNS integer LANGUAGE sql AS $$ SELECT count(*)::integer FROM "galaxy"."jobs" $$;`,
      },
    ])

    expect(found).toEqual([{ migration: '20270101000000_count_jobs', routine: 'galaxy.count_jobs' }])
  })

  // GRANT reads an aggregate as a function: ON FUNCTION names one, and ALL
  // FUNCTIONS covers it.
  it('names an aggregate no revoke follows, as a function', () => {
    const created = { name: '20270101000000_sum_attempts', sql: `CREATE AGGREGATE "galaxy"."sum_attempts"(integer) (SFUNC = int4pl, STYPE = integer);` }

    expect(routinesNotRevokedFromPublic([created])).toEqual([{ migration: '20270101000000_sum_attempts', routine: 'galaxy.sum_attempts' }])
    expect(routinesNotRevokedFromPublic([
      created,
      { name: '20270102000000_revoke_functions', sql: `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA galaxy FROM PUBLIC;` },
    ])).toEqual([])
  })

  it('reads a revoke\'s FROM outside the quoted names before and after it', () => {
    const found = routinesNotRevokedFromPublic([
      {
        name: '20270101000000_count_jobs',
        sql: `CREATE FUNCTION "galaxy"."jobs from owners"() RETURNS integer LANGUAGE sql AS $$ SELECT count(*)::integer FROM "galaxy"."jobs" $$;
REVOKE EXECUTE ON FUNCTION "galaxy"."jobs from owners"() FROM PUBLIC GRANTED BY "a from b";`,
      },
    ])

    expect(found).toEqual([])
  })

  it('passes a routine whose quoted name holds a comma, revoked by that name', () => {
    const found = routinesNotRevokedFromPublic([
      {
        name: '20270101000000_count_jobs',
        sql: `CREATE FUNCTION "galaxy"."count,jobs"() RETURNS integer LANGUAGE sql AS $$ SELECT count(*)::integer FROM "galaxy"."jobs" $$;
REVOKE EXECUTE ON FUNCTION "galaxy"."count,jobs"() FROM PUBLIC;`,
      },
    ])

    expect(found).toEqual([])
  })

  it('names a routine whose quoted name holds a semicolon', () => {
    const found = routinesNotRevokedFromPublic([
      { name: '20270101000000_count_jobs', sql: `CREATE FUNCTION "galaxy"."count;jobs"() RETURNS integer LANGUAGE sql AS $$ SELECT count(*)::integer FROM "galaxy"."jobs" $$;` },
    ])

    expect(found).toEqual([{ migration: '20270101000000_count_jobs', routine: 'galaxy.count;jobs' }])
  })

  it('passes a routine followed by its own revoke from PUBLIC', () => {
    const found = routinesNotRevokedFromPublic([
      {
        name: '20270101000000_count_jobs',
        sql: `CREATE FUNCTION "galaxy"."count_jobs"(p_owner uuid) RETURNS integer LANGUAGE sql AS $$ SELECT count(*)::integer FROM "galaxy"."jobs" $$;
REVOKE EXECUTE ON FUNCTION "galaxy"."count_jobs"(uuid) FROM PUBLIC;`,
      },
    ])

    expect(found).toEqual([])
  })

  it('passes routines revoked by name as a procedure or as a routine', () => {
    const found = routinesNotRevokedFromPublic([
      {
        name: '20270101000000_locks',
        sql: `CREATE PROCEDURE "galaxy"."clear_locks"() LANGUAGE sql AS $$ DELETE FROM "galaxy"."sync_locks" $$;
REVOKE ALL ON PROCEDURE galaxy.clear_locks() FROM PUBLIC;
CREATE FUNCTION "galaxy"."count_locks"() RETURNS integer LANGUAGE sql AS $$ SELECT count(*)::integer FROM "galaxy"."sync_locks" $$;
REVOKE EXECUTE ON ROUTINE "galaxy".count_locks FROM anon, PUBLIC;`,
      },
    ])

    expect(found).toEqual([])
  })

  // Postgres's grammar reads a grantee named public, quoted or not, as PUBLIC,
  // and takes GROUP as a word that changes nothing (gram.y, RoleSpec and
  // grantee, on 15 and 17).
  it('passes a revoke that spells PUBLIC as "public" or as GROUP PUBLIC', () => {
    const found = routinesNotRevokedFromPublic([
      {
        name: '20270101000000_counts',
        sql: `CREATE FUNCTION "galaxy"."count_jobs"() RETURNS integer LANGUAGE sql AS $$ SELECT count(*)::integer FROM "galaxy"."jobs" $$;
REVOKE EXECUTE ON FUNCTION "galaxy"."count_jobs"() FROM "public";
CREATE FUNCTION "galaxy"."count_histories"() RETURNS integer LANGUAGE sql AS $$ SELECT count(*)::integer FROM "galaxy"."histories" $$;
REVOKE EXECUTE ON FUNCTION "galaxy"."count_histories"() FROM GROUP PUBLIC;`,
      },
    ])

    expect(found).toEqual([])
  })

  // PUBLIC's grant is a grant of its own, which a revoke from the roles that
  // inherit it leaves in place.
  it('does not take a revoke that leaves PUBLIC out as covering', () => {
    const found = routinesNotRevokedFromPublic([
      {
        name: '20270101000000_counts',
        sql: `CREATE FUNCTION "galaxy"."count_jobs"() RETURNS integer LANGUAGE sql AS $$ SELECT count(*)::integer FROM "galaxy"."jobs" $$;
REVOKE EXECUTE ON FUNCTION "galaxy"."count_jobs"() FROM anon, authenticated;
CREATE FUNCTION "galaxy"."count_histories"() RETURNS integer LANGUAGE sql AS $$ SELECT count(*)::integer FROM "galaxy"."histories" $$;
REVOKE ALL ON ALL ROUTINES IN SCHEMA "galaxy" FROM anon, authenticated;`,
      },
    ])

    expect(found).toEqual([
      { migration: '20270101000000_counts', routine: 'galaxy.count_jobs' },
      { migration: '20270101000000_counts', routine: 'galaxy.count_histories' },
    ])
  })

  it('does not take a revoke of the grant option alone as covering', () => {
    const found = routinesNotRevokedFromPublic([
      {
        name: '20270101000000_count_jobs',
        sql: `CREATE FUNCTION "galaxy"."count_jobs"() RETURNS integer LANGUAGE sql AS $$ SELECT count(*)::integer FROM "galaxy"."jobs" $$;
REVOKE GRANT OPTION FOR EXECUTE ON FUNCTION "galaxy"."count_jobs"() FROM PUBLIC;`,
      },
    ])

    expect(found).toEqual([{ migration: '20270101000000_count_jobs', routine: 'galaxy.count_jobs' }])
  })

  // A statement in a routine's body runs when the routine is called, not when
  // the migration does.
  it('does not read a routine\'s body as statements of the migration', () => {
    const found = routinesNotRevokedFromPublic([
      {
        name: '20270101000000_count_jobs',
        sql: `CREATE FUNCTION "galaxy"."count_jobs"() RETURNS integer LANGUAGE plpgsql AS $body$
BEGIN
  PERFORM pg_advisory_xact_lock(1);
  REVOKE EXECUTE ON FUNCTION "galaxy"."count_jobs"() FROM PUBLIC;
  RETURN (SELECT count(*)::integer FROM "galaxy"."jobs");
END;
$body$;`,
      },
    ])

    expect(found).toEqual([{ migration: '20270101000000_count_jobs', routine: 'galaxy.count_jobs' }])
  })

  it('does not read a comment or a string as a statement', () => {
    const found = routinesNotRevokedFromPublic([
      {
        name: '20270101000000_count_jobs',
        sql: `CREATE FUNCTION "galaxy"."count_jobs"() RETURNS integer LANGUAGE sql AS $$ SELECT count(*)::integer FROM "galaxy"."jobs" $$;
-- Counts the jobs; REVOKE EXECUTE ON FUNCTION "galaxy"."count_jobs"() FROM PUBLIC; once created.
/* Counts the jobs; REVOKE EXECUTE ON FUNCTION "galaxy"."count_jobs"() FROM PUBLIC; once created. */
COMMENT ON FUNCTION "galaxy"."count_jobs"() IS 'Counts the jobs; REVOKE EXECUTE ON FUNCTION "galaxy"."count_jobs"() FROM PUBLIC; once created.';`,
      },
    ])

    expect(found).toEqual([{ migration: '20270101000000_count_jobs', routine: 'galaxy.count_jobs' }])
  })
})
