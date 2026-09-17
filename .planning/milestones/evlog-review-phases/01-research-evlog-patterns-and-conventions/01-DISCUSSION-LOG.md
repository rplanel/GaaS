# Phase 1: Research evlog Patterns and Conventions - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-05
**Phase:** 1-Research evlog Patterns and Conventions
**Areas discussed:** Convention authority

---

## Convention authority

### Initial scope selection

| Option | Description | Selected |
|--------|-------------|----------|
| Research scope | What sources should the research cover? | |
| Convention authority | If vendored evlog best practices conflict with AGENTS.md, which wins? | ✓ |
| Standardization strictness | Uniform log shapes vs context-specific shapes? | |
| Deliverable shape | Single doc vs split docs? | |

**User's choice:** Discuss "Convention authority"
**Notes:** User wanted to start with the decision-making authority question before defining research scope or output shape.

---

### Question 1: Handling conflicts between vendored evlog and AGENTS.md

| Option | Description | Selected |
|--------|-------------|----------|
| AGENTS.md wins | Keep existing AGENTS.md conventions locked; research only documents gaps. | |
| Research can refine | AGENTS.md principles stay, but research can refine implementation details. | ✓ |
| Document conflict, defer choice | Research records conflicts and trade-offs; Phase 2 decides case-by-case. | |

**User's choice:** Research can refine
**Notes:** Initial framing: AGENTS.md principles remain, but research can propose refinements to implementation details.

---

### Question 2: Documenting refinements

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit delta | Output includes a "Changes from AGENTS.md" section listing each refinement and rationale. | ✓ |
| Seamless update | Incorporate refinements directly without calling out changes. | |
| Decision log only | Record refinements in CONTEXT.md decisions; conventions doc stays focused on final recommendations. | |

**User's choice:** Explicit delta
**Notes:** User wants downstream agents to see exactly what shifted from the current AGENTS.md conventions.

---

### Question 3: Locked principles

| Option | Description | Selected |
|--------|-------------|----------|
| All four principles | Use evlog everywhere, no secrets, structured context, Effect bridge — fixed. | |
| Security + stack only | Only "no secrets" and "stay within stack" are inviolable. | |
| User decides each conflict | Nothing automatically locked; research documents each conflict and asks. | ✓ |

**User's choice:** User decides each conflict
**Notes:** This partially revises the earlier "principles stay" framing: research can challenge any convention, but must surface conflicts rather than silently changing them.

---

### Question 4: Final decider

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 1 decides all | Lock every decision in CONTEXT.md before Phase 2 starts. | |
| Phase 2 decides all | Phase 1 records conflicts as open questions; Phase 2 decides after reviewing code. | ✓ |
| Phase 1 principles, Phase 2 details | High-level philosophy now; implementation details in Phase 2. | |

**User's choice:** Phase 2 decides all
**Notes:** Phase 1's role is research and documentation of conflicts/recommendations. Phase 2 owns final convention decisions because it has real-code context.

---

### More questions check

**Question:** More questions about Convention authority, or finish this area?
**Options:** More questions / Finish
**User's choice:** Finish

---

### Final gray-areas check

**Question:** We've discussed Convention authority. What should we do next?
**Options:** Explore more gray areas / I'm ready for context
**User's choice:** Explore more gray areas (initially), then changed mind and agreed to proceed with context capture.

---

## the agent's Discretion

None — user made explicit choices for every question.

## Deferred Ideas

None — discussion stayed within phase scope.
