// Legacy planner/ folder import and export.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { openStore } = require('./db');
const { importPlanner, exportPlanner, readPlannerFolder, parseComments } = require('./legacy');
const { tempDir } = require('./helpers');

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function write(file, text) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
}

// A folder in the shape PLANNER_AGENT.md / WORKER_AGENT.md produce.
function makePlanner() {
    const dir = tempDir('planner-');
    write(path.join(dir, 'done', A, 'task.md'), `---
id: ${A}
title: Backend API
priority: high
created: 2026-05-02T00:00:00Z
status: todo
tags:
  - backend
---

## Objective

Build it.
`);
    write(path.join(dir, 'done', A, 'completion.md'), `---
completed: 2026-05-02T08:00:00Z
worker: claude-sonnet-4-6
---

## What Was Done

Built the API.

## Files Changed

- server/index.js — routes

## Notes for Planner

None.
`);
    write(path.join(dir, 'done', A, 'comments.md'), `
## WORKER — 2026-05-02T01:00:00Z
Starting.

## PLANNER — 2026-05-02T02:00:00Z
Go ahead.
`);
    write(path.join(dir, 'tasks', B, 'task.md'), `---
id: ${B}
title: Frontend
priority: medium
created: 2026-05-03T00:00:00Z
status: in-progress
depends_on:
  - ${A}
---

## Objective

UI.
`);
    write(path.join(dir, 'tasks', C, 'task.md'), `---
id: ${C}
title: Docs
priority: bogus
created: 2026-05-04T00:00:00Z
status: todo
depends_on:
  - ${B}
---
Write docs.
`);
    fs.mkdirSync(path.join(dir, 'tasks', 'not-a-task'));
    return dir;
}

function snapshot(store, slug) {
    return store.listTasks(slug).map(({ updated, lease_expires, claimed_at, lease_expired, ready, ...t }) => ({
        ...t, comments: t.comments.map(({ id, task_id, ...c }) => c),
    }));
}

test('import keeps tasks, comments, completions and dependencies', () => {
    const dir = makePlanner();
    const store = openStore(':memory:');
    try {
        const summary = importPlanner(store, dir, { project: 'legacy', goal: 'Imported work' });
        assert.strictEqual(summary.created, 3);
        const done = store.getTask(A);
        assert.strictEqual(done.status, 'done');
        assert.strictEqual(done.created, '2026-05-02T00:00:00.000Z');
        assert.deepStrictEqual(done.tags, ['backend']);
        assert.deepStrictEqual(done.comments.map((c) => [c.author, c.content]), [['worker', 'Starting.'], ['planner', 'Go ahead.']]);
        assert.deepStrictEqual(done.completion, {
            completed: '2026-05-02T08:00:00.000Z', worker: 'claude-sonnet-4-6', summary: 'Built the API.',
            files_changed: '- server/index.js — routes', notes: 'None.',
        });
        const inProgress = store.getTask(B);
        assert.strictEqual(inProgress.status, 'in-progress');
        assert.strictEqual(inProgress.assignee, 'legacy-import');
        // Folder claims had no lease, so they import as immediately reclaimable.
        assert.strictEqual(inProgress.lease_expired, true);
        const docs = store.getTask(C);
        assert.strictEqual(docs.priority, 'medium');
        assert.deepStrictEqual(docs.blocked_by, [B]);
        assert.strictEqual(store.listGoals('legacy')[0].title, 'Imported work');
        assert.ok(store.listTasks('legacy').every((t) => t.goal_id === store.listGoals('legacy')[0].id));
        // The source folder is untouched.
        assert.ok(fs.existsSync(path.join(dir, 'tasks', B, 'task.md')));
    } finally {
        store.close();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('re-import is idempotent and never rolls back queue progress', () => {
    const dir = makePlanner();
    const store = openStore(':memory:');
    try {
        importPlanner(store, dir, { project: 'legacy' });
        const before = snapshot(store, 'legacy');
        const again = importPlanner(store, dir, { project: 'legacy' });
        assert.deepStrictEqual([again.created, again.updated, again.skipped], [0, 0, 3]);
        assert.deepStrictEqual(snapshot(store, 'legacy'), before);
        store.complete(C, { worker: 'w', summary: 'done in the queue' });
        importPlanner(store, dir, { project: 'legacy' });
        assert.strictEqual(store.getTask(C).status, 'done');
        const refreshed = importPlanner(store, dir, { project: 'legacy', overwrite: true });
        assert.strictEqual(refreshed.updated, 3);
        assert.strictEqual(store.getTask(C).status, 'todo');
        assert.strictEqual(store.getTask(A).comments.length, 2);
    } finally {
        store.close();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('export → import round trip preserves task data and moves folders', () => {
    const dir = makePlanner();
    const out = tempDir('export-');
    const store = openStore(':memory:');
    const other = openStore(':memory:');
    try {
        importPlanner(store, dir, { project: 'legacy', goal: 'Imported work' });
        fs.writeFileSync(path.join(dir, 'tasks', C, 'notes.txt'), 'artifact');
        // Complete one task in the store, then export over the original folder.
        store.complete(C, { worker: 'codex', summary: 'Docs written' });
        const summary = exportPlanner(store, dir, { project: 'legacy' });
        assert.deepStrictEqual(summary, { project: 'legacy', active: 1, done: 2 });
        assert.ok(!fs.existsSync(path.join(dir, 'tasks', C)));
        assert.strictEqual(fs.readFileSync(path.join(dir, 'done', C, 'notes.txt'), 'utf-8'), 'artifact');
        assert.match(fs.readFileSync(path.join(dir, 'done', C, 'completion.md'), 'utf-8'), /worker: codex/);
        assert.strictEqual(parseComments(fs.readFileSync(path.join(dir, 'done', A, 'comments.md'), 'utf-8')).length, 2);

        exportPlanner(store, out, { project: 'legacy' });
        importPlanner(other, out, { project: 'legacy' });
        const strip = (tasks) => tasks.map(({ goal_id, project_id, ...t }) => t);
        assert.deepStrictEqual(strip(snapshot(other, 'legacy')), strip(snapshot(store, 'legacy')));
        assert.strictEqual(other.listGoals('legacy')[0].title, 'Imported work');
    } finally {
        store.close();
        other.close();
        fs.rmSync(dir, { recursive: true, force: true });
        fs.rmSync(out, { recursive: true, force: true });
    }
});

test("the repository's own planner folder imports cleanly", () => {
    const tasks = readPlannerFolder(path.join(__dirname, '..', 'planner'));
    assert.ok(tasks.length >= 5);
    assert.ok(tasks.every((t) => t.id && t.title && t.body));
    assert.ok(tasks.filter((t) => t.status === 'done').every((t) => t.completion && t.completion.summary));
});
