# Taskflow

Taskflow is a task queue for AI agents and the people steering them. A **leader**
(for example Claude) plans projects, goals and tasks. **Workers** (for example
Codex, or more Claude sessions) claim tasks, report progress and record what they
did. A React UI lets you choose the project and goal agents work on and watch the
queue.

All data lives in **one central SQLite database behind an authenticated HTTP API**.
You no longer copy a `planner/` folder into each repository. Agents in any checkout,
on any machine that can reach the server, use the `taskflow` CLI or the HTTP API
([docs/API.md](docs/API.md)).

```
 ┌──────────── leader (Claude) ───────────┐    ┌──── worker (Codex) ────┐
 │ taskflow create / goal-create / comment│    │ taskflow claim / heart-│
 └──────────────────┬─────────────────────┘    │ beat / complete        │
                    │ HTTPS + Bearer token     └───────────┬────────────┘
             ┌──────▼──────────────────────────────────────▼──────┐
             │ Taskflow server (Express)  ── React UI (same port) │
             │ data/taskflow.db  (SQLite: projects, goals, tasks, │
             │                    comments, leases, completions)  │
             └────────────────────────────────────────────────────┘
```

## Requirements

* Node.js **22.5 or newer**. The store uses the built-in `node:sqlite` module, so
  there is no native npm dependency to compile. Node prints a one-time
  "SQLite is experimental" notice, which Taskflow suppresses.

## Quick start (local)

```bash
npm install
export TASKFLOW_TOKEN=$(openssl rand -hex 24)    # optional on localhost, required beyond it
npm run server                                    # API on http://127.0.0.1:3001, DB at data/taskflow.db
npm start                                         # UI dev server on http://localhost:3000 (proxies /api)
```

Open http://localhost:3000. If the server has a token, the UI asks for it in
**Settings**. Then create or select a project, add goals, and create tasks
scoped to the selected goal. The **Queue** panel shows ready, blocked,
in-progress, done and expired-lease counts and which worker holds which task.

Production-style single process:

```bash
npm run build && TASKFLOW_TOKEN=... npm run server   # UI and API both on :3001
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `TASKFLOW_DB` | `data/taskflow.db` | SQLite file holding every project. Back this file up. |
| `TASKFLOW_TOKEN` | _(unset)_ | Shared API token. Clients send `Authorization: Bearer <token>` (or the legacy `X-Taskflow-Token`). |
| `HOST` | `0.0.0.0` with a token, else `127.0.0.1` | Bind address. Without a token the server **refuses** non-loopback binds. |
| `TASKFLOW_INSECURE_NO_TOKEN` | _(unset)_ | Set to `1` to allow a non-loopback bind without a token. Not recommended. |
| `PORT` | `3001` | Listen port. |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:3001` | Extra browser origins allowed to call the API (e.g. a separately hosted UI). The server's own origin is always allowed. |
| `TASKFLOW_DEFAULT_PROJECT` | `default` | Project used by the legacy `/api/tasks` and `/api/done` routes. |
| `REACT_APP_TASKFLOW_API_URL` | _(empty = same origin)_ | Build-time API location for the UI. It can also be changed at runtime in the UI **Settings** panel. |

CLI and agent variables: `TASKFLOW_URL`, `TASKFLOW_TOKEN` or `TASKFLOW_TOKEN_FILE`,
`TASKFLOW_PROJECT`, `TASKFLOW_WORKER`.

## Deployment

### Docker

```bash
docker build -t taskflow .
docker run -d --name taskflow -p 3000:3000 \
  -e TASKFLOW_TOKEN="$(openssl rand -hex 24)" \
  -v taskflow-data:/data taskflow
```

The image serves both the UI and API on port 3000 and stores the database at
`/data/taskflow.db`. Without `TASKFLOW_TOKEN` the container binds to loopback
only, so it is unreachable. That is deliberate.

### Remote access

The token protects the API, but it travels in a header, so **put the server
behind TLS** (a reverse proxy such as Caddy or nginx, or a private network such
as Tailscale or WireGuard) before you expose it beyond a trusted network. Run
one server process per database file. Several processes on the same file are
safe for claims (each claim takes SQLite's write lock with `BEGIN IMMEDIATE`),
but the file must be on a local disk, not NFS.

## Security model

* **Authentication:** one shared bearer token (`TASKFLOW_TOKEN`), compared in
  constant time. `/api/health` is the only unauthenticated route.
* **Safe default bind:** without a token the server listens on `127.0.0.1` only.
* **Browser protection:** CORS is restricted to `CORS_ORIGINS`. Writes whose
  `Origin` is neither allowed nor the server itself are rejected (403), even
  with a valid token. This blocks CSRF-style "simple" requests.
* **Agent-injection hygiene:** agents treat tasks as instructions. Comments and
  task bodies have `## PLANNER` / `## WORKER` headings escaped, so one role
  cannot forge the other's messages. Comments carry a server-assigned role and
  timestamp.
* **Validation:** ids must be UUIDs, and enums, tag lists, dependency lists and
  sizes are validated. Server-owned fields (`id`, `created`, `status`,
  `assignee`) cannot be edited directly.
* **No remote execution:** there is no endpoint that runs commands or reads
  server-side paths. Legacy import reads folders on the *client* and sends
  parsed records.
* **UI token storage:** the token is kept in `sessionStorage`, or in
  `localStorage` only if you tick "Remember on this device".

There are no per-user accounts. Anyone with the token has full access to all
projects.

## The `taskflow` CLI (from any project)

The CLI has no setup beyond Node. Use it from any repository:

```bash
# once: make the command available everywhere
cd /path/to/taskflow && npm link          # or: alias taskflow="node /path/to/taskflow/bin/taskflow.js"

export TASKFLOW_URL=https://taskflow.example.internal
export TASKFLOW_TOKEN_FILE=~/.config/taskflow/token
export TASKFLOW_PROJECT=my-app
export TASKFLOW_WORKER=codex-1

taskflow queue                          # counts + who holds what
taskflow claim --json                   # atomically take the best ready task (exit 3 if none)
taskflow heartbeat <id> --lease 900     # keep the lease alive while working
taskflow comment <id> "question / progress"
taskflow complete <id> --summary "…" --files "…" --notes "…"
taskflow release <id> --reason "blocked on …"
```

Run `taskflow help` for every command. Every command accepts `--json` for
machine-readable output. Exit codes: `0` ok, `1` error, `2` usage, `3` nothing
ready to claim.

### Queue semantics

* A task is **ready** when it is `todo` and every `depends_on` task is `done`.
  A dependency id that does not exist counts as unfinished.
* `claim` picks the highest priority ready task, oldest first, optionally
  filtered by `--goal` or `--tags`. It is atomic: two workers never get the
  same task.
* A claim holds a **lease** (default 15 minutes, 30 seconds to 24 hours).
  `heartbeat` extends it. When a worker dies, its lease expires and another
  worker can claim the task (`attempts` counts claims).
* Only the lease holder can heartbeat, release or complete a task. Anyone can
  complete a task whose lease has expired. `reopen` returns a done task to
  `todo`.

## Claude as leader, Codex as worker

1. **Leader (Claude)** sets up the work:
   ```bash
   taskflow project-create "My App" --slug my-app --repo https://github.com/me/my-app
   taskflow goal-create "Remote access" --description "…"            # note the goal id
   taskflow create "Add auth middleware" --goal <goal-id> --priority high \
       --body-file task.md --tags backend,owner:codex
   taskflow create "Docs" --goal <goal-id> --depends <task-id>
   ```
   Write task bodies with the protocol sections (`## Objective`,
   `## Acceptance Criteria`, `## Context & Notes`). Use `owner:<agent>` tags so
   workers can filter with `claim --tags owner:codex`.
2. **Worker (Codex)** runs in its own checkout of the target repository with
   `TASKFLOW_WORKER=codex-1`. It loops: `claim` → read with `show` → work →
   `heartbeat` → `comment` for questions → `complete` with a summary, files
   changed and the exact test commands and results as evidence.
3. **Leader** watches `taskflow queue` or the UI, answers worker comments with
   `taskflow comment <id> "…" --as planner`, reviews completions, and uses
   `reopen` or follow-up tasks when acceptance criteria aren't met.

A short prompt for the worker:

> You are a Taskflow worker. Run `taskflow claim --json --tags owner:codex`.
> Exit code 3 means nothing is ready, so stop. Otherwise do exactly the task's
> Acceptance Criteria in this repo. Run `taskflow heartbeat <id>` at least
> every 10 minutes. Ask questions with `taskflow comment`. When you are done,
> run `taskflow complete <id> --summary … --files … --notes "<tests run + results>"`.

## Migrating from copied `planner/` folders

The old protocol (`planner/tasks/<uuid>/task.md`, `comments.md`, and
`planner/done/<uuid>/completion.md`) is still understood:

```bash
taskflow import-planner ./planner --project my-app --goal "Pre-queue backlog"
taskflow export-planner ./planner-export --project my-app   # back to folders
```

* The import keeps titles, bodies, priorities, tags, `depends_on`, timestamps,
  the full comment thread and completion reports. It is idempotent: tasks
  already in the queue are skipped unless you pass `--overwrite`. Source files
  are never modified.
* Folder tasks marked `in-progress` have no lease, so they import as
  reclaimable.
* Export writes the same layout, plus `goal:` and `assignee:` front matter, so
  file-reading agents keep working during the transition.
* The pre-v1 routes (`/api/tasks`, `/api/done`, …) still work against
  `TASKFLOW_DEFAULT_PROJECT` (or `?project=<slug>`).

### This repository's own history

Taskflow is developed through its own queue. `planner/` holds the original UI
build (5 tasks) and the central-queue work (7 tasks) in the folder protocol,
exported from the live queue. To load them:

```bash
npm run seed:self                                        # into TASKFLOW_DB
TASKFLOW_URL=… TASKFLOW_TOKEN=… npm run seed:self        # into a remote server
```

## Development

| Command | What it does |
|---|---|
| `npm run server` | API server (`server/index.js`) |
| `npm start` | UI dev server with hot reload; `/api` is proxied to `:3001` |
| `npm run test:server` | API, queue, legacy and CLI tests (Node's built-in test runner) |
| `CI=true npm test -- --watchAll=false` | React tests (Jest + Testing Library) |
| `npm run build` | Production UI build into `build/` |

Layout: `server/db.js` (store and queue logic), `server/app.js` (HTTP routes and
auth), `server/legacy.js` (planner folder import and export), `server/client.js`
and `bin/taskflow.js` (client and CLI), `src/` (React UI), `docs/API.md` (HTTP
contract).

## Limitations

* There is one shared token, with no per-user or per-project permissions and no
  audit of which token holder acted. Worker names are self-reported.
* Single-node SQLite: scale up rather than out. Back up `TASKFLOW_DB`, for
  example with `sqlite3 data/taskflow.db ".backup …"`.
* No push notifications: the UI polls the queue (every few seconds), and
  workers poll with `claim`.
* Leases are not renewed automatically. Long-running workers must call
  `heartbeat`.
* No deletion endpoints for projects, goals or tasks yet. Archive goals
  instead.
* The folder export carries goal titles, but not goal status, goal descriptions
  or comment agent names.
* `node:sqlite` is still marked experimental in Node 22.
