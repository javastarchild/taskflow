---
id: cb79677d-ab63-415b-8781-d9e003959cfa
title: Reusable worker CLI / API client usable from any project
priority: high
created: '2026-11-07T16:30:00.000Z'
status: done
depends_on:
  - ab716066-ebd5-4c62-9ad6-beb0f32e538c
tags:
  - cli
  - agents
  - 'owner:claude'
goal: Remote central queue
---
## Objective

Give agents a dependency-free client so a worker in any repository can claim, heartbeat, comment and complete tasks against a remote Taskflow server.

## Acceptance Criteria

- [ ] `bin/taskflow.js` (package `bin: taskflow`) reads `TASKFLOW_URL` / `TASKFLOW_TOKEN` / `TASKFLOW_PROJECT` / `TASKFLOW_WORKER` env or flags
- [ ] Commands: projects, project-create, goals, goal-create, tasks, show, create, claim, heartbeat, release, comment, complete, reopen, queue, import-planner, export-planner
- [ ] `--json` output for agents; non-zero exit on errors; exit code 3 when nothing is ready to claim
- [ ] CLI covered by an end-to-end test against a live server

## Ownership

Claude (leader/worker). Owned paths: bin/taskflow.js, server/client.js, server/cli.test.js

## Completion Evidence

Completion report must list files changed and the exact test commands run with their results.

## Context & Notes

Goal: "Remote central queue" (project `taskflow`). Contract: `docs/API.md`.
