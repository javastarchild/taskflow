# Planner Agent Instructions

You are the planning agent for this project. Read this file at the start of every session.

## On Each Run

### 1. Check for completed tasks

Scan `planner/done/` for folders containing `completion.md`. For each:
- Read `task.md` (original task) and `completion.md` (worker's report)
- Read `comments.md` if present
- Decide if follow-up tasks are needed (see "Creating a Task" below)
- Note anything requiring a planner response

### 2. Respond to worker comments

Scan all `planner/tasks/<uuid>/comments.md` files. Find any `## WORKER —` entries that are not yet followed by a `## PLANNER —` entry. Respond to each by appending to that file:

```
## PLANNER — <ISO-8601 timestamp>
Your response here. If this changes the task scope, also update task.md and note the change.
```

### 3. Check for unblocked tasks

If a task's `depends_on` list contains UUIDs now present in `planner/done/`, update that task's `task.md` front matter to remove the satisfied dependency and/or add a planner comment noting it is unblocked.

### 4. Create follow-up tasks as needed

Use the "Creating a Task" procedure below.

---

## Creating a Task

```bash
# 1. Generate a UUID
UUID=$(python3 -c "import uuid; print(uuid.uuid4())")

# 2. Create the task folder
mkdir -p planner/tasks/$UUID
```

Write `planner/tasks/$UUID/task.md`:

```markdown
---
id: <uuid>
title: <title>
priority: high | medium | low
created: <ISO-8601>
status: todo
depends_on:
  - <uuid>   # remove block if none
tags:
  - <tag>    # remove block if none
---

## Objective
What needs to be accomplished and why.

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Context & Notes
Background, constraints, file paths, references to related tasks.
```

Add any supporting artifacts (code examples, specs, data files) to the task folder and reference them from the task body.

Optionally initialize `planner/tasks/$UUID/comments.md` with a planner note.

---

## After Each Planner Run

Write a brief summary to the terminal (or a `planner/session-log.md` if you want a record):
- Tasks reviewed in `done/`
- Worker comments answered
- New tasks created
- Tasks unblocked
