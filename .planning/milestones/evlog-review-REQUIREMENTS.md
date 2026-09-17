# Requirements Archive: evlog-review GaaS evlog Integration Review

**Archived:** 2026-08-05
**Status:** SHIPPED

For current requirements, see `.planning/REQUIREMENTS.md`.

---

# Requirements: GaaS evlog Integration Review

**Defined:** 2026-08-04
**Core Value:** Developers can reliably build, deploy, and operate custom Galaxy-powered web interfaces with clear observability, because structured logging makes runtime behavior understandable to both humans and LLMs.

## v1 Requirements

### Research

- [x] **RSCH-01**: Research evlog patterns, conventions, and integration best practices from the vendored evlog repository and existing GaaS usage

### Review

- [x] **REVW-01**: Review every file changed in the `feat/evlog` branch for correct evlog usage, including server routes, scheduled tasks, client composables, module lifecycle, and Effect program execution
- [x] **REVW-02**: Verify that no secrets (Galaxy API keys, Supabase service keys, user tokens) are logged anywhere in the branch
- [x] **REVW-03**: Verify that logging respects package boundaries (e.g., `@gaas/wiki` does not import `nuxt-galaxy` internals for logging)

### Specification

- [x] **SPEC-01**: Produce a logging conventions document that defines when and how to use evlog across GaaS (server routes, tasks, client composables, module lifecycle, Effect programs)
- [x] **SPEC-02**: Document the expected log shape, context fields, and severity levels that make logs useful for both human operators and LLM analysis

### Fixes

- [x] **FIX-01**: Fix any incorrect, missing, or inconsistent logging patterns discovered during review
- [x] **FIX-02**: Replace any remaining `console.log`/`console.error` usage in the changed code with evlog-appropriate calls
- [x] **FIX-03**: Ensure `runGalaxyEffect` / `runTaskEffect` correctly route Effect logs into the request-scoped evlog logger

### Verification

- [x] **VERF-01**: `pnpm lint` passes on the branch after fixes
- [x] **VERF-02**: `pnpm typecheck` passes on the branch after fixes
- [x] **VERF-03**: `pnpm test` passes on the branch after fixes

## v2 Requirements

Deferred to future milestones.

### Broader adoption

- **ADOPT-01**: Roll evlog conventions to parts of the codebase not touched by `feat/evlog`
- **ADOPT-02**: Add log-based observability checks to CI (e.g., lint rule forbidding raw `console.*` in runtime code)

## Out of Scope

| Feature | Reason |
|---------|--------|
| New user-facing features unrelated to logging | This milestone is scoped to logging integration quality |
| Refactoring non-logging architecture (DB schema, Galaxy API client) | Keep changes focused on evlog integration |
| Replacing evlog with another logging library | The goal is to use evlog correctly |
| Release/changelog generation | Handled outside this review milestone |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| RSCH-01 | Phase 1 | Complete |
| REVW-01 | Phase 2 | Complete |
| REVW-02 | Phase 2 | Complete |
| REVW-03 | Phase 2 | Complete |
| SPEC-01 | Phase 2 | Complete |
| SPEC-02 | Phase 2 | Complete |
| FIX-01 | Phase 2 | Complete |
| FIX-02 | Phase 2 | Complete |
| FIX-03 | Phase 2 | Complete |
| VERF-01 | Phase 2 | Complete |
| VERF-02 | Phase 2 | Complete |
| VERF-03 | Phase 2 | Complete |

**Coverage:**

- v1 requirements: 11 total
- Mapped to phases: 11
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-04*
*Last updated: 2026-08-05 after completing Phase 2 plan 05 and marking REVW-02, REVW-03, SPEC-01, SPEC-02 complete*
