# Phase 6: Audit and Freeze the Sync Contract - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-07
**Phase:** 06-Audit and Freeze the Sync Contract
**Areas discussed:** Audit deliverable shape and location, Legacy Drizzle sync helpers disposition, Gap triage rule, Freeze / sign-off mechanism

---

## Audit deliverable shape and location

| Option | Description | Selected |
|--------|-------------|----------|
| Single contract doc | One file containing inventory, canonical contract, and gap list. | |
| Split docs | Three separate files for inventory, contract, and gaps. | |
| Contract + inline comments | One contract doc plus code comments marking legacy call sites and gaps directly. | ✓ |

**User's choice:** Contract + inline comments
**Notes:** Follow-up question confirmed a Mermaid sequence diagram in the contract and a mirror under `docs/` for team reference.

---

## Audit diagram and location

| Option | Description | Selected |
|--------|-------------|----------|
| Mermaid diagram + .planning only | Include diagram, keep under `.planning/phases/06/` only. | |
| Mermaid diagram + docs mirror | Include diagram and mirror a reader-friendly version under `docs/`. | ✓ |
| Text-only + .planning only | No diagram, fastest to produce. | |

**User's choice:** Mermaid diagram + docs mirror
**Notes:** None

---

## Legacy Drizzle sync helpers disposition

| Option | Description | Selected |
|--------|-------------|----------|
| Keep as reference, delete in Phase 8 | Leave legacy helpers in place during the audit; note them as to be removed in Phase 8. | ✓ |
| Mark dead now, delete in Phase 8 | Add deprecation/dead-code comments now but do not delete. | |
| Delete now if tests allow | Attempt deletion during Phase 6 if no callers remain. | |

**User's choice:** Keep as reference, delete in Phase 8
**Notes:** None

---

## Gap triage rule

| Option | Description | Selected |
|--------|-------------|----------|
| Strict deferral | Phase 6 is documentation-only; every code change deferred. | |
| Allow trivial fixes | One-line observability fixes allowed in Phase 6; logic/schema/test changes deferred. | |
| Fix now if it improves observability | Any change that makes the audit easier to reason about allowed; broader refactors deferred. | ✓ |

**User's choice:** Fix now if it improves observability
**Notes:** None

---

## Complexity limit for in-phase fixes

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, line budget | Only ~5-line additive fixes allowed. | |
| Yes, surface limit | Only logging/annotation changes allowed. | |
| No hard limit | Use judgment; planner/executor scope each fix case by case. | ✓ |

**User's choice:** No hard limit
**Notes:** None

---

## Freeze / sign-off mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Context.md criteria + execution ACK | Lock decisions in CONTEXT.md for Phase 8 planning; explicit ACK before Phase 8 executes code changes. | ✓ |
| Context.md acceptance criteria only | Frozen when acceptance criteria are in CONTEXT.md; no separate ACK. | |
| Explicit ACK checkpoint | Require explicit approval before Phase 8 planning can start. | |

**User's choice:** Context.md criteria + execution ACK
**Notes:** User asked for advice first; recommended this option because Phase 8 will delete legacy code and change lock semantics, so a lightweight execution ACK reduces rework risk.

---

## the agent's Discretion

None — the user made explicit choices for all areas.

## Deferred Ideas

None — discussion stayed within Phase 6 scope.
