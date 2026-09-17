# Phase 2: Review, Spec, and Fix evlog Integration - Context

**Gathered:** 2026-08-05
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase reviews the `feat/evlog` branch against the conventions and checklist produced in Phase 1, produces a final logging spec, fixes incorrect/missing/inconsistent logging patterns, and verifies that `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass. The output is a corrected branch plus the authoritative logging spec document.

</domain>

<decisions>
## Implementation Decisions

### Console.* cleanup scope

- **D-01:** Phase 2 will replace raw `console.log` / `console.warn` / `console.error` anywhere they appear in runtime code across the monorepo (server routes, scheduled tasks, client composables, module lifecycle), not only in files touched by `feat/evlog`. Tests and build scripts are exempt unless a specific case is flagged during review. — **Reversibility:** costly — touches many files outside the branch and may reveal patterns that need their own fixes.

### AGENTS.md convention authority

- **D-02:** Keep `AGENTS.md` logging guidance at a high level. Do not fold the detailed spec into `AGENTS.md`. Instead, add a minimal pointer in `AGENTS.md` to the new `.planning/LOGGING-SPEC.md`, and document all refinements, deviations, and detailed conventions in the spec. — **Reversibility:** reversible — text edits in two files.

### Review strategy

- **D-03:** Use a review-then-fix sequence. First produce a written findings report (audit) by scanning all files changed in `feat/evlog` plus the runtime files flagged by FIX-02. Then execute fixes in a second pass. — **Reversibility:** reversible — the audit artifact is documentation; fixes are separate commits.

### Debug logging path

- **D-04:** Implement a real debug path for `Effect.logDebug` instead of keeping the current `debug -> info` fallback. The implementation should use evlog's lower-level API or another supported mechanism so debug-level events are emitted correctly. — **Reversibility:** costly — changes the bridge contract and may shift log volume/behavior for debug-level Effects.

### Spec location and authority

- **D-05:** The final logging spec lives at `.planning/LOGGING-SPEC.md`. It becomes the authoritative reference for logging conventions; `AGENTS.md` points to it but is not replaced by it. — **Reversibility:** reversible — moving a markdown file is cheap.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level requirements and conventions
- `/home/rplanel/projects/gaas/AGENTS.md` — high-level project conventions; logging section will be updated with a pointer to the new spec
- `/home/rplanel/projects/gaas/.planning/PROJECT.md` — project context, active requirements, constraints
- `/home/rplanel/projects/gaas/.planning/REQUIREMENTS.md` — v1 requirements mapped to Phase 2 (REVW-*, SPEC-*, FIX-*, VERF-*)
- `/home/rplanel/projects/gaas/.planning/ROADMAP.md` — phase goals, success criteria, dependency graph

### Phase 1 research outputs
- `/home/rplanel/projects/gaas/.planning/phases/01-research-evlog-patterns-and-conventions/01-CONTEXT.md` — convention authority decisions (D-01 through D-04) and prior code context
- `/home/rplanel/projects/gaas/.planning/phases/01-research-evlog-patterns-and-conventions/EVLOG-CONVENTIONS.md` — researched conventions for the five GaaS surfaces
- `/home/rplanel/projects/gaas/.planning/phases/01-research-evlog-patterns-and-conventions/FEAT-EVLOG-REVIEW-CHECKLIST.md` — review checklist mapped to Phase 2 requirements
- `/home/rplanel/projects/gaas/.planning/phases/01-research-evlog-patterns-and-conventions/01-SKELETON.md` — end-to-end trace and architectural decisions

### Codebase context
- `/home/rplanel/projects/gaas/.planning/codebase/ARCHITECTURE.md` — system overview, request-scoped logging bridge, layer boundaries
- `/home/rplanel/projects/gaas/.planning/codebase/INTEGRATIONS.md` — environment variables/secrets, monitoring/observability, scheduled tasks
- `/home/rplanel/projects/gaas/.planning/codebase/CONVENTIONS.md` — existing codebase conventions
- `/home/rplanel/projects/gaas/.planning/codebase/STACK.md` — exact dependency versions including `evlog ^2.22.3`

### Existing evlog integration code
- `/home/rplanel/projects/gaas/packages/nuxt-galaxy/src/runtime/server/utils/evlog-effect.ts` — Effect→evlog bridge (`runGalaxyEffect`, `runTaskEffect`, `evlogEffectLogger`); debug path to be implemented here
- `/home/rplanel/projects/gaas/packages/nuxt-galaxy/src/log-options.ts` — module log option resolver
- `/home/rplanel/projects/gaas/packages/nuxt-galaxy/src/runtime/server/plugins/evlog.server.ts` — Nitro plugin that registers the evlog FS drain
- `/home/rplanel/projects/gaas/packages/nuxt-galaxy/src/runtime/server/utils/evlog-drain.ts` — FS drain registration helper
- `/home/rplanel/projects/gaas/packages/nuxt-galaxy/src/module.ts` — evlog/nuxt module installation and runtime config wiring

### External reference
- `/home/rplanel/.local/share/opencode/repos/github.com/HugoRCD/evlog` — vendored evlog repository for API patterns and debug-path options

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable assets
- `runGalaxyEffect` / `runTaskEffect` in `packages/nuxt-galaxy/src/runtime/server/utils/evlog-effect.ts` — existing bridge; debug fallback currently lives here and must be replaced.
- `resolveLogOptions` in `packages/nuxt-galaxy/src/log-options.ts` — resolves module log configuration; may need new debug-level wiring.
- `registerEvlogFsDrain` in `packages/nuxt-galaxy/src/runtime/server/utils/evlog-drain.ts` — FS drain registration helper.
- `evlog.server.ts` Nitro plugin — bootstraps the FS drain from runtime config.

### Established patterns
- **Request-scoped logging:** Server handlers use `const log = useLogger(event)`; Effect programs run inside `evlogAsyncStorage.run(requestLog, ...)` so their logs attach to the request.
- **Severity mapping:** `mapEffectLogLevel` maps Effect labels (`ERROR`/`FATAL` → error, `WARN` → warn, `DEBUG` → debug, default → info). The debug branch currently falls back to `info` because `useLogger` lacks a `debug` method.
- **Structured context:** evlog expects `{ message, ...context }` objects; the bridge builds context from Effect spans, annotations, and causes.
- **Layer direction:** Logging changes must respect `@gaas/wiki` → `@gaas/ui` → `nuxt-galaxy` → `blendtype`; downstream layers must not import upstream internals.
- **Secret redaction:** `redact: !isDev` in `resolveLogOptions` turns on evlog redaction outside development.

### Integration points
- Server API handlers (`packages/nuxt-galaxy/src/runtime/server/api/**/*.ts`) — wrap Galaxy/DB Effects with `runGalaxyEffect`.
- Scheduled tasks (`packages/nuxt-galaxy/src/runtime/server/tasks/**/*.ts`) — wrap Effects with `runTaskEffect` using a `createRequestLogger`-spawned task logger.
- Client composables (`packages/nuxt-galaxy/src/runtime/app/composables/**/*.ts`, `packages/ui/...`) — use auto-imported `log` from `evlog/client`.
- Module lifecycle (`packages/nuxt-galaxy/src/module.ts`, seed/migrate libs) — uses `createRequestLogger` or `initLogger`/`log` from `evlog`.
- Effect programs in `blendtype` and `nuxt-galaxy` server utilities — produce logs consumed by the bridge.

</code_context>

<specifics>
## Specific Ideas

- The final spec should be written at `.planning/LOGGING-SPEC.md` and should consolidate the Phase 1 conventions into the authoritative project reference.
- `AGENTS.md` should receive only a minimal pointer update (one paragraph or link) to avoid duplicating detailed guidance.
- The debug-path implementation should be the first fix task because other log-level fixes may depend on it.
- The review audit should explicitly note every file that has raw `console.*` outside `feat/evlog` so the cleanup scope is visible.

</specifics>

<deferred>
## Deferred Ideas

- **ADOPT-01 / ADOPT-02:** Broader evlog adoption across the whole monorepo and log-based CI observability checks are deferred to a future milestone, per `REQUIREMENTS.md` v2.
- Replacing evlog with another logging library is out of scope.
- Release/changelog generation is out of scope.

</deferred>

---

*Phase: 2-Review, Spec, and Fix evlog Integration*
*Context gathered: 2026-08-05*
