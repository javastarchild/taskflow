---
id: 1d637a41-c181-4ac4-bdad-cef8242b532a
title: Active Tasks tab — list, create, edit, complete
priority: high
created: 2026-05-02T00:00:00Z
status: todo
depends_on:
  - 7430cb90-c026-4521-b5b7-ba085ce9c915
  - a3d5157c-a2b4-433c-b3e7-ab49cb94713e
tags:
  - react
  - frontend
  - ui
---

## Objective

Build the Active Tasks tab: a task list with priority indicators, a form to create new tasks, inline editing, and a "Mark Complete" action.

## Acceptance Criteria

- [ ] `src/components/ActiveTasksTab.jsx` renders the full Active tab content
- [ ] Task list shows all active tasks from context (`status: todo` or `in-progress`)
- [ ] Each task card displays: title, priority badge (color-coded), created date, comment count
- [ ] Tasks sorted by priority (high → medium → low), then by created date descending within each priority
- [ ] "New Task" button opens a creation form (inline or a simple modal — no library required)
- [ ] Creation form fields: Title (required), Description (textarea), Priority (select: high/medium/low, default medium)
- [ ] Submitting the form calls `createTask` from context and refreshes the list; form closes on success
- [ ] Clicking a task card expands a detail panel (can be inline below the card or a drawer — keep it simple)
- [ ] Detail panel shows: full description (render as plain text or preserve line breaks), full comment thread, edit button
- [ ] Edit mode lets the user change title, description, and priority; saves via `updateTask`; cancel discards changes
- [ ] "Mark Complete" button in detail panel calls `completeTask`; prompts for a brief completion summary (one textarea, required) before submitting
- [ ] Empty state: show a message and the "New Task" button when no active tasks exist
- [ ] No broken layout when task title is long or description is empty

## Priority Badge Colors (plain CSS)

```
high   → background #ef4444, text white
medium → background #f59e0b, text white
low    → background #6b7280, text white
```

## Component Interface

`ActiveTasksTab` takes no props — it reads everything from `useTasks()`.

## Context & Notes

- Place component-level styles in `src/components/ActiveTasksTab.css` (import from the component file).
- The comment thread display is read-only here; comment input is added by Task E.
- "Mark Complete" completion summary maps to `completeTask(uuid, { summary })` — the `filesChanged` and `notes` fields are optional and can be omitted from this UI.
- Do not implement the comments tab or activity feed here; those are Task E.
- The detail panel does not need a URL/route — simple show/hide state is fine.
