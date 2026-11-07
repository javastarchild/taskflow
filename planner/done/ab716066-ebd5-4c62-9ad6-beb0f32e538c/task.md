---
id: ab716066-ebd5-4c62-9ad6-beb0f32e538c
title: Authenticated remote HTTP queue with atomic claim and worker leases
priority: high
created: '2026-11-07T16:30:00.000Z'
status: done
depends_on:
  - 05a761d9-02ad-4186-b4c8-f81774db632f
tags:
  - backend
  - api
  - security
  - 'owner:claude'
goal: Remote central queue
---
## Objective

Expose the central store as the HTTP contract in `docs/API.md` so Claude (leader) and Codex (worker) can coordinate from any machine or checkout.

## Acceptance Criteria

- [ ] All routes in docs/API.md implemented, project addressable by id or slug
- [ ] Bearer / X-Taskflow-Token auth preserved; server refuses to listen beyond 127.0.0.1 without a token unless explicitly overridden
- [ ] Foreign-Origin writes still return 403; UUID params validated
- [ ] `POST /projects/:p/claim` is atomic (BEGIN IMMEDIATE) — concurrency test with parallel claims and two server processes never double-assigns
- [ ] Lease heartbeat / release / complete / reopen enforce ownership (409); expired leases are reclaimable
- [ ] Legacy `/api/tasks` and `/api/done` routes still work against a default project
- [ ] No endpoint executes shell commands

## Ownership

Claude (leader/worker). Owned paths: server/app.js, server/index.js, server/app.test.js, server/queue.test.js

## Completion Evidence

Completion report must list files changed and the exact test commands run with their results.

## Context & Notes

Goal: "Remote central queue" (project `taskflow`). Contract: `docs/API.md`.
