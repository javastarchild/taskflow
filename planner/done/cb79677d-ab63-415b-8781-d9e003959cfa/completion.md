---
completed: '2026-11-07T21:17:04.091Z'
worker: claude-opus-5-5
---
## What Was Done

bin/taskflow.js (package bin 'taskflow') + server/client.js dependency-free fetch client. Config via --url/--token/--project/--worker or TASKFLOW_URL/TASKFLOW_TOKEN(_FILE)/TASKFLOW_PROJECT/TASKFLOW_WORKER. Commands: health, projects, project-create, goals, goal-create, goal-status, tasks, show, create, queue, claim, heartbeat, release, comment, complete, reopen, import-planner, export-planner. --json for agents; exit 0 ok, 1 error, 2 usage, 3 nothing to claim.

## Files Changed

bin/taskflow.js, server/client.js, server/cli.test.js, package.json (bin, scripts)

## Notes for Planner

Evidence: cli.test.js 4/4 (leader/worker loop, HTTP import/export, error paths, real binary exit codes). This very task was claimed and completed with this CLI against a live token-protected server.
