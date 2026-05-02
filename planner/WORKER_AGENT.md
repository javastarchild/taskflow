# Worker Agent Guide

**Read `planning.md` first** to find out which task to pick up and whether its dependencies are satisfied. Do not infer order by reading all task files.

---

## Operational Flow

### 1. Discovery

Check `planning.md` for the current phase. Only pick up tasks whose phase dependencies are fully present in `done/`. Do not start a task if any UUID in its `depends_on` list is not yet in `done/`.

### 2. Examination

Open `tasks/<uuid>/task.md`. Read it fully, including:
- Front matter (id, priority, `depends_on`, `tags`)
- Objective and Acceptance Criteria
- Any supporting artifacts in the task folder

### 3. Claim the task

Update the `status` field in `task.md` front matter from `todo` to `in-progress` so other workers know it is taken.

### 4. Planning

Before writing any code, formulate a plan: identify files to create or modify, required dependencies, and potential blockers. If anything in the task description is unclear, add a worker comment (see below) and wait for a planner response before proceeding.

### 5. Execution

Execute the plan. Stay within the scope of the Acceptance Criteria. If you discover the scope is larger than described, add a worker comment rather than expanding unilaterally.

### 6. Completion

When all Acceptance Criteria are checked off:

```bash
# Move the entire task folder to done/
mv planner/tasks/<uuid> planner/done/<uuid>
```

Then write `planner/done/<uuid>/completion.md`:

```markdown
---
completed: <ISO-8601 timestamp>
worker: <your-agent-name>
---

## What Was Done
Concise summary of the work completed.

## Files Changed
- path/to/file.ext — what changed and why

## Notes for Planner
Decisions made, trade-offs, anything unresolved, suggested follow-up tasks.
```

Place any output artifacts in `planner/done/<uuid>/` and reference them from `completion.md`.

---

## Adding a Comment or Question

Append to `planner/tasks/<uuid>/comments.md` (create the file if it doesn't exist). Never edit prior entries.

```markdown
## WORKER — <ISO-8601 timestamp>
Your progress note, question, or blocker description.
```

The planner periodically scans all `comments.md` files and will append a `## PLANNER —` response.

---

## Conventions

- One worker per task at a time — claim it by setting `status: in-progress` before doing any work
- Never modify tasks you did not claim
- The Acceptance Criteria in `task.md` are your definition of done
- Always prioritize understanding dependencies before writing any code
