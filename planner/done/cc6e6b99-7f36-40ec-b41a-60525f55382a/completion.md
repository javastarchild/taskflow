---
completed: '2026-11-07T21:17:03.972Z'
worker: claude-opus-5-5
---
## What Was Done

server/legacy.js reads planner/tasks + planner/done (task.md, comments.md, completion.md) and upserts by UUID; existing tasks are skipped unless overwrite so re-import never rolls back progress. Folder in-progress tasks import with an already-expired lease (reclaimable). writePlannerFolder exports back to the protocol, moving folders between tasks/ and done/ with artifacts. POST /api/projects/:p/import accepts parsed records so remote CLIs can import without server file access. scripts/seed-self.js (npm run seed:self) seeds this repo's planner history into project 'taskflow' locally or via TASKFLOW_URL.

## Files Changed

server/legacy.js, server/legacy.test.js, scripts/seed-self.js, server/db.js (upsertImportedTask, hasTask)

## Notes for Planner

Evidence: legacy.test.js 4/4 incl. import->export->import deep-equal round trip; npm run seed:self twice -> '12 new' then '0 new, 12 already present'.
