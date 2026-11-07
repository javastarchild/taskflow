---
id: 9deedf48-826f-4dbb-b549-cb685bf1bf40
title: Configurable API location and token in the React UI
priority: medium
created: '2026-11-07T16:30:00.000Z'
status: done
depends_on:
  - ab716066-ebd5-4c62-9ad6-beb0f32e538c
tags:
  - react
  - frontend
  - security
  - 'owner:codex'
goal: Remote central queue
---
## Objective

Allow the UI to talk to a remote Taskflow server instead of only the dev proxy.

## Acceptance Criteria

- [ ] API base URL from `REACT_APP_TASKFLOW_API_URL` with a runtime override in a Settings panel
- [ ] Token sent as Bearer; stored in sessionStorage by default with opt-in "remember on this device"
- [ ] 401 shows a clear sign-in prompt instead of crashing
- [ ] Tests cover base URL + auth header behaviour; `npm run build` succeeds

## Ownership

Codex (worker). Owned paths: src/api/client.js, src/components/Settings*

## Completion Evidence

Completion report must list files changed and the exact test commands run with their results.

## Context & Notes

Goal: "Remote central queue" (project `taskflow`). Contract: `docs/API.md`.
