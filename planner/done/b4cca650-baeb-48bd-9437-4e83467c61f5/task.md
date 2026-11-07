---
id: b4cca650-baeb-48bd-9437-4e83467c61f5
title: 'React project selector, goals, scoped task creation and queue status'
priority: high
created: '2026-11-07T16:30:00.000Z'
status: done
depends_on:
  - ab716066-ebd5-4c62-9ad6-beb0f32e538c
tags:
  - react
  - frontend
  - 'owner:codex'
goal: Remote central queue
---
## Objective

Let a human pick which project and goal agents work on, create goals and goal-scoped tasks, and see live queue/worker status from the browser.

## Acceptance Criteria

- [ ] Project selector (list + create project) persisted per browser
- [ ] Goal list with create / select / status change; task list filters by selected goal
- [ ] Task creation is scoped to selected project and goal, including priority, tags and depends_on
- [ ] Queue panel shows counts (ready/blocked/in-progress/done/expired) and active worker leases, refreshing periodically
- [ ] Active / Completed / Activity tabs keep working against the v1 project-scoped API
- [ ] Jest + RTL tests cover project selection, goal creation and scoped task creation

## Ownership

Codex (worker). Owned paths: src/**

## Completion Evidence

Completion report must list files changed and the exact test commands run with their results.

## Context & Notes

Goal: "Remote central queue" (project `taskflow`). Contract: `docs/API.md`.
