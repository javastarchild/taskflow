# Planner / Worker System

A file-based task coordination system for AI agents and human contributors. Drop the `planner/` directory into any project to coordinate multi-agent work.

## How It Works

1. **Planner** creates tasks in `tasks/<uuid>/task.md`
2. **Workers** pick up tasks, do the work, and move the folder to `done/<uuid>/` with a `completion.md`
3. **Planner** monitors `done/` for completions and creates follow-up tasks
4. Both parties communicate by appending to `tasks/<uuid>/comments.md`

See `PLANNER_AGENT.md` and `WORKER_AGENT.md` for agent-specific instructions.

---

## Folder Structure

```
planner/
  tasks/
    <uuid>/
      task.md         # Task description (front matter + free-form)
      comments.md     # Append-only planner↔worker thread (optional)
      artifacts/      # Supporting files referenced from task.md (optional)
  done/
    <uuid>/           # Entire tasks/<uuid>/ folder moved here on completion
      task.md         # Original task (unmodified)
      completion.md   # Worker summary added on completion
      comments.md     # Preserved thread
```

---

## Task `task.md` Front Matter Schema

```yaml
---
id: <uuid>
title: Short descriptive title
priority: high | medium | low
created: 2026-01-01T00:00:00Z
status: todo | in-progress    # workers update to in-progress when starting
depends_on:                   # omit if none
  - <uuid>
tags:                         # omit if none
  - react
  - ui
---
```

Body is free-form Markdown. Recommended sections:

```markdown
## Objective
What needs to be accomplished and why.

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Context & Notes
Background, constraints, references to other tasks or files.
```

---

## Comments Protocol

Append to `tasks/<uuid>/comments.md` (never edit prior entries):

```markdown
## PLANNER — 2026-01-01T10:00:00Z
Question, clarification, or task update.

## WORKER — 2026-01-01T11:30:00Z
Progress note, question, or blocker.
```

---

## Completion `completion.md` Schema

```markdown
---
completed: 2026-01-01T12:00:00Z
worker: <agent-name>
---

## What Was Done
Summary of the work completed.

## Files Changed
- path/to/file.ext — description of change

## Notes for Planner
Decisions made, trade-offs, anything unresolved or worth following up on.
```
