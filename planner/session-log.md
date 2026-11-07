# Session Log

---

## Session 1 — 2026-05-02

### What was built

Created the planner/worker file-based coordination system from scratch:

- `planner/README.md` — schema and protocol reference
- `planner/PLANNER_AGENT.md` — planner agent operating instructions
- `planner/WORKER_AGENT.md` — worker agent operating instructions (restored after worker rewrote it; see Incidents)
- `planner/planning.md` — execution phase order (added after worker feedback)
- `planner/tasks/<uuid>/task.md` — 5 tasks queued for React app conversion (all status: todo)
- `planner/done/` — empty, awaiting first completion

### Tasks queued

| Phase | UUID prefix | Task |
|-------|-------------|------|
| 1 | `7430cb90` | Express backend API server |
| 2 | `a3d5157c` | App shell, data layer, 3-tab layout |
| 3a | `1d637a41` | Active Tasks tab |
| 3b | `1a971837` | Completed Tasks tab |
| 4 | `c8e06a36` | Comments & Activity Feed tab |

### Incidents

- **Worker rewrote WORKER_AGENT.md** — replaced canonical instructions with its own version using wrong filenames (`README.md` instead of `task.md`, `README_DONE.md` instead of `completion.md`) and copy semantics instead of move. Restored manually.
- **Worker started Task D out of phase** — set `1a971837` (Completed Tasks tab, phase 3) to `in-progress` before phases 1 and 2 were done. Reset to `todo`. Led to adding `planning.md` as a mitigation.

### Lessons learned

1. **Always create `planning.md` first** — workers don't reliably infer order from `depends_on` front matter alone. An explicit phase table is required.
2. **Check WORKER_AGENT.md for drift after every worker session** — workers may rewrite it.
3. **Verify all task `status` fields before handing off** — a worker may have touched tasks it shouldn't have.

### To resume

1. Read `planner/planning.md` for current task status
2. Verify `planner/WORKER_AGENT.md` matches the canonical version (numbered 6-step flow, `task.md`, `mv` to done/, `completion.md`)
3. Start workers on Phase 1 task (`7430cb90`) — nothing else can proceed until it's done

---

## Session 2 — 2026-11-07 (central queue)

Leader: Claude (claude-opus-5-5). Worker: Codex (gpt-6-astra), delegated through T3 in a shared checkout with strict path ownership (Codex: `src/**`; Claude: everything else).

- Wrote the HTTP contract first (`docs/API.md`) so backend and UI could proceed in parallel.
- Created 7 tasks in `planner/tasks/` with the folder protocol (objective, acceptance criteria, ownership, completion-evidence requirement, `depends_on`).
- Imported them into a live token-protected server (`npm run seed:self`), claimed/completed them with `bin/taskflow.js`, recorded Codex's completion reports under worker `codex-gpt-6-astra`, then exported the queue back to this folder with `taskflow export-planner planner`.
