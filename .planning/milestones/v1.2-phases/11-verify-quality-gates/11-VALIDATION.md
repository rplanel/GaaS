---
phase: 11
slug: verify-quality-gates
# status lifecycle: draft (seeded by plan-phase) -> validated (set by validate-phase §5)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-08-10
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Lint framework** | ESLint ^9.39.1 with `@antfu/eslint-config@^6.7.1` |
| **Type-check framework** | TypeScript ^5.9.3, `vue-tsc` ^3.1.5 for Nuxt packages, `tsc` for `blendtype` |
| **Test framework** | Vitest ^4.1.0 |
| **Lint config file** | `eslint.config.mjs` |
| **Type-check config** | Package `tsconfig.json` files; no dedicated `typecheck` config file |
| **Test config files** | Root `vitest.config.ts`; per-package `vitest.config.ts`; `packages/nuxt-galaxy/vitest.config.server.ts` |
| **Quick run command** | `pnpm lint` / `pnpm typecheck` / `pnpm --filter ./packages/<name> test` |
| **Full suite command** | `pnpm lint && pnpm typecheck && pnpm test` |
| **Estimated runtime** | ~30 seconds total (~1 s lint, ~8 s typecheck, ~20 s test) |

---

## Sampling Rate

- **After Task 1 (tracer) commit:** Run `pnpm lint` followed by `pnpm typecheck` to identify the first failing gate. Do not run `pnpm test` until the type error is fixed, because `blendtype`'s test script internally runs `pnpm typecheck` and would fail for the same reason.
- **After Task 2 (`@ts-expect-error` workaround) commit:** Run `pnpm lint && pnpm typecheck` to confirm the workaround suppresses the single TypeScript diagnostic without introducing lint warnings.
- **After Task 3 (verification report) commit:** Run the full root gate sequence `pnpm lint && pnpm typecheck && pnpm test` and record the results in `11-VERIFICATION.md`.
- **Before `/gsd-verify-work`:** Full suite must be green.
- **Max feedback latency:** 60 seconds per gate sampling.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | VERIFY-01, VERIFY-02, VERIFY-03 | T-11-01 | Capture gate diagnostics without leaking secrets | lint/type discovery | `pnpm lint && pnpm typecheck` | ✅ | ⬜ pending |
| 11-01-02 | 01 | 1 | VERIFY-02 | T-11-02 | Use `@ts-expect-error` (not `@ts-ignore`) so the suppression becomes a build failure if upstream fixes typed-route generation | typecheck | `pnpm lint && pnpm typecheck` | ✅ | ⬜ pending |
| 11-01-03 | 01 | 1 | VERIFY-01, VERIFY-02, VERIFY-03 | T-11-01 | Record command, exit code, timing, and test counts; omit full output unless a gate fails | full gate run | `pnpm lint && pnpm typecheck && pnpm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements:

- Root `package.json` already defines `lint`, `typecheck`, and `test`.
- Root `vitest.config.ts` already configures `pool: 'threads'`.
- Package `package.json` files already define per-package lint/typecheck/test scripts.
- No new test files, fixtures, or dependencies are required for this verification-only phase.

Therefore, Wave 0 is complete.

---

## Manual-Only Verifications

All phase behaviors have automated verification. No manual-only checks are required.

---

## Workaround Validation Note

The only code change in this phase is a single-line `// @ts-expect-error` comment placed immediately before the `$fetch` call in `packages/ui/app/pages/analyses/[analysisId].vue`. Validation must confirm:

1. The comment exists and contains a descriptive suffix referencing the Nitro typed-route omission (e.g., `param-in-middle`, `Nitro`, or `layer-generated`).
2. The `$fetch` call on the following line retains `{ method: 'POST' }` and the same URL template.
3. `pnpm typecheck` exits 0 after the comment is added.
4. `pnpm lint` does not flag the comment.
5. `pnpm test` still passes all 468 tests.

Because `@ts-expect-error` is used instead of `@ts-ignore`, the suppression will become a TypeScript error if a future Nuxt/Nitro upgrade starts generating the missing route type. That failure will signal that the workaround can be removed.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [ ] Feedback latency < 60 s
- [ ] `nyquist_compliant: true` set in frontmatter (to be set by validate-phase)

**Approval:** pending
