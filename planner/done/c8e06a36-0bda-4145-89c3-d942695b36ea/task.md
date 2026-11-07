---
id: c8e06a36-0bda-4145-89c3-d942695b36ea
title: Comments & Activity Feed tab
priority: medium
created: '2026-05-02T00:00:00.000Z'
status: done
depends_on:
  - 7430cb90-c026-4521-b5b7-ba085ce9c915
  - a3d5157c-a2b4-433c-b3e7-ab49cb94713e
  - 1d637a41-c181-4ac4-bdad-cef8242b532a
tags:
  - react
  - frontend
  - ui
goal: Planner UI v1 (legacy folder era)
---
## Objective

Add comment input to task detail views and build the Activity Feed tab — a cross-task log of all comments, enabling planner↔worker communication through the UI.

## Acceptance Criteria

### Comment input on task detail (Active Tasks tab)

- [ ] Add a comment input section below the existing read-only comment thread in `ActiveTasksTab`'s detail panel
- [ ] Input: author selector (radio or segmented control: **Worker** | **Planner**), textarea for content, Submit button
- [ ] "Worker" is selected by default
- [ ] Submit calls `addComment(uuid, { author, content })` from context, clears the form, refreshes comments
- [ ] Submit button disabled while content is empty
- [ ] Planner comments visually distinguished from worker comments (see style notes)
- [ ] Comment timestamps displayed in human-readable format (e.g. "May 2, 2026 10:30 AM")

### Comment input on Completed Tasks tab

- [ ] Add the same comment input to `CompletedTasksTab`'s detail panel (completed tasks can still receive comments)

### Activity Feed tab (`src/components/ActivityFeedTab.jsx`)

- [ ] Lists every comment from every task (both active and done), newest first
- [ ] Each entry shows: author badge (PLANNER / WORKER), task title (linked — clicking expands that task), timestamp, comment content (truncated to ~3 lines with "show more")
- [ ] Live-updates when a new comment is submitted anywhere in the app (use context's `refresh()` or an optimistic update)
- [ ] Empty state when no comments exist anywhere
- [ ] Tab badge on the "Activity" tab showing total comment count (optional but nice to have)

## Style Notes

**Comment author badges:**

```
PLANNER → background #7c3aed (purple), text white, font-size 0.7rem, uppercase
WORKER  → background #0284c7 (blue),   text white, font-size 0.7rem, uppercase
```

**Comment bubble layout** (for detail panel):
```
[BADGE] timestamp
content text here
─────────────────
[BADGE] timestamp
content text here
```

Planner comments can have a subtle left border (e.g. `border-left: 3px solid #7c3aed`) to make scanning the thread easy.

## Component Interface

`ActivityFeedTab` takes no props — derives all data from `useTasks()` by iterating `tasks` and `doneTasks` and collecting their `comments` arrays, then sorting by timestamp.

## Context & Notes

- The comment input component can be extracted to `src/components/CommentInput.jsx` and shared between Active and Completed detail panels.
- The activity feed is read-only (no input in the feed itself; users submit comments from the task detail view).
- Do not add routing; the "link" to a task from the feed can set a piece of shared state that causes the Active or Completed tab to switch and expand that task — coordinate the mechanism with the Task B/C workers via a planner comment if needed.
- Place styles in `src/components/ActivityFeedTab.css` and `src/components/CommentInput.css`.
