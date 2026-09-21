---
status: accepted
date: 2026-09-21
---

# Server effects fail with a named cause rather than resolving with `undefined`

An `Effect.gen` block whose last guard has no `else` falls off the end and returns `undefined`, and `undefined` is a *success*. A sweep of the 71 `Effect.gen` blocks under `packages/nuxt-galaxy/src/runtime/server/` found 7 written that way. Three of them reached a client: `POST /api/db/analyses` and the two leaf effects it calls, `addHistoryEffect` and `getWorkflowEffect`. The endpoint answered 200 with an empty body — a submitted analysis that was never created, reported as one that was — and the browser's `const { id } = await $fetch(…)` threw on the destructure.

We decided that a server effect whose work cannot produce its result **fails with a tagged error at the guard where the reason is still known**, and that `undefined` therefore leaves its success type. The alternative on offer — leaving the nullable in place and checking it at the call site — is what produced the defect, three times over in one request path: `addHistoryEffect` had three nested guards, so "no Galaxy user row", "Galaxy created nothing" and "the insert returned nothing" all arrived at the caller as the same value, and the caller's own guard had nothing to tell them apart with.

The rule is about *named* absence, not about forbidding `null`. Absence is a legitimate answer at 19 of the 22 query sites in this package (#31), and `takeUniqueOrNull` still hands it back for the caller to interpret. What changed is that where a leaf effect *cannot continue* without a row, it says which row and why instead of returning nothing.

## Considered options

- **A generic `orFail(effect, () => new SomeError())` helper.** Terser at each guard, and it was the first thing tried. Rejected: it leaves the nullable in the leaf's success type, so every present and future caller still has to remember to wrap it. That is the same defect moved one level out, and the compiler still cannot see it.
- **Keep the nullables and fold them in the handler.** Rejected for the same reason plus one more: the handler is the place with the least information. By the time three causes have collapsed into one `undefined` there is nothing left to map to distinct statuses, and this path needs 404, 503 and 500 told apart.
- **A lint rule requiring an `else` on every guard in an `Effect.gen`.** Rejected as a substitute rather than a complement: it catches the shape, not the type, so it would pass a guard that returns `null` deliberately and would fire on the many blocks where falling through is correct.

## Consequences

- Leaf effects' error unions get wider, and each new tag has to be mapped somewhere. That is the point: an unmapped tag is a 500, so forgetting one is visible as a status rather than as an empty body.
- **A handler that calls such an effect has to fold the `Either`.** Without the fold, every tagged failure becomes a 500 and the distinction the leaf just paid for is thrown away at the last step. `analyses.post` was the only handler under `api/db/` without one; it has one now, and a new handler on this path is expected to follow `workflows.post`.
- One error class can be shared by several guards when the cause and the answer really are the same — `GalaxyUserNotFoundError` is raised by both leaves and means one thing. A tag per call site would give the handler more names for one status and nothing else.
- Error messages that reach a client are written in the repository's own vocabulary (`CONTEXT.md`). The 503 on this path reads "the analysis could not be prepared on Galaxy": "history" is a Galaxy-side container listed under _Avoid_ and stays out of anything a user reads.
- Four sites of the same shape are left, each deliberately: `api/galaxy/histories.get.ts` (unreachable), `utils/grizzle/analyses.ts:66` (shape without consequence — the caller filters), and #28, #29, #30 for the rest.
- **Revisit trigger**: if the tag count on a single handler's union grows past what a reader can hold — roughly a dozen — the answer is probably a smaller number of coarser tags carrying their own status, as `WorkflowAlreadyExistsError` already does, not a return to nullables.
