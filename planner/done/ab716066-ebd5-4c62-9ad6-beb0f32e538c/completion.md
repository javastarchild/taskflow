---
completed: '2026-11-07T21:17:03.857Z'
worker: claude-opus-5-5
---
## What Was Done

Rewrote server/app.js as createApp({store, token, origins}) implementing docs/API.md: projects/goals/tasks/comments, queue status, atomic claim (BEGIN IMMEDIATE + guarded UPDATE), claim-by-id, heartbeat, release, complete, reopen with 409 ownership checks and reclaimable expired leases. Bearer and X-Taskflow-Token auth, foreign-Origin write 403, UUID param validation, JSON error handler. Legacy /api/tasks + /api/done routes mapped to a default project. index.js binds 127.0.0.1 unless a token is set (override TASKFLOW_INSECURE_NO_TOKEN=1). No shell-executing endpoint.

## Files Changed

server/app.js, server/index.js, server/helpers.js, server/app.test.js, server/queue.test.js, docs/API.md

## Notes for Planner

Evidence: npm run test:server -> 28/28 pass. queue.test.js: 30 parallel claims over 10 tasks -> 10 unique; 30 claims split across two separate server processes sharing one DB file -> 12/12 unique; lease expiry/heartbeat/release via injected clock; restart durability.
