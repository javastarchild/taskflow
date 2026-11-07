---
id: 837f97f1-e9b2-4441-ac52-115dd5103661
title: 'README: setup, deployment, security and Claude leader / Codex worker workflow'
priority: medium
created: '2026-11-07T16:30:00.000Z'
status: done
depends_on:
  - ab716066-ebd5-4c62-9ad6-beb0f32e538c
  - cc6e6b99-7f36-40ec-b41a-60525f55382a
  - cb79677d-ab63-415b-8781-d9e003959cfa
  - b4cca650-baeb-48bd-9437-4e83467c61f5
  - 9deedf48-826f-4dbb-b549-cb685bf1bf40
tags:
  - docs
  - 'owner:claude'
goal: Remote central queue
---
## Objective

Replace the CRA boilerplate README with real documentation of the central queue.

## Acceptance Criteria

- [ ] Local setup, Docker deployment and environment variables documented
- [ ] Security model (token, origins, localhost bind, no shell endpoints) documented
- [ ] Step-by-step Claude-leader / Codex-worker loop using the CLI
- [ ] Migration from copied planner/ folders documented
- [ ] CLAUDE.md architecture section updated
- [ ] Known limitations listed

## Ownership

Claude (leader). Owned paths: README.md, CLAUDE.md, Dockerfile, planner/*.md

## Completion Evidence

Completion report must list files changed and the exact test commands run with their results.

## Context & Notes

Goal: "Remote central queue" (project `taskflow`). Contract: `docs/API.md`.
