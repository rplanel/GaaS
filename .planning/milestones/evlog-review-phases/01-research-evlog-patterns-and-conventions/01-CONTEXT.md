# Phase 1: Research evlog Patterns and Conventions - Context

**Gathered:** 2026-08-05
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase establishes the evlog usage patterns, conventions, and integration best practices that will guide Phase 2's review, specification, fixes, and verification of the `feat/evlog` branch. The output is a research-backed logging conventions document plus a review checklist, not the actual code fixes.

</domain>

<decisions>
## Implementation Decisions

### Convention authority and research scope

- **D-01:** Research can propose refinements to the existing AGENTS.md logging conventions, but no convention change is automatically adopted. Every conflict or refinement must be explicitly documented. — **Reversibility:** reversible — Phase 1 output is documentation; final conventions are not committed until Phase 2.
- **D-02:** Phase 1 output must include an explicit "Changes from AGENTS.md" delta section wherever research refines an existing convention, so downstream agents can see exactly what shifted and why. — **Reversibility:** reversible — documentation-only change.
- **D-03:** No AGENTS.md logging principle is treated as automatically locked. Research must document each conflict and recommendation, but final decisions on conflicts are deferred to Phase 2. — **Reversibility:** reversible — decision authority is deferred, not fixed.
- **D-04:** Phase 2 makes the final call on every documented conflict or refinement. Phase 1's job is to surface conflicts, not resolve them. — **Reversibility:** reversible — workflow decision, no code impact.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level requirements and conventions
- `/home/rplanel/projects/gaas/AGENTS.md` — project-level logging conventions and stack constraints (use evlog everywhere, no secrets, structured context, Effect bridge)
- `/home/rplanel/projects/gaas/.planning/REQUIREMENTS.md` — v1 requirements mapped to Phase 1 and Phase 2
- `/home/rplanel/projects/gaas/.planning/ROADMAP.md` — phase goals, success criteria, and dependency graph
- `/home/rplanel/projects/gaas/.planning/PROJECT.md` — project context, active requirements, and constraints

### Codebase context
- `/home/rplanel/projects/gaas/.planning/codebase/ARCHITECTURE.md` — system overview, request-scoped logging bridge, layer boundaries
- `/home/rplanel/projects/gaas/.planning/codebase/INTEGRATIONS.md` — environment variables/secrets, monitoring/observability, scheduled tasks
- `/home/rplanel/projects/gaas/.planning/codebase/STACK.md` — exact dependency versions including `evlog ^2.22.3`

### Existing evlog integration code
- `/home/rplanel/projects/gaas/packages/nuxt-galaxy/src/runtime/server/utils/evlog-effect.ts` — Effect→evlog bridge (`runGalaxyEffect`, `runTaskEffect`, `evlogEffectLogger`)
- `/home/rplanel/projects/gaas/packages/nuxt-galaxy/src/log-options.ts` — module-level log option resolver
- `/home/rplanel/projects/gaas/packages/nuxt-galaxy/src/runtime/server/plugins/evlog.server.ts` — Nitro plugin that registers the evlog FS drain
- `/home/rplanel/projects/gaas/packages/nuxt-galaxy/src/runtime/server/utils/evlog-drain.ts` — FS drain registration helper
- `/home/rplanel/projects/gaas/packages/nuxt-galaxy/src/module.ts` — evlog/nuxt module installation and runtime config wiring

### External reference
- `/home/rplanel/.local/share/opencode/repos/github.com/HugoRCD/evlog` — vendored evlog repository (read-only reference for patterns and conventions)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable assets
- `runGalaxyEffect` / `runTaskEffect` in `packages/nuxt-galaxy/src/runtime/server/utils/evlog-effect.ts` — existing bridge that routes `Effect.log*` calls into the request-scoped evlog logger via `AsyncLocalStorage`.
- `resolveLogOptions` in `packages/nuxt-galaxy/src/log-options.ts` — resolves module log configuration (levels, file drain, pretty, redact).
- `registerEvlogFsDrain` in `packages/nuxt-galaxy/src/runtime/server/utils/evlog-drain.ts` — registers the file-system drain on the Nitro `evlog:drain` hook.
- `evlog.server.ts` Nitro plugin — bootstraps the FS drain from runtime config.

### Established patterns
- **Request-scoped logging:** Server handlers use `const log = useLogger(event)`; Effect programs run inside `evlogAsyncStorage.run(requestLog, ...)` so their logs attach to the request.
- **Severity mapping:** `mapEffectLogLevel` maps Effect labels (`ERROR`/`FATAL` → error, `WARN` → warn, `DEBUG` → debug, default → info).
- **Debug fallback:** `useLogger` has no native `debug` method; current code casts to `RequestLogWithDebug` and falls back to `info`. This is a tension point for Phase 1 research.
- **Structured context:** evlog expects `{ message, ...context }` objects; the bridge builds context from Effect spans, annotations, and causes.
- **Layer direction:** Logging changes must respect `@gaas/wiki` → `@gaas/ui` → `nuxt-galaxy` → `blendtype`; downstream layers must not import upstream internals.
- **Secret redaction:** `redact: !isDev` in `resolveLogOptions` turns on evlog redaction outside development; this interacts with the AGENTS.md "never log secrets" rule.

### Integration points
- Server API handlers (`packages/nuxt-galaxy/src/runtime/server/api/**/*.ts`) — wrap Galaxy/DB Effects with `runGalaxyEffect`.
- Scheduled tasks (`packages/nuxt-galaxy/src/runtime/server/tasks/**/*.ts`) — wrap Effects with `runTaskEffect` using a `createRequestLogger`-spawned task logger.
- Client composables (`packages/nuxt-galaxy/src/runtime/app/composables/**/*.ts`, `packages/ui/...`) — use auto-imported `log` from `evlog/client`.
- Module lifecycle (`packages/nuxt-galaxy/src/module.ts`, seed/migrate libs) — uses `createRequestLogger` or `initLogger`/`log` from `evlog`.
- Effect programs in `blendtype` and `nuxt-galaxy` server utilities — produce logs consumed by the bridge.

</code_context>

<specifics>
## Specific Ideas

- The `feat/evlog` branch already contains substantial evlog integration; research should focus on identifying gaps between the vendored evlog patterns and the branch's current implementation, not on whether to use evlog.
- Current code contains `console.log` / `console.warn` / `console.error` usages outside the evlog integration (e.g., in `packages/ui/`, `packages/wiki/`, `packages/blendtype/src/galaxy.ts` docs comment, tests). Phase 1 research should clarify whether the conventions apply only to runtime code touched by `feat/evlog` or to the whole monorepo (note: AGENTS.md says "all Nuxt/Nitro server routes, scheduled tasks, client composables, and module lifecycle events").

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 1-Research evlog Patterns and Conventions*
*Context gathered: 2026-08-05*
