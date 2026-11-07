---
id: 1a971837-2620-45f7-aec5-392096b254f6
title: 'Completed Tasks tab — list, detail, reopen, stats'
priority: medium
created: '2026-05-02T00:00:00.000Z'
status: done
depends_on:
  - 7430cb90-c026-4521-b5b7-ba085ce9c915
  - a3d5157c-a2b4-433c-b3e7-ab49cb94713e
tags:
  - react
  - frontend
  - ui
goal: Planner UI v1 (legacy folder era)
---
## Objective

Build the Completed Tasks tab: a list of done tasks with completion metadata, a read-only detail view, a "Reopen" action, and a simple summary stat.

## Acceptance Criteria

- [ ] `src/components/CompletedTasksTab.jsx` renders the full Completed tab content
- [ ] Lists all tasks from `doneTasks` in context (these come from `GET /api/done`)
- [ ] Tasks sorted by `completed` timestamp descending (most recently done first)
- [ ] Each task card displays: title, original priority badge, completion date, worker name (from completion.md front matter)
- [ ] Clicking a task card expands a detail panel showing:
  - Original task description (body of task.md)
  - Completion summary ("What Was Done" from completion.md body)
  - Files changed list (if present)
  - Notes for planner (if present)
  - Full comment thread (read-only)
- [ ] "Reopen" button in detail panel calls `reopenTask(uuid)` and moves the task back to the Active tab
- [ ] Summary stat bar at top of tab: total completed count and a count of tasks completed today
- [ ] Empty state message when no completed tasks exist

## Completed Task Data Shape (from API)

The `/api/done` endpoint returns tasks with these additional fields compared to active tasks:

```js
{
  ...Task,
  status: 'done',
  completed: string,     // ISO-8601 from completion.md front matter
  worker: string,        // from completion.md front matter
  completionSummary: string,   // "What Was Done" section body
  filesChanged: string,        // "Files Changed" section body (may be empty)
  plannerNotes: string,        // "Notes for Planner" section body (may be empty)
}
```

(Coordinate with the Task A worker on exact field names if they differ.)

## Component Interface

`CompletedTasksTab` takes no props — reads from `useTasks()`.

## Context & Notes

- Place component styles in `src/components/CompletedTasksTab.css`.
- Reuse priority badge styles from Task C (consider extracting to a shared `src/components/PriorityBadge.jsx` + `PriorityBadge.css` if Task C worker didn't already do so).
- The comment input is added by Task E; the detail panel here only needs read-only comment display for now.
- This task can be worked in parallel with Task C (1d637a41).
