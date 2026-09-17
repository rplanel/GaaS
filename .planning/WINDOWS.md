---
schema_version: 1
open_count: 0
waived_count: 0
fixed_count: 2
total_count: 2
last_updated: 2026-08-06T11:54:03.480Z
---

# Broken Windows Ledger

> Cross-phase defect register. `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 02 | unrun-verify | package.json |  | Root pnpm typecheck fails on 4 pre-existing @gaas/ui TypeScript errors unrelated to logging work | fixed |  | 2026-08-05T18:58:25.041Z | 2026-08-06T11:54:03.376Z |
| 2 | 02 | unrun-verify | package.json |  | Root pnpm test fails with vitest forks-pool environment error Unknown system error -122 write; package tests pass with --pool=threads | fixed |  | 2026-08-05T18:58:37.534Z | 2026-08-06T11:54:03.480Z |

````json
[
  {
    "id": 1,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "package.json",
    "line": null,
    "description": "Root pnpm typecheck fails on 4 pre-existing @gaas/ui TypeScript errors unrelated to logging work",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-05T18:58:25.041Z",
    "resolved_at": "2026-08-06T11:54:03.376Z"
  },
  {
    "id": 2,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "package.json",
    "line": null,
    "description": "Root pnpm test fails with vitest forks-pool environment error Unknown system error -122 write; package tests pass with --pool=threads",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-05T18:58:37.534Z",
    "resolved_at": "2026-08-06T11:54:03.480Z"
  }
]
````
