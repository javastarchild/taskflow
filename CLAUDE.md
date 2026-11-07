# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run server                         # API + built UI on :3001 (TASKFLOW_DB, TASKFLOW_TOKEN)
npm start                              # UI dev server on :3000, proxies /api to :3001
npm run test:server                    # server/*.test.js — API, queue, legacy import, CLI
CI=true npm test -- --watchAll=false   # React tests (Jest + React Testing Library)
npm run build                          # Production UI build to /build
node bin/taskflow.js help              # CLI
```

Requires Node >= 22.5 (built-in `node:sqlite`).

## Architecture

- `server/db.js` — central SQLite store: projects, goals, tasks, comments, claim/lease lifecycle. Claims run in `BEGIN IMMEDIATE` transactions.
- `server/app.js` — `createApp({ store, token, origins })`: Express routes from `docs/API.md`, bearer-token auth, Origin checks, legacy `/api/tasks` + `/api/done` adapters. No endpoint may execute commands or read server paths.
- `server/legacy.js` — import/export of the old `planner/tasks|done/<uuid>/` folder protocol.
- `server/client.js` + `bin/taskflow.js` — dependency-free HTTP client and `taskflow` CLI for agents in any repo.
- `src/` — React 19 (CRA) UI: project selector, goals, project/goal-scoped tasks, queue panel, settings for API URL/token.
- `docs/API.md` is the HTTP contract; keep it in sync with routes.
- `planner/` is this repo's own task history in folder format (load it with `npm run seed:self`).

Tests use `@testing-library/react` — assert on rendered output, not implementation details. Server tests use `node:test` with `server/helpers.js`.
