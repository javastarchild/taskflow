# Taskflow HTTP API (v1)

Taskflow keeps every project, goal, task, comment and completion in one
central SQLite database (`TASKFLOW_DB`, default `./data/taskflow.db`). Agents
and the React UI reach it over HTTP, so nothing has to be copied into the
repositories being worked on.

All endpoints live under `/api`. Request and response bodies are JSON.

## Authentication and origin checks

| Header | Meaning |
|---|---|
| `Authorization: Bearer <token>` | Preferred way to send `TASKFLOW_TOKEN`. |
| `X-Taskflow-Token: <token>` | Accepted for backwards compatibility. |

* When `TASKFLOW_TOKEN` is set, every `/api` route except `GET /api/health`
  returns `401 {"error": ...}` without a matching token.
* When `TASKFLOW_TOKEN` is unset the server only listens on `127.0.0.1`
  (unless `TASKFLOW_INSECURE_NO_TOKEN=1` is set explicitly).
* Non-GET requests that carry an `Origin` header that is neither listed in
  `CORS_ORIGINS` nor the server's own origin (the bundled UI) get `403`.
  CLI/agent clients send no `Origin` and are governed by the token.
* There is no endpoint that executes commands or reads server-side paths.

Errors always look like `{"error": "message"}` with a 4xx/5xx status.

## Identifiers

Projects are addressed by `id` (UUID) **or** `slug` in `:project`.
Goals, tasks and comments are addressed by UUID. Malformed UUIDs return `400`.

## Objects

```jsonc
// Project
{ "id": "uuid", "slug": "taskflow", "name": "Taskflow", "description": "",
  "repo_url": "https://github.com/...", "created": "ISO", "updated": "ISO",
  "counts": { "todo": 0, "in-progress": 0, "done": 0 } }   // counts on list/get

// Goal
{ "id": "uuid", "project_id": "uuid", "title": "…", "description": "…",
  "status": "active" | "achieved" | "archived", "created": "ISO", "updated": "ISO",
  "counts": { "todo": 0, "in-progress": 0, "done": 0 } }

// Task
{ "id": "uuid", "project_id": "uuid", "goal_id": "uuid" | null,
  "title": "…", "body": "markdown", "priority": "high" | "medium" | "low",
  "status": "todo" | "in-progress" | "done",
  "tags": ["…"], "depends_on": ["uuid"],
  "ready": true,            // todo and every dependency is done
  "blocked_by": ["uuid"],   // unfinished dependencies
  "assignee": "codex-1" | null, "claimed_at": "ISO" | null,
  "lease_expires": "ISO" | null, "attempts": 0,
  "created": "ISO", "updated": "ISO",
  "completion": null | { "completed": "ISO", "worker": "…", "summary": "…",
                          "files_changed": "…", "notes": "…" },
  "comments": [ Comment ] }

// Comment
{ "id": "uuid", "task_id": "uuid", "author": "planner" | "worker",
  "agent": "claude" | null, "content": "…", "timestamp": "ISO" }
```

`## PLANNER` / `## WORKER` headings inside comment text and task descriptions
are escaped (`\##`) so one role cannot impersonate the other.

## Endpoints

### Health
* `GET /api/health` → `{ "ok": true, "version": 1, "auth": true }` (no token required)

### Projects
* `GET /api/projects` → `Project[]`
* `POST /api/projects` `{ name, slug?, description?, repo_url? }` → `201 Project`
  (`slug` defaults to a slugified `name`; `409` if taken; slug matches `^[a-z0-9][a-z0-9-]{0,62}$`)
* `GET /api/projects/:project` → `Project`
* `PUT /api/projects/:project` `{ name?, description?, repo_url? }` → `Project`

### Goals
* `GET /api/projects/:project/goals` → `Goal[]`
* `POST /api/projects/:project/goals` `{ title, description?, status? }` → `201 Goal`
* `GET /api/goals/:id` → `Goal`
* `PUT /api/goals/:id` `{ title?, description?, status? }` → `Goal`

### Tasks
* `GET /api/projects/:project/tasks?status=todo|in-progress|done&goal=<uuid>|none&ready=1`
  → `Task[]` (sorted priority high→low, then oldest first)
* `POST /api/projects/:project/tasks`
  `{ title, description? | body?, priority?, tags?, depends_on?, goal_id? }` → `201 Task`
  (`description` is wrapped as `## Objective\n\n<description>`; `body` is stored verbatim)
* `GET /api/tasks/:id` → `Task`
* `PUT /api/tasks/:id` `{ title?, body?, priority?, tags?, depends_on?, goal_id? }` → `Task`
  (status changes go through claim/release/complete/reopen; `400` on unknown fields)
* `GET /api/tasks/:id/comments` → `Comment[]`
* `POST /api/tasks/:id/comments` `{ author: "planner"|"worker", content, agent? }` → `201 Comment`

### Queue and worker lifecycle
* `GET /api/projects/:project/queue` →
  ```json
  { "project": Project, "counts": { "todo": 3, "ready": 2, "blocked": 1,
    "in-progress": 1, "done": 4, "expired": 0 },
    "workers": [ { "worker": "codex-1", "task_id": "uuid", "title": "…",
                   "claimed_at": "ISO", "lease_expires": "ISO", "expired": false } ] }
  ```
* `POST /api/projects/:project/claim`
  `{ worker, lease_seconds? (default 900, 30–86400), goal_id?, tags? }`
  → `200 Task` (now `in-progress`, assigned to `worker`) or `204` when nothing is ready.
  The claim runs in one `BEGIN IMMEDIATE` transaction: two workers can never get
  the same task, even across server processes sharing the database. Tasks whose
  lease has expired are reclaimable and count as `ready`.
* `POST /api/tasks/:id/claim` `{ worker, lease_seconds? }` → claim a specific
  task; `409` if it is not ready or is held by another worker.
* `POST /api/tasks/:id/heartbeat` `{ worker, lease_seconds? }` → `Task` with an
  extended lease; `409` if `worker` does not hold the task.
* `POST /api/tasks/:id/release` `{ worker, reason? }` → `Task` back to `todo`
  (`reason` is recorded as a worker comment); `409` if not held by `worker`.
* `POST /api/tasks/:id/complete`
  `{ worker?, summary, files_changed?, notes? }` → `Task` with `status: "done"`.
  If the task is held by another worker with a live lease → `409`.
* `POST /api/tasks/:id/reopen` → `Task` back to `todo`, completion cleared.

### Import
* `POST /api/projects/:project/import`
  `{ tasks: ImportedTask[], goal?, overwrite?, project_name? }` →
  `{ project, created, updated, skipped, tasks: [{ id, title, status }] }`.
  Creates the project if missing. Tasks are keyed by UUID: existing ones are
  **skipped** unless `overwrite: true`, so re-running an import never rolls
  back queue progress. `goal` (a title) is applied to tasks that name none.
  `ImportedTask` is what `taskflow import-planner` parses from a folder:
  `{ id, title, body, priority, status, tags, depends_on, created, goal?, assignee?,
  comments: [{ author, content, timestamp }], completion?: { completed, worker, summary, files_changed, notes } }`.
  Body limit 5 MB (256 KB elsewhere).

### Legacy planner routes (transition period)
The pre-v1 UI/agent routes keep working against one project
(`?project=<slug>`, default `TASKFLOW_DEFAULT_PROJECT` or `default`):
`GET/POST /api/tasks`, `GET/PUT /api/tasks/:id`, `POST /api/tasks/:id/complete`,
`GET /api/done`, `GET /api/done/:id`, `PUT /api/done/:id/reopen`,
`POST /api/done/:id/comments`. `GET /api/tasks` returns only active tasks, as before.

## Legacy import / export

```bash
taskflow import-planner ./planner --project my-app   # tasks/ and done/ → database
taskflow export-planner ./planner --project my-app   # database → planner/ folders
```

The CLI parses the folder locally and sends records to the import endpoint,
so the server never needs access to the client's filesystem. Import is
idempotent (keyed by task UUID; add `--overwrite` to refresh from files),
keeps comments, completion reports, `depends_on`, `goal:` and timestamps, and
never deletes the source files. A folder task marked `in-progress` imports
with an already-expired lease so any worker can reclaim it. Export moves
task folders between `tasks/` and `done/` (keeping artifacts) and writes
`goal:` / `assignee:` front matter.
