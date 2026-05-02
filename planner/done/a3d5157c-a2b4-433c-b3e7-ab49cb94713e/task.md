---
id: a3d5157c-a2b4-433c-b3e7-ab49cb94713e
title: App shell — data layer, React context, 3-tab layout
priority: high
created: 2026-05-02T00:00:00Z
status: todo
depends_on:
  - 7430cb90-c026-4521-b5b7-ba085ce9c915
tags:
  - react
  - frontend
  - architecture
---

## Objective

Replace the current `App.js` placeholder with a working app shell: a data-fetching layer that talks to the backend API, a React context providing tasks state to all components, and a three-tab layout.

## Acceptance Criteria

- [ ] `src/api/client.js` — thin fetch wrapper for all backend endpoints (see API reference below)
- [ ] `src/context/TaskContext.js` — React context + `TaskProvider` component; exposes tasks state and CRUD actions
- [ ] `src/hooks/useTasks.js` — convenience hook: `const { tasks, doneTasks, createTask, updateTask, completeTask, reopenTask, addComment } = useTasks()`
- [ ] `App.js` renders `<TaskProvider>` wrapping a three-tab layout
- [ ] Tabs: **Active** | **Completed** | **Activity**
- [ ] Active tab is selected by default
- [ ] Each tab renders a placeholder (`<div>Active Tasks</div>` etc.) — real content added by later tasks
- [ ] Tab switching works without page reload
- [ ] `src/App.css` has basic tab styles (see style notes below)
- [ ] No existing functionality is broken (app still starts with `npm start`)

## API Client Reference

All endpoints live under `/api` (CRA proxy handles the port):

```js
// src/api/client.js  — implement these exports
export const getTasks = () => fetch('/api/tasks').then(r => r.json())
export const getTask = (uuid) => fetch(`/api/tasks/${uuid}`).then(r => r.json())
export const createTask = (data) => fetch('/api/tasks', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) }).then(r => r.json())
export const updateTask = (uuid, data) => fetch(`/api/tasks/${uuid}`, { method: 'PUT', ... }).then(r => r.json())
export const completeTask = (uuid, data) => fetch(`/api/tasks/${uuid}/complete`, { method: 'POST', ... }).then(r => r.json())
export const getDoneTasks = () => fetch('/api/done').then(r => r.json())
export const reopenTask = (uuid) => fetch(`/api/done/${uuid}/reopen`, { method: 'PUT' }).then(r => r.json())
export const addComment = (uuid, data) => fetch(`/api/tasks/${uuid}/comments`, { method: 'POST', ... }).then(r => r.json())
```

## Context Shape

```js
{
  tasks: Task[],           // active tasks
  doneTasks: Task[],       // completed tasks
  loading: boolean,
  error: string | null,
  refresh: () => void,     // re-fetch both lists
  createTask: (data) => Promise<Task>,
  updateTask: (uuid, data) => Promise<Task>,
  completeTask: (uuid, completionData) => Promise<void>,
  reopenTask: (uuid) => Promise<void>,
  addComment: (uuid, { author, content }) => Promise<void>,
}
```

## Task Data Shape (from API)

```js
{
  id: string,
  title: string,
  description: string,     // markdown body from task.md
  priority: 'high' | 'medium' | 'low',
  status: 'todo' | 'in-progress',
  created: string,         // ISO-8601
  tags: string[],
  comments: [
    { author: 'planner' | 'worker', timestamp: string, content: string }
  ]
}
```

## Style Notes (App.css)

Plain CSS tabs. Example structure to style:

```html
<div class="tab-bar">
  <button class="tab active">Active</button>
  <button class="tab">Completed</button>
  <button class="tab">Activity</button>
</div>
<div class="tab-content">
  <!-- active panel -->
</div>
```

Keep styles minimal — just enough to distinguish selected tab and provide readable layout. Subsequent tasks will add component-level styles.

## Context & Notes

- The current `App.js` renders a simple `<h1>Hello World!</h1>`. Replace the body entirely; preserve the import of `App.css`.
- `src/index.js` does not need changes.
- Do not install any UI framework; plain CSS only.
- `npm start` starts the React dev server on port 3000. The backend (task A) must be running separately on 3001. Add a note to `README.md` or `CLAUDE.md` about running both.
