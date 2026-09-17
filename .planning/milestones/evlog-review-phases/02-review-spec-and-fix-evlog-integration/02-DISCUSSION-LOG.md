# Phase 2: Review, Spec, and Fix evlog Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-05
**Phase:** 02-Review, Spec, and Fix evlog Integration
**Areas discussed:** Scope of console.* cleanup, Adopt or defer AGENTS.md refinements, Review-then-fix vs review-and-fix-in-pass, Debug logging path, Spec location and authority

---

## Scope of console.* cleanup

| Option | Description | Selected |
|--------|-------------|----------|
| feat/evlog branch only | Replace console.* only in files changed by the feat/evlog branch. | |
| All runtime code now | Replace console.* everywhere it appears in runtime code across the monorepo, per AGENTS.md. Tests and build scripts exempt. | ✓ |
| Runtime code plus tests | Replace console.* in runtime code AND tests, but skip build scripts and doc comments. | |

**User's choice:** All runtime code now
**Notes:** Tests and build scripts are exempt unless a specific case is flagged during review.

---

## Adopt or defer AGENTS.md refinements

| Option | Description | Selected |
|--------|-------------|----------|
| Update AGENTS.md | Fold detailed spec into AGENTS.md; single source of truth. | |
| Keep AGENTS.md as-is | Document deviations only in the new spec; spec supersedes AGENTS.md for logging. | |
| Minimal AGENTS.md update | Add only a pointer/link in AGENTS.md; details live in the new spec. | ✓ |

**User's choice:** Minimal AGENTS.md update
**Notes:** User asked for elaboration on what the new logging spec would contain; after explanation, chose the minimal pointer approach.

---

## Review-then-fix vs review-and-fix-in-pass

| Option | Description | Selected |
|--------|-------------|----------|
| Review-then-fix | Produce a written findings report first, then fix in a second pass. | ✓ |
| Review-and-fix-in-pass | Review each file and fix immediately. | |
| Hybrid | Bucket issues quickly, fix by bucket, produce a short findings summary. | |

**User's choice:** Review-then-fix
**Notes:** A standalone audit artifact will be created before code fixes.

---

## Debug logging path

| Option | Description | Selected |
|--------|-------------|----------|
| Implement real debug path | Use evlog's lower-level API so Effect.logDebug emits real debug events. | ✓ |
| Document fallback | Keep debug->info fallback and document it as a known limitation. | |
| Suppress debug logs | Drop or gate Effect.logDebug output. | |

**User's choice:** Implement real debug path
**Notes:** May require changes to the bridge and log-options.

---

## Spec location and authority

| Option | Description | Selected |
|--------|-------------|----------|
| .planning/LOGGING-SPEC.md | Planning artifact; authoritative reference. | ✓ |
| docs/logging.md | Contributor-facing docs. | |
| Both | Authoritative spec in .planning plus lightweight docs summary. | |
| Update AGENTS.md only | Single source of truth inside AGENTS.md. | |

**User's choice:** .planning/LOGGING-SPEC.md
**Notes:** AGENTS.md will get a minimal pointer to this file per the earlier decision.

---

## Deferred Ideas

- Broader evlog adoption (ADOPT-01) and CI observability checks (ADOPT-02) remain v2/future milestones.
- Replacing evlog with another library remains out of scope.
- Release/changelog generation remains out of scope.
