// Shared setup for the server tests (not itself a test file).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('./app');
const { openStore } = require('./db');

const TOKEN = 'test-token';
const ORIGIN = 'http://localhost:3000';

function tempDir(prefix = 'taskflow-test-') {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// A controllable clock so lease expiry can be tested without sleeping.
function fakeClock(start = '2026-01-01T00:00:00.000Z') {
    let t = new Date(start).getTime();
    const now = () => new Date(t);
    now.advance = (seconds) => { t += seconds * 1000; };
    return now;
}

async function startServer({ dbPath, token = TOKEN, now, store } = {}) {
    const dir = dbPath ? null : tempDir();
    const file = dbPath || path.join(dir, 'taskflow.db');
    const db = store || openStore(file, now ? { now } : {});
    const app = createApp({ store: db, token, origins: [ORIGIN], buildDir: path.join(__dirname, 'no-build') });
    const server = app.listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    async function api(method, route, body, extraHeaders = {}) {
        const res = await fetch(`${base}/api${route}`, {
            method, headers: { ...headers, ...extraHeaders }, body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await res.text();
        return { status: res.status, body: text ? JSON.parse(text) : null };
    }
    async function close({ keepDb = false } = {}) {
        await new Promise((r) => server.close(r));
        if (!store) db.close();
        if (dir && !keepDb) fs.rmSync(dir, { recursive: true, force: true });
    }
    return { base, api, store: db, dbPath: file, close, token };
}

module.exports = { startServer, fakeClock, tempDir, TOKEN, ORIGIN };
