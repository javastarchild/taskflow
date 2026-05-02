---
id: 7430cb90-c026-4521-b5b7-ba085ce9c915
title: Backend API server for planner file I/O
priority: high
created: 2026-05-02T00:00:00Z
status: todo
tags:
  - backend
  - node
  - express
---

## Objective

Create a minimal Node/Express API server that reads and writes the `planner/` folder's markdown files. The React frontend will talk to this server instead of accessing the filesystem directly.

## Acceptance Criteria

- [ ] `server/index.js` starts with `node server/index.js` (or `npm run server`)
- [ ] `package.json` has a `"server"` script; `"proxy": "http://localhost:3001"` added so CRA proxies API calls in dev
- [ ] `GET /api/tasks` — returns array of all active tasks (parsed front matter + body)
- [ ] `GET /api/tasks/:uuid` — returns single task (parsed front matter + body + comments array)
- [ ] `POST /api/tasks` — creates new task folder + `task.md`; body: `{ title, description, priority, tags? }`; generates UUID server-side; returns created task
- [ ] `PUT /api/tasks/:uuid` — updates `task.md` front matter and/or body; body: partial task fields
- [ ] `GET /api/tasks/:uuid/comments` — returns parsed comments array from `comments.md`
- [ ] `POST /api/tasks/:uuid/comments` — appends entry to `comments.md`; body: `{ author: "worker"|"planner", content }`
- [ ] `POST /api/tasks/:uuid/complete` — moves folder from `tasks/` to `done/`, writes `completion.md`; body: `{ summary, filesChanged?, notes? }`
- [ ] `GET /api/done` — returns array of completed tasks (parsed front matter + completion metadata)
- [ ] `GET /api/done/:uuid` — returns single completed task with comments and completion details
- [ ] `PUT /api/done/:uuid/reopen` — moves folder back to `tasks/`, removes completion.md, sets `status: todo`
- [ ] CORS headers allow `http://localhost:3000`
- [ ] Server runs on port `3001`

## Context & Notes

**Planner directory layout** (relative to project root):
```
planner/
  tasks/<uuid>/task.md
  tasks/<uuid>/comments.md   (may not exist)
  done/<uuid>/task.md
  done/<uuid>/completion.md
  done/<uuid>/comments.md    (may not exist)
```

**Parsing front matter**: Use the `gray-matter` npm package (`npm install gray-matter`) to parse YAML front matter from markdown files. The body (everything after the front matter block) should be returned as `body` (raw markdown string).

**Comments format** in `comments.md`:
```markdown
## PLANNER — 2026-05-02T10:00:00Z
Content here.

## WORKER — 2026-05-02T11:30:00Z
Content here.
```
Parse each `## ROLE — TIMESTAMP` heading as a comment entry: `{ author: "planner"|"worker", timestamp, content }`.

**Completion format** in `completion.md`:
Front matter contains `completed` (ISO string) and `worker` (string). Body is markdown.

**UUID generation**: Use `crypto.randomUUID()` (Node 14.17+, no extra dependency).

**File move**: Use `fs.renameSync` (or async variant) to move folders between `tasks/` and `done/`.

**Error handling**: Return appropriate HTTP status codes (404 for missing task, 400 for bad input). No need for a database.

## Suggested Dependencies

```json
"express": "^4.18.0",
"gray-matter": "^4.0.3",
"cors": "^2.8.5"
```

Install as regular dependencies (not devDependencies) since the server is part of the project runtime.
