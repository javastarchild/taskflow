---
id: 05a761d9-02ad-4186-b4c8-f81774db632f
title: 'Central SQLite store for projects, goals and tasks'
priority: high
created: '2026-11-07T16:30:00.000Z'
status: done
tags:
  - backend
  - persistence
  - 'owner:claude'
goal: Remote central queue
---
## Objective

Replace the per-repo `planner/tasks` + `planner/done` folders with one central database so a project no longer needs the planner directory copied into it.

## Acceptance Criteria

- [ ] `server/db.js` opens `TASKFLOW_DB` (default `data/taskflow.db`) with built-in `node:sqlite`, WAL mode and a busy timeout
- [ ] Schema for projects (slug unique), goals (per project), tasks (project_id, goal_id, priority, status, tags, depends_on, lease fields), comments, completions
- [ ] Schema is versioned with `PRAGMA user_version` and created idempotently on startup
- [ ] Data survives a process restart (covered by a test)
- [ ] No new native npm dependency is required

## Ownership

Claude (leader/worker). Owned paths: server/db.js, server/store.test.js

## Completion Evidence

Completion report must list files changed and the exact test commands run with their results.

## Context & Notes

Goal: "Remote central queue" (project `taskflow`). Contract: `docs/API.md`.
