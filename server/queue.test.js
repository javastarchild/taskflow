// Queue semantics: atomic claims, leases, ownership and durability.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { startServer, fakeClock, tempDir, TOKEN } = require('./helpers');

async function seed(api, slug, n, extra = {}) {
    await api('POST', '/projects', { name: slug, slug });
    const ids = [];
    for (let i = 0; i < n; i++) ids.push((await api('POST', `/projects/${slug}/tasks`, { title: `task ${i}`, ...extra })).body.id);
    return ids;
}

test('parallel claims never hand the same task to two workers', async () => {
    const srv = await startServer();
    try {
        await seed(srv.api, 'race', 10);
        const results = await Promise.all(Array.from({ length: 30 }, (_, i) =>
            srv.api('POST', '/projects/race/claim', { worker: `w${i}` })));
        const claimed = results.filter((r) => r.status === 200).map((r) => r.body.id);
        assert.strictEqual(claimed.length, 10);
        assert.strictEqual(new Set(claimed).size, 10);
        assert.strictEqual(results.filter((r) => r.status === 204).length, 20);
        const queue = (await srv.api('GET', '/projects/race/queue')).body;
        assert.strictEqual(queue.counts['in-progress'], 10);
        assert.strictEqual(queue.counts.ready, 0);
        assert.strictEqual(queue.workers.length, 10);
    } finally {
        await srv.close();
    }
});

// Two independent server processes share one database file, as two replicas
// (or a crashed-and-restarted server plus a new one) would.
function spawnServer(dbPath) {
    const script = `
        const { createApp } = require(${JSON.stringify(path.join(__dirname, 'app.js'))});
        const { openStore } = require(${JSON.stringify(path.join(__dirname, 'db.js'))});
        const app = createApp({ store: openStore(process.env.DB), token: process.env.TOKEN, origins: [] });
        const s = app.listen(0, '127.0.0.1', () => console.log('PORT ' + s.address().port));`;
    const child = spawn(process.execPath, ['-e', script], { env: { ...process.env, DB: dbPath, TOKEN }, stdio: ['ignore', 'pipe', 'inherit'] });
    return new Promise((resolve, reject) => {
        let buf = '';
        child.stdout.on('data', (d) => {
            buf += d;
            const m = /PORT (\d+)/.exec(buf);
            if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` });
        });
        child.on('exit', (code) => reject(new Error(`server exited ${code}`)));
    });
}

test('claims stay exclusive across two server processes sharing the database', async () => {
    const dir = tempDir();
    const dbPath = path.join(dir, 'shared.db');
    const seeder = await startServer({ dbPath });
    const ids = await seed(seeder.api, 'multi', 12);
    await seeder.close({ keepDb: true });
    const servers = await Promise.all([spawnServer(dbPath), spawnServer(dbPath)]);
    try {
        const claim = (base, worker) => fetch(`${base}/api/projects/multi/claim`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
            body: JSON.stringify({ worker }),
        }).then(async (r) => ({ status: r.status, body: r.status === 200 ? await r.json() : null }));
        const results = await Promise.all(Array.from({ length: 30 }, (_, i) => claim(servers[i % 2].base, `proc${i % 2}-w${i}`)));
        const claimed = results.filter((r) => r.status === 200).map((r) => r.body.id);
        assert.strictEqual(claimed.length, ids.length);
        assert.strictEqual(new Set(claimed).size, ids.length);
        assert.ok(results.every((r) => r.status === 200 || r.status === 204));
    } finally {
        for (const { child } of servers) child.kill();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('claim respects priority, dependencies, goal and tag filters', async () => {
    const srv = await startServer();
    const { api } = srv;
    try {
        await api('POST', '/projects', { name: 'order', slug: 'order' });
        const goal = (await api('POST', '/projects/order/goals', { title: 'G' })).body;
        const low = (await api('POST', '/projects/order/tasks', { title: 'low', priority: 'low' })).body;
        const high = (await api('POST', '/projects/order/tasks', { title: 'high', priority: 'high', depends_on: [low.id] })).body;
        const tagged = (await api('POST', '/projects/order/tasks', { title: 'tagged', priority: 'medium', tags: ['ui'], goal_id: goal.id })).body;
        assert.strictEqual(high.ready, false);
        assert.deepStrictEqual(high.blocked_by, [low.id]);
        assert.strictEqual((await api('POST', '/projects/order/claim', { worker: 'a', tags: ['nope'] })).status, 204);
        assert.strictEqual((await api('POST', '/projects/order/claim', { worker: 'a', goal_id: goal.id })).body.id, tagged.id);
        // high is blocked, so the low-priority dependency comes next.
        assert.strictEqual((await api('POST', '/projects/order/claim', { worker: 'b' })).body.id, low.id);
        assert.strictEqual((await api('POST', `/tasks/${high.id}/claim`, { worker: 'c' })).status, 409);
        await api('POST', `/tasks/${low.id}/complete`, { worker: 'b', summary: 'done' });
        const unblocked = await api('POST', '/projects/order/claim', { worker: 'c' });
        assert.strictEqual(unblocked.body.id, high.id);
        assert.strictEqual((await api('POST', '/projects/order/claim', { worker: 'c' })).status, 204);
        assert.strictEqual((await api('POST', '/projects/order/claim', {})).status, 400);
    } finally {
        await srv.close();
    }
});

test('lease ownership, heartbeat, release, expiry and reclaim', async () => {
    const now = fakeClock();
    const srv = await startServer({ now });
    const { api } = srv;
    try {
        const [id] = await seed(api, 'lease', 1);
        const claimed = (await api('POST', `/tasks/${id}/claim`, { worker: 'alice', lease_seconds: 60 })).body;
        assert.strictEqual(claimed.assignee, 'alice');
        assert.strictEqual(claimed.lease_expires, '2026-01-01T00:01:00.000Z');
        assert.strictEqual(claimed.attempts, 1);
        // Re-claiming your own task is a no-op; anyone else is refused.
        assert.strictEqual((await api('POST', `/tasks/${id}/claim`, { worker: 'alice' })).status, 200);
        assert.strictEqual((await api('POST', `/tasks/${id}/claim`, { worker: 'bob' })).status, 409);
        assert.strictEqual((await api('POST', `/tasks/${id}/heartbeat`, { worker: 'bob' })).status, 409);
        assert.strictEqual((await api('POST', `/tasks/${id}/release`, { worker: 'bob' })).status, 409);
        assert.strictEqual((await api('POST', `/tasks/${id}/complete`, { worker: 'bob', summary: 'x' })).status, 409);

        now.advance(45);
        const beat = (await api('POST', `/tasks/${id}/heartbeat`, { worker: 'alice', lease_seconds: 60 })).body;
        assert.strictEqual(beat.lease_expires, '2026-01-01T00:01:45.000Z');

        now.advance(120);
        const queue = (await api('GET', '/projects/lease/queue')).body;
        assert.strictEqual(queue.counts.expired, 1);
        assert.strictEqual(queue.counts.ready, 1);
        assert.strictEqual(queue.workers[0].expired, true);
        const stolen = (await api('POST', '/projects/lease/claim', { worker: 'bob' })).body;
        assert.strictEqual(stolen.id, id);
        assert.strictEqual(stolen.assignee, 'bob');
        assert.strictEqual(stolen.attempts, 2);
        assert.strictEqual((await api('POST', `/tasks/${id}/heartbeat`, { worker: 'alice' })).status, 409);

        const released = (await api('POST', `/tasks/${id}/release`, { worker: 'bob', reason: 'blocked on review' })).body;
        assert.strictEqual(released.status, 'todo');
        assert.strictEqual(released.assignee, null);
        assert.match(released.comments.at(-1).content, /blocked on review/);

        await api('POST', `/tasks/${id}/claim`, { worker: 'carol' });
        const done = (await api('POST', `/tasks/${id}/complete`, { worker: 'carol', summary: 'shipped', files_changed: 'a.js', notes: 'n' })).body;
        assert.strictEqual(done.status, 'done');
        assert.deepStrictEqual(done.completion, { completed: now().toISOString(), worker: 'carol', summary: 'shipped', files_changed: 'a.js', notes: 'n' });
        assert.strictEqual((await api('POST', `/tasks/${id}/complete`, { worker: 'carol', summary: 'again' })).status, 409);
        const reopened = (await api('POST', `/tasks/${id}/reopen`)).body;
        assert.strictEqual(reopened.status, 'todo');
        assert.strictEqual(reopened.completion, null);
    } finally {
        await srv.close();
    }
});

test('lease_seconds is clamped and validated', async () => {
    const now = fakeClock();
    const srv = await startServer({ now });
    try {
        const [a, b] = await seed(srv.api, 'clamp', 2);
        assert.strictEqual((await srv.api('POST', `/tasks/${a}/claim`, { worker: 'w', lease_seconds: 1 })).body.lease_expires, '2026-01-01T00:00:30.000Z');
        assert.strictEqual((await srv.api('POST', `/tasks/${b}/claim`, { worker: 'w', lease_seconds: 'soon' })).status, 400);
    } finally {
        await srv.close();
    }
});

test('projects, goals, tasks, claims and comments survive a server restart', async () => {
    const dir = tempDir();
    const dbPath = path.join(dir, 'restart.db');
    try {
        const first = await startServer({ dbPath });
        const [id] = await seed(first.api, 'durable', 1);
        const goal = (await first.api('POST', '/projects/durable/goals', { title: 'Persist' })).body;
        await first.api('PUT', `/tasks/${id}`, { goal_id: goal.id });
        await first.api('POST', `/tasks/${id}/claim`, { worker: 'codex', lease_seconds: 3600 });
        await first.api('POST', `/tasks/${id}/comments`, { author: 'worker', content: 'halfway' });
        await first.close({ keepDb: true });

        const second = await startServer({ dbPath });
        const task = (await second.api('GET', `/tasks/${id}`)).body;
        assert.strictEqual(task.status, 'in-progress');
        assert.strictEqual(task.assignee, 'codex');
        assert.strictEqual(task.goal_id, goal.id);
        assert.strictEqual(task.comments[0].content, 'halfway');
        assert.strictEqual((await second.api('POST', '/projects/durable/claim', { worker: 'other' })).status, 204);
        const done = await second.api('POST', `/tasks/${id}/complete`, { worker: 'codex', summary: 'finished after restart' });
        assert.strictEqual(done.body.status, 'done');
        await second.close({ keepDb: true });
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
