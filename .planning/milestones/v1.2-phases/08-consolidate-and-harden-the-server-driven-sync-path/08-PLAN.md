---
phase: 08-consolidate-and-harden-the-server-driven-sync-path
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analyses.ts
  - packages/nuxt-galaxy/src/runtime/server/db/migrations/<timestamp>_sync_attempts_and_lock_function/migration.sql
  - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts
  - packages/nuxt-galaxy/src/runtime/types/database.ts
  - packages/nuxt-galaxy/test/server/utils/grizzle/sync/lock.test.ts
autonomous: false
requirements:
  - REFACTOR-02
  - REFACTOR-03
user_setup: []
estimate:
  tokens: 45000
  raw_tokens: 30000
  tasks: 3
  confidence: low
must_haves:
  truths:
    - The analyses table exposes sync_attempts, last_sync_error_at, and next_sync_at columns.
    - A PostgreSQL RPC function galaxy.acquire_sync_lock exists and performs an atomic upsert with expired-lock reclaim.
    - acquireSyncLock invokes supabase.rpc('acquire_sync_lock', { analysis_id, ttl_seconds }) and returns the boolean result.
    - The generated migration is pushed to the database before any later plan relies on the new columns or function.
  artifacts:
    - packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analyses.ts
    - packages/nuxt-galaxy/src/runtime/server/db/migrations/<timestamp>_sync_attempts_and_lock_function/migration.sql
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts
    - packages/nuxt-galaxy/test/server/utils/grizzle/sync/lock.test.ts
  key_links:
    - RPC function signature must match the supabase.rpc call in lock.ts.
    - Drizzle schema columns must match the migration ALTER TABLE statements.
    - Generated Database types must include the new analyses columns.
  prohibitions:
    - Do not leave a read-delete-insert lock implementation in place after this plan.
    - Do not manually invent migration directory names; generate via drizzle-kit and add custom SQL to the generated file.
    - Do not expose raw Postgres error messages outside server logs.
---

<objective>
Implement the one-way schema changes that underpin Phase 8: add sync-attempt tracking columns to the analyses table and replace the read-delete-insert lock acquisition with an atomic PostgreSQL function called through supabase.rpc. This is the tracer slice for the hardened server-driven sync path.

Purpose: Without atomic lock acquisition and sync-attempt tracking, concurrent scheduled-task runs can produce duplicate workers and transient failures cannot be retried with backoff. This plan wires the database layer and proves the lock path end-to-end.
Output: A pushed migration, an RPC-based lock helper, and a unit test verifying the RPC contract.
</objective>

<execution_context>
@/home/rplanel/.config/opencode/gsd-core/workflows/execute-plan.md
@/home/rplanel/.config/opencode/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/STATE.md
@.planning/phases/08-consolidate-and-harden-the-server-driven-sync-path/08-CONTEXT.md
@.planning/phases/08-consolidate-and-harden-the-server-driven-sync-path/08-PATTERNS.md
@.planning/LOGGING-SPEC.md

@packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analyses.ts
@packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts
@packages/nuxt-galaxy/drizzle.config.ts
@packages/nuxt-galaxy/package.json
</context>

<tasks>

<task type="checkpoint:decision" gate="blocking">
  <name>Checkpoint: confirm D-01 / D-04 one-way migration approach</name>
  <read_first>
    - .planning/phases/08-consolidate-and-harden-the-server-driven-sync-path/08-CONTEXT.md (Decisions section)
    - .planning/REQUIREMENTS.md (REFACTOR-02, REFACTOR-03)
  </read_first>
  <decision>Proceed with the one-way database migrations for D-01 (atomic sync_lock RPC function) and D-04 (analyses sync_attempts / last_sync_error_at / next_sync_at columns).</decision>
  <context>Both decisions require Drizzle migrations that alter the live schema. Rolling back would need additional migrations rather than a simple revert, so the human operator must acknowledge the direction before the implementing task runs.</context>
  <options>
    <option id="proceed">
      <name>Proceed</name>
      <pros>Matches the locked Phase 8 design; enables atomic locks and retry tracking.</pros>
      <cons>One-way: schema rollback requires future migration work.</cons>
    </option>
    <option id="abort">
      <name>Abort</name>
      <pros>Avoids schema changes.</pros>
      <cons>Phase 8 cannot deliver REFACTOR-02 or REFACTOR-03.</cons>
    </option>
  </options>
  <resume-signal>Type "proceed" to authorize the migrations, or "abort" to stop Phase 8.</resume-signal>
  <acceptance_criteria>Human explicitly confirms proceed or abort.</acceptance_criteria>
</task>

<task type="tracer">
  <name>Tracer: add sync-attempt columns and atomic lock RPC</name>
  <precondition>Local Supabase is running or can be started so supabase:generate:types can complete.</precondition>
  <read_first>
    - packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analyses.ts
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts
    - packages/nuxt-galaxy/src/runtime/server/db/migrations/20260722205417_analysis_files_dataset_owner_select/migration.sql (custom SQL migration pattern)
    - packages/nuxt-galaxy/drizzle.config.ts
    - .planning/phases/08-consolidate-and-harden-the-server-driven-sync-path/08-PATTERNS.md (lock.ts and analyses.ts pattern assignments)
  </read_first>
  <files>
    packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analyses.ts
    packages/nuxt-galaxy/src/runtime/server/db/migrations/<timestamp>_sync_attempts_and_lock_function/migration.sql
    packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts
    packages/nuxt-galaxy/test/server/utils/grizzle/sync/lock.test.ts
  </files>
  <action>
    1. Append three columns to the analyses table schema per D-04: syncAttempts integer('sync_attempts').default(0).notNull(), lastSyncErrorAt timestamp('last_sync_error_at', { withTimezone: true }), nextSyncAt timestamp('next_sync_at', { withTimezone: true }).
    2. Run pnpm --filter ./packages/nuxt-galaxy drizzle:generate to create a new timestamped migration directory under src/runtime/server/db/migrations/. Open the generated migration.sql and append custom SQL that adds the columns with IF NOT EXISTS and creates or replaces the PostgreSQL function galaxy.acquire_sync_lock(analysis_id integer, ttl_seconds integer) returning boolean. The function must atomically INSERT INTO galaxy.sync_locks(analysis_id, locked_at, expires_at) VALUES(analysis_id, now(), now() + ttl_seconds seconds) ON CONFLICT (analysis_id) DO UPDATE SET locked_at = EXCLUDED.locked_at, expires_at = EXCLUDED.expires_at WHERE galaxy.sync_locks.expires_at <= now(); return true when a row is inserted/updated, false otherwise.
    3. Rewrite acquireSyncLock in lock.ts to call supabase.rpc('acquire_sync_lock', { analysis_id: analysisId, ttl_seconds: ttlSeconds }). Preserve the existing SyncLockError tagged error, log annotation, and return type Effect.Effect&lt;boolean, SyncLockError, never>. Remove all prior select/delete/insert logic.
    4. Create or update packages/nuxt-galaxy/test/server/utils/grizzle/sync/lock.test.ts with a test that supplies a mocked SupabaseClient where rpc returns { data: true, error: null }, invokes acquireSyncLock(supabase, 1, 900), and asserts that rpc was called with 'acquire_sync_lock' and the exact parameter object { analysis_id: 1, ttl_seconds: 900 }.
    5. Regenerate Supabase types by running pnpm --filter ./packages/nuxt-galaxy supabase:generate:types and confirm that the Database type includes the new analyses columns.
  </action>
  <verify>
    <automated>pnpm --filter ./packages/nuxt-galaxy test:server -- --run test/server/utils/grizzle/sync/lock.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - lock.ts contains no select/from/delete/insert logic for sync_locks; it calls supabase.rpc('acquire_sync_lock', ...) exactly once.
    - The generated migration.sql includes ALTER TABLE galaxy.analyses ADD COLUMN IF NOT EXISTS for sync_attempts, last_sync_error_at, and next_sync_at, plus CREATE OR REPLACE FUNCTION galaxy.acquire_sync_lock(...).
    - packages/nuxt-galaxy/src/runtime/types/database.ts reflects the three new analyses columns after type generation.
    - The lock test passes and verifies the RPC parameter shape.
  </acceptance_criteria>
  <done>Schema migration created, lock acquisition is RPC-based, and the lock test passes.</done>
  <reversibility rating="one-way">Adding columns and a PostgreSQL function requires future migrations to undo.</reversibility>
</task>

<task type="auto">
  <name>[BLOCKING] Push schema migration to the database</name>
  <precondition>Local Supabase is running (pnpm supabase:start) so drizzle-kit push can reach the database.</precondition>
  <read_first>
    - packages/nuxt-galaxy/drizzle.config.ts
    - packages/nuxt-galaxy/package.json (scripts section)
  </read_first>
  <files>
  </files>
  <action>
    Run the Drizzle schema push command against the configured database. Prefer the non-TTY workaround: CI=true pnpm --filter ./packages/nuxt-galaxy drizzle-kit push. If drizzle-kit is not directly available, use pnpm --filter ./packages/nuxt-galaxy db:push or pnpm --filter ./packages/nuxt-galaxy drizzle:migrate, whichever script exists in package.json. Capture the command output and confirm the migration is applied without interactive prompts. If the CLI blocks for input, stop and convert this task into a human-assisted push before continuing.
  </action>
  <verify>
    <automated>CI=true pnpm --filter ./packages/nuxt-galaxy drizzle-kit push</automated>
  </verify>
  <acceptance_criteria>
    - The push command exits with status code 0.
    - stdout contains evidence that the latest migration was applied (e.g., "Done" or a list including the timestamped migration directory name).
    - No unhandled interactive prompt occurs; if one does, the plan becomes non-autonomous and requires human intervention.
  </acceptance_criteria>
  <done>Database schema matches the committed migration; new columns and RPC function are live.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Scheduled task → Supabase DB | The sync task calls the new RPC across this boundary; the RPC must be atomic to avoid race windows. |
| Server logs → operator | Lock acquisition failures are logged; raw Postgres errors must not leak. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-08-01-01 | Tampering | acquireSyncLock / galaxy.acquire_sync_lock | high | mitigate | Implement atomic INSERT ... ON CONFLICT ... WHERE expired in the RPC; remove the old select/delete/insert path so concurrent workers cannot both acquire the lock. |
| T-08-01-02 | Information Disclosure | lock.ts error messages | medium | mitigate | Return a generic SyncLockError message to Effect callers; log the original error detail server-side only. |
| T-08-01-03 | Denial of Service |galaxy.acquire_sync_lock caller | low | mitigate | The RPC is only invoked by the scheduled task and is bounded by TTL; no retry loop exists in lock acquisition itself. |
| T-08-01-SC | Tampering | npm/pip/cargo installs | low | accept | No new packages are installed in this plan; existing dependency legitimacy was validated in prior phases. |
</threat_model>

<verification>
- The lock unit test passes.
- The Drizzle push command exits 0 and the migration is applied.
- A grep of lock.ts confirms no read-delete-insert logic remains.
- The generated Database types include the new analyses columns.
</verification>

<success_criteria>
- analyses table has sync_attempts, last_sync_error_at, and next_sync_at columns.
- galaxy.acquire_sync_lock RPC function exists and performs atomic upsert with expired-lock reclaim.
- acquireSyncLock uses supabase.rpc('acquire_sync_lock', ...) and returns the boolean result.
- Schema push completes without interactive prompts.
</success_criteria>

<artifacts_this_phase_produces>
This plan creates the following symbols and files:
- Table columns: analyses.sync_attempts, analyses.last_sync_error_at, analyses.next_sync_at
- PostgreSQL function: galaxy.acquire_sync_lock(analysis_id integer, ttl_seconds integer) returns boolean
- Drizzle migration directory: packages/nuxt-galaxy/src/runtime/server/db/migrations/<timestamp>_sync_attempts_and_lock_function/
- Rewritten function: acquireSyncLock(supabase, analysisId, ttlSeconds) in packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts
- Updated generated types: packages/nuxt-galaxy/src/runtime/types/database.ts
- New test file: packages/nuxt-galaxy/test/server/utils/grizzle/sync/lock.test.ts
</artifacts_this_phase_produces>

<output>
Create `.planning/phases/08-consolidate-and-harden-the-server-driven-sync-path/08-01-SUMMARY.md` when done.
</output>
