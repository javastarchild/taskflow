---
completed: '2026-11-07T21:17:03.682Z'
worker: claude-opus-5-5
---
## What Was Done

Added server/db.js: one SQLite file (TASKFLOW_DB, default data/taskflow.db) via built-in node:sqlite with WAL + busy_timeout + foreign keys; versioned schema (PRAGMA user_version=1) for projects (unique slug), goals, tasks (goal_id, priority, status, tags, depends_on, lease fields, completion), comments. No native npm dependency.

## Files Changed

server/db.js (new); package.json engines node>=22.5

## Notes for Planner

Evidence: npm run test:server -> 28/28 pass, incl. queue.test.js 'projects, goals, tasks, claims and comments survive a server restart'. Store tests live alongside the API tests rather than a separate store.test.js.
