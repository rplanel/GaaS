# Roadmap: GaaS evlog Integration Review

**Created:** 2026-08-04
**Project:** GaaS — Galaxy as a Service
**Core Value:** Developers can reliably build, deploy, and operate custom Galaxy-powered web interfaces with clear observability, because structured logging makes runtime behavior understandable to both humans and LLMs.

## Phases

### Phase 1: Research evlog Patterns and Conventions ✓ Complete

**Goal:** Establish the evlog usage patterns, conventions, and integration best practices that will guide the review and fixes.
**Mode:** mvp
**Plans:** 1/1 plans executed

- [x] 01-01-PLAN.md

**Plan list:**

- [x] `01-01-PLAN.md` — Trace one server route end-to-end, research all five logging surfaces, and produce the conventions document plus review checklist.

**Success Criteria**:

1. Key evlog APIs and conventions are documented (server logger, client logger, request-scoped storage, Effect bridge).
2. Expected log shapes, context fields, and severity levels are defined for server routes, scheduled tasks, client composables, module lifecycle, and Effect programs.
3. A clear checklist exists for reviewing the `feat/evlog` branch.

**Requirements:**

- RSCH-01

### Phase 2: Review, Spec, and Fix evlog Integration

**Goal:** Review the `feat/evlog` branch against the researched conventions, write the logging spec, fix issues, and verify quality gates pass.
**Mode:** mvp
**Plans:** 5/5 plans executed

- [x] 02-01-PLAN.md — Tracer: audit report + Effect→evlog debug path + nuxt-galaxy gates
- [x] 02-02-PLAN.md — Replace raw `console.*` in `@gaas/ui` composables
- [x] 02-03-PLAN.md — Replace raw `console.*` in `@gaas/ui` components and header utilities
- [x] 02-04-PLAN.md — Fix `@gaas/wiki` build-time logging and update `AGENTS.md` pointer
- [x] 02-05-PLAN.md — Author `LOGGING-SPEC.md`, run secrets/boundary audits, root quality gates

**Success Criteria**:

1. Every file changed in `feat/evlog` has been reviewed for correct evlog usage.
2. A logging conventions document exists and covers server routes, tasks, client composables, module lifecycle, and Effect programs.
3. No secrets are logged anywhere in the reviewed code.
4. All identified incorrect, missing, or inconsistent logging patterns are fixed.
5. `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass on the branch.

**Requirements:**

- REVW-01, REVW-02, REVW-03
- SPEC-01, SPEC-02
- FIX-01, FIX-02, FIX-03
- VERF-01, VERF-02, VERF-03

## Dependency Graph

```text
Phase 1 ──► Phase 2
  Research   Review / Spec / Fix / Verify
```

## Coverage

- v1 requirements: 11
- Mapped to phases: 11
- Unmapped: 0 ✓

---
*Roadmap created: 2026-08-04*
*Last updated: 2026-08-05 after Phase 2 verification*
