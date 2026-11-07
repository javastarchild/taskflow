// End-to-end: the CLI against a live server, the way an agent in another
// repository would use it.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { run, EXIT } = require('../bin/taskflow');
const { startServer, tempDir, TOKEN } = require('./helpers');

let srv;
let env;

before(async () => {
    srv = await startServer();
    env = { TASKFLOW_URL: srv.base, TASKFLOW_TOKEN: TOKEN, TASKFLOW_PROJECT: 'cli', TASKFLOW_WORKER: 'codex-1' };
});

after(() => srv.close());

async function cli(args, extraEnv = {}) {
    const lines = [];
    const code = await run(args, { env: { ...env, ...extraEnv }, out: (s) => lines.push(s) });
    const text = lines.join('\n');
    return { code, text, json: () => JSON.parse(text) };
}

test('leader/worker loop through the CLI', async () => {
    assert.match((await cli(['health'])).text, /auth on/);
    assert.strictEqual((await cli(['project-create', 'CLI demo', '--slug', 'cli'])).code, EXIT.ok);
    const goal = (await cli(['goal-create', 'Ship CLI', '--json'])).json();
    const first = (await cli(['create', 'First', '--description', 'do it', '--priority', 'high', '--goal', goal.id, '--tags', 'a,b', '--json'])).json();
    assert.deepStrictEqual(first.tags, ['a', 'b']);
    assert.strictEqual(first.goal_id, goal.id);
    const second = (await cli(['create', 'Second', '--depends', first.id, '--json'])).json();
    assert.strictEqual(second.ready, false);

    const claimed = (await cli(['claim', '--json'])).json();
    assert.strictEqual(claimed.id, first.id);
    assert.strictEqual(claimed.assignee, 'codex-1');
    assert.strictEqual((await cli(['claim'])).code, EXIT.empty);
    assert.match((await cli(['queue'])).text, /codex-1 → /);
    assert.strictEqual((await cli(['heartbeat', first.id, '--lease', '600'])).code, EXIT.ok);
    await cli(['comment', first.id, 'halfway there']);
    await cli(['comment', first.id, 'looks good', '--as', 'planner'], { TASKFLOW_WORKER: 'claude' });
    const done = (await cli(['complete', first.id, '--summary', 'Did it', '--files', 'x.js', '--json'])).json();
    assert.strictEqual(done.status, 'done');
    assert.strictEqual(done.completion.worker, 'codex-1');

    const shown = (await cli(['show', first.id])).text;
    assert.match(shown, /## WORKER \(codex-1\)/);
    assert.match(shown, /## PLANNER \(claude\)/);
    assert.match(shown, /Completion .* by codex-1/);
    assert.strictEqual((await cli(['claim', '--json'])).json().id, second.id);
    assert.strictEqual((await cli(['release', second.id, '--reason', 'need input'])).code, EXIT.ok);
    assert.match((await cli(['tasks', '--ready'])).text, /Second/);
    assert.match((await cli(['goals'])).text, /Ship CLI .*done:1/);
});

test('import-planner and export-planner over HTTP', async () => {
    const out = tempDir('cli-export-');
    try {
        const imported = (await cli(['import-planner', path.join(__dirname, '..', 'planner'), '--goal', 'Legacy', '--json'],
            { TASKFLOW_PROJECT: 'cli-import' })).json();
        assert.ok(imported.created >= 5);
        const exported = (await cli(['export-planner', out, '--json'], { TASKFLOW_PROJECT: 'cli-import' })).json();
        assert.strictEqual(exported.active + exported.done, imported.created);
        assert.ok(fs.readdirSync(path.join(out, 'done')).length >= 5);
    } finally {
        fs.rmSync(out, { recursive: true, force: true });
    }
});

test('errors: usage, auth and unreachable server', async () => {
    await assert.rejects(cli(['tasks'], { TASKFLOW_PROJECT: '' }), /TASKFLOW_PROJECT/);
    await assert.rejects(cli(['frobnicate']), /Unknown command/);
    await assert.rejects(cli(['projects'], { TASKFLOW_TOKEN: 'wrong' }), /invalid token/);
    await assert.rejects(cli(['projects'], { TASKFLOW_URL: 'http://127.0.0.1:1' }), /Cannot reach Taskflow/);
});

test('the binary exits with documented codes', async () => {
    const bin = path.join(__dirname, '..', 'bin', 'taskflow.js');
    const exec = (args) => new Promise((resolve) => {
        execFile(process.execPath, [bin, ...args], { env: { ...process.env, ...env, TASKFLOW_PROJECT: 'empty-bin' } },
            (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
    });
    assert.strictEqual((await exec(['project-create', 'Empty', '--slug', 'empty-bin'])).code, 0);
    assert.strictEqual((await exec(['claim'])).code, 3);
    assert.strictEqual((await exec(['nope'])).code, 2);
    const failed = await exec(['show', '00000000-0000-4000-8000-000000000000']);
    assert.strictEqual(failed.code, 1);
    assert.match(failed.stderr, /Task not found/);
});
