# Execution Plan

> **Start here.** This file tells you which task to pick up and when. Read this before opening any task folder.

---

## Phase 1 — No dependencies, start immediately

| UUID | Task |
|------|------|
| `7430cb90-c026-4521-b5b7-ba085ce9c915` | Backend API server for planner file I/O |

---

## Phase 2 — After Phase 1 is in `done/`

| UUID | Task |
|------|------|
| `a3d5157c-a2b4-433c-b3e7-ab49cb94713e` | App shell — data layer, React context, 3-tab layout |

---

## Phase 3 — After Phase 2 is in `done/` (these two can be worked in parallel)

| UUID | Task |
|------|------|
| `1d637a41-c181-4ac4-bdad-cef8242b532a` | Active Tasks tab — list, create, edit, complete |
| `1a971837-2620-45f7-aec5-392096b254f6` | Completed Tasks tab — list, detail, reopen, stats |

---

## Phase 4 — After Phase 3 task `1d637a41` is in `done/`

| UUID | Task |
|------|------|
| `c8e06a36-0bda-4145-89c3-d942695b36ea` | Comments & Activity Feed tab |

---

## Current Status

| UUID prefix | Task | Status |
|-------------|------|--------|
| `7430cb90` | Backend API server | done |
| `a3d5157c` | App shell & tabs | done |
| `1d637a41` | Active Tasks tab | done |
| `1a971837` | Completed Tasks tab | done |
| `c8e06a36` | Comments & Activity Feed | done |

---

# Central queue (goal: "Remote central queue", 2026-11-07)

> These tasks were created with the folder protocol, imported into the central
> queue (`npm run seed:self`), executed through it with the `taskflow` CLI, and
> exported back here. The live queue is the source of truth; run
> `taskflow queue --project taskflow` against your server.

| Phase | UUID prefix | Task | Owner | Depends on |
|-------|-------------|------|-------|------------|
| 1 | `05a761d9` | Central SQLite store | Claude | — |
| 2 | `ab716066` | Authenticated remote HTTP queue, atomic claim, leases | Claude | 05a761d9 |
| 2 | `cc6e6b99` | Legacy import/export + self seeding | Claude | 05a761d9 |
| 3 | `cb79677d` | Worker CLI / API client | Claude | ab716066 |
| 3 | `b4cca650` | React project/goal/task/queue UI | Codex | ab716066 |
| 3 | `9deedf48` | Configurable API URL + token in UI | Codex | ab716066 |
| 4 | `837f97f1` | README / deployment / security / leader-worker docs | Claude | all above |
