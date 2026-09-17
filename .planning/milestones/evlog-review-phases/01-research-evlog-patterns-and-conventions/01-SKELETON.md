# Phase 1 — Walking Skeleton: evlog End-to-End Trace

**Capability proven end-to-end:** A request to `/api/probe` emits one structured wide event via `useLogger(event)` → evlog Nitro integration → FS drain, capturing method, path, handler, request-scoped message, status, duration, service, and environment.

## Observed Wide Event

Request: `GET http://localhost:3000/api/probe`

Emitted file: `.evlog/logs/2026-08-05.jsonl` (path is relative to the Nitro process working directory)

```json
{
  "method": "GET",
  "path": "/api/probe",
  "requestId": "ceb39ee8-3d9c-4c4b-9dfe-75736a6ab4d0",
  "handler": "probe",
  "requestLogs": [
    {
      "level": "info",
      "message": "probe:ok",
      "timestamp": "2026-08-05T07:54:43.191Z"
    }
  ],
  "status": 200,
  "duration": "6ms",
  "timestamp": "2026-08-05T07:54:43.195Z",
  "level": "info",
  "service": "nuxt-galaxy",
  "environment": "development"
}
```

### Field provenance

| Field | Source |
|-------|--------|
| `method` | HTTP request method (evlog Nitro integration) |
| `path` | Request URL path (evlog Nitro integration) |
| `requestId` | Auto-generated per-request UUID (evlog) |
| `handler` | `log.set({ handler: 'probe' })` in `probe.get.ts` |
| `requestLogs[0].message` | `log.info('probe:ok')` in `probe.get.ts` |
| `status` | HTTP response status (evlog Nitro integration) |
| `duration` | Request duration (evlog Nitro integration) |
| `timestamp` / `level` / `service` / `environment` | evlog `initLogger` / `evlog/nuxt` defaults |

### Redaction note

`resolveLogOptions(nuxt.options.dev, moduleOptions.logs)` sets `redact: !isDev`. In development, redaction is **disabled**, so the wide event contains full context. In production builds (`!isDev === true`), evlog redaction is enabled.

## Architectural Decisions

| Decision | Rationale | Current Implementation |
|----------|-----------|------------------------|
| evlog as the single structured logger | Project convention; one wide event per request helps human operators and LLMs parse traces | `evlog/nuxt` installed in `packages/nuxt-galaxy/src/module.ts` |
| Server routes use `useLogger(event)` | Request-scoped logging is the canonical evlog pattern for Nitro/Nuxt | `packages/nuxt-galaxy/src/runtime/server/api/probe.get.ts` |
| Effect programs route through `runGalaxyEffect` / `runTaskEffect` | Keeps `Effect.log*` calls attached to the request or task logger via `AsyncLocalStorage` | `packages/nuxt-galaxy/src/runtime/server/utils/evlog-effect.ts` |
| Non-HTTP tasks/scripts use `createRequestLogger` | No H3 event exists for scheduled tasks; an explicit request logger provides operation scoping | `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts` |
| FS drain as default local destination | Simple, zero-dependency local observability for development and testing | `registerEvlogFsDrain` + `evlog.server.ts` Nitro plugin |
| Severity mapping for Effect logs | Effect `LogLevel` labels (`ERROR`, `FATAL`, `WARN`, `DEBUG`, default) map to evlog levels | `mapEffectLogLevel` in `evlog-effect.ts` |

## Stack Touched in Phase 1

- `packages/nuxt-galaxy/src/runtime/server/api/probe.get.ts`
- `packages/nuxt-galaxy/src/runtime/server/utils/evlog-effect.ts`
- `packages/nuxt-galaxy/src/runtime/server/utils/evlog-drain.ts`
- `packages/nuxt-galaxy/src/runtime/server/plugins/evlog.server.ts`
- `packages/nuxt-galaxy/src/log-options.ts`
- `packages/nuxt-galaxy/src/module.ts`

No production source code is modified by Phase 1; research is documentation-only.

## Out of Scope (Deferred to Phase 2)

- Code fixes or refactors on the `feat/evlog` branch
- Replacing remaining `console.log` / `console.warn` / `console.error` calls
- Adding audit logging for analysis create/delete or role changes
- External drains (Axiom, OTLP, Datadog, etc.)
- CI lint rules forbidding raw `console.*`
- Production redaction verification beyond the `redact: !isDev` configuration

## Subsequent Slice Plan

Phase 2 will use this skeleton and the conventions document to review every `feat/evlog` branch file for:

1. Correct API usage per surface (server routes, tasks, client composables, module lifecycle, Effect programs)
2. Secret redaction and no leakage of `GALAXY_API_KEY`, Supabase service keys, or user tokens
3. Package boundary compliance (`@gaas/wiki` → `@gaas/ui` → `nuxt-galaxy` → `blendtype`)
4. Severity and context-shape consistency
5. Passing `pnpm lint`, `pnpm typecheck`, and `pnpm test`

## Convention Authority and Delta Sections

### D-01 — Research may propose, not adopt

This skeleton may propose refinements to the existing AGENTS.md logging conventions, but no convention change is automatically adopted. Every conflict or refinement must be explicitly documented in `EVLOG-CONVENTIONS.md` under **Changes from AGENTS.md**.

### D-02 — Required "Changes from AGENTS.md" delta

`EVLOG-CONVENTIONS.md` must include an explicit delta section wherever research refines an existing convention. Phase 2 makes the final call on each documented conflict or refinement per D-03/D-04.

---

*Walking skeleton generated by exercising `/api/probe` through the playground dev server on 2026-08-05.*
