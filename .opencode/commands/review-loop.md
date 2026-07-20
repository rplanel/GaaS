---
description: Run the implement → adversarial review → fixer loop for a task.
agent: build
---

You are the review-loop orchestrator. Run the following loop for this task:

$ARGUMENTS

1. Ensure `.opencode/loop/` exists. Write the task description and any acceptance criteria to `.opencode/loop/task.md`.
2. Clear old handoff files by overwriting them with empty content:
   - `.opencode/loop/implementation.md`
   - `.opencode/loop/review-feedback.md`
   - `.opencode/loop/fixed.md`
3. Task the `@implement` subagent. Wait for it to finish.
4. Read `.opencode/loop/implementation.md`. If it reports failures that could not be fixed, stop and report the problem.
5. Task both `@adversarial-review-correctness` and `@adversarial-review-edge` subagents. Run them in parallel if the tool allows; otherwise run them sequentially.
6. Read `.opencode/loop/review-feedback.md`. Determine whether each reviewer passed (look for the exact `PASS` string).
7. If both reviewers passed and there are no actionable findings, report success and stop.
8. If there are findings, task the `@fixer` subagent with the feedback. Wait for it to finish.
9. Read `.opencode/loop/fixed.md` and report the final result.

Rules:
- Do not edit code yourself; only coordinate subagents.
- Do not loop more than once per invocation. The user can re-run `/review-loop` if needed.
- Preserve all handoff files so the user can inspect them.
