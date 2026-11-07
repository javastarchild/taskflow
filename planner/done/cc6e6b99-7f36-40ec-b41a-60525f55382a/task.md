---
id: cc6e6b99-7f36-40ec-b41a-60525f55382a
title: Legacy planner import/export and self-hosted task seeding
priority: high
created: '2026-11-07T16:30:00.000Z'
status: done
depends_on:
  - 05a761d9-02ad-4186-b4c8-f81774db632f
tags:
  - backend
  - migration
  - 'owner:claude'
goal: Remote central queue
---
## Objective

Move existing `planner/` folders into the central queue without losing tasks, comments or completion reports, and allow exporting back to the folder format during the transition.

## Acceptance Criteria

- [ ] `import-planner <dir> --project <slug>` imports tasks/ and done/ including comments.md and completion.md
- [ ] Import is idempotent (re-running does not duplicate)
- [ ] `export-planner <dir> --project <slug>` writes the protocol-compatible folder layout
- [ ] Round-trip test: import → export → import yields identical task data
- [ ] Taskflow's own improvement tasks are seeded reproducibly with `npm run seed:self`

## Ownership

Claude (leader/worker). Owned paths: server/legacy.js, server/legacy.test.js, scripts/seed-self.js

## Completion Evidence

Completion report must list files changed and the exact test commands run with their results.

## Context & Notes

Goal: "Remote central queue" (project `taskflow`). Contract: `docs/API.md`.
