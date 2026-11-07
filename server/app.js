const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { openStore, StoreError, UUID_RE } = require('./db');
const { importTasks } = require('./legacy');

// Agents treat tasks as instructions, so anything that can write tasks can
// steer them. Three layers keep that to intended clients:
//   1. CORS is limited to CORS_ORIGINS (comma-separated).
//   2. State-changing requests whose Origin isn't allowed are refused, even
//      if the browser sent them as "simple" requests that skip preflight.
//   3. When a token is configured, every /api request except /api/health must
//      send it as "Authorization: Bearer <token>" or "X-Taskflow-Token".
// There is deliberately no endpoint that runs commands on the server.

// Comment threads used to be split on "## PLANNER — ..." / "## WORKER — ..."
// lines, and exported planner folders still are, so text containing such a
// line could impersonate the other role. Escape the heading marker; Markdown
// renders "\##" as a literal "##".
function neutralizeRoleHeadings(text) {
    return text.replace(/^([ \t]*)(#{1,6}[ \t]*(?:PLANNER|WORKER)\b)/gim, '$1\\$2');
}

function parseOrigins(value) {
    return (value || 'http://localhost:3000,http://localhost:3001').split(',').map((o) => o.trim()).filter(Boolean);
}

function tokenMatches(given, expected) {
    const a = Buffer.from(given || '');
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function presentedToken(req) {
    const header = req.get('Authorization') || '';
    const bearer = /^Bearer\s+(.+)$/i.exec(header);
    return bearer ? bearer[1].trim() : req.get('X-Taskflow-Token') || '';
}

// The bundled UI served by this server sends its own origin; that is never a
// cross-site request, so it does not need to be listed in CORS_ORIGINS.
function sameOrigin(req, origin) {
    try {
        return new URL(origin).host === req.get('Host');
    } catch {
        return false;
    }
}

function createApp({
    store,
    token = process.env.TASKFLOW_TOKEN || '',
    origins = parseOrigins(process.env.CORS_ORIGINS),
    defaultProject = process.env.TASKFLOW_DEFAULT_PROJECT || 'default',
    buildDir = path.join(__dirname, '..', 'build'),
} = {}) {
    const app = express();
    app.disable('x-powered-by');
    app.use(cors({ origin: origins, allowedHeaders: ['Content-Type', 'Authorization', 'X-Taskflow-Token'] }));
    // Imports carry a whole planner folder, so they get a larger body limit.
    app.use('/api/projects/:project/import', express.json({ limit: '5mb' }));
    app.use(express.json({ limit: '256kb' }));

    app.get('/api/health', (req, res) => res.json({ ok: true, version: 1, auth: Boolean(token) }));

    app.use('/api', (req, res, next) => {
        const origin = req.get('Origin');
        if (req.method !== 'GET' && req.method !== 'OPTIONS' && origin && !origins.includes(origin) && !sameOrigin(req, origin)) {
            return res.status(403).json({ error: 'Origin not allowed' });
        }
        if (token && !tokenMatches(presentedToken(req), token)) {
            return res.status(401).json({ error: 'Missing or invalid token (send Authorization: Bearer <TASKFLOW_TOKEN>)' });
        }
        next();
    });

    // Every :id is a server-generated UUID; reject anything else early.
    app.param('id', (req, res, next, id) => {
        if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid id' });
        next();
    });

    const body = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});

    function sanitizeTaskInput(input) {
        const fields = { ...input };
        if (typeof fields.body === 'string') fields.body = neutralizeRoleHeadings(fields.body);
        return fields;
    }

    function newTaskFields(input) {
        const { description, body: rawBody, ...rest } = input;
        if (description !== undefined && typeof description !== 'string')
            throw new StoreError(400, 'description must be a string');
        const taskBody = rawBody !== undefined ? rawBody : description ? `## Objective\n\n${description}\n` : '';
        return sanitizeTaskInput({ ...rest, body: taskBody });
    }

    function commentInput(input) {
        const fields = { ...input };
        if (typeof fields.content === 'string') fields.content = neutralizeRoleHeadings(fields.content);
        return fields;
    }

    // ---- v1: projects ---------------------------------------------------

    app.get('/api/projects', (req, res) => res.json(store.listProjects()));
    app.post('/api/projects', (req, res) => res.status(201).json(store.createProject(body(req))));
    app.get('/api/projects/:project', (req, res) => res.json(store.getProject(req.params.project)));
    app.put('/api/projects/:project', (req, res) => res.json(store.updateProject(req.params.project, body(req))));

    // ---- v1: goals ------------------------------------------------------

    app.get('/api/projects/:project/goals', (req, res) => res.json(store.listGoals(req.params.project)));
    app.post('/api/projects/:project/goals', (req, res) => res.status(201).json(store.createGoal(req.params.project, body(req))));
    app.get('/api/goals/:id', (req, res) => res.json(store.getGoal(req.params.id)));
    app.put('/api/goals/:id', (req, res) => res.json(store.updateGoal(req.params.id, body(req))));

    // ---- v1: tasks and queue -------------------------------------------

    function listQuery(req) {
        const { status, goal, ready } = req.query;
        if (goal !== undefined && goal !== 'none' && !UUID_RE.test(goal)) throw new StoreError(400, 'goal must be a goal id or "none"');
        return { status, goal, ready: ready === '1' || ready === 'true' };
    }

    app.get('/api/projects/:project/tasks', (req, res) => res.json(store.listTasks(req.params.project, listQuery(req))));
    app.post('/api/projects/:project/tasks', (req, res) =>
        res.status(201).json(store.createTask(req.params.project, newTaskFields(body(req)))));
    app.get('/api/projects/:project/queue', (req, res) => res.json(store.queueStatus(req.params.project)));
    app.post('/api/projects/:project/claim', (req, res) => {
        const task = store.claimNext(req.params.project, body(req));
        if (!task) return res.status(204).end();
        res.json(task);
    });

    // Upsert tasks read from a legacy planner/ folder by the CLI. The server
    // never reads paths from the request; clients send parsed task records.
    app.post('/api/projects/:project/import', (req, res) => {
        const { tasks, goal, overwrite, project_name: projectName } = body(req);
        if (goal !== undefined && (typeof goal !== 'string' || !goal.trim())) throw new StoreError(400, 'goal must be a string');
        try {
            res.json(importTasks(store, tasks, {
                project: req.params.project, projectName, goal, overwrite: overwrite === true, sanitize: neutralizeRoleHeadings,
            }));
        } catch (err) {
            if (err.status === 400 && !(err instanceof StoreError)) throw new StoreError(400, err.message);
            throw err;
        }
    });

    app.get('/api/tasks/:id', (req, res) => res.json(store.getTask(req.params.id)));
    app.put('/api/tasks/:id', (req, res) => {
        const fields = { ...body(req) };
        // The pre-v1 UI sent status with every edit; tolerate a no-op status.
        if ('status' in fields) {
            if (fields.status !== store.getTask(req.params.id).status)
                throw new StoreError(400, 'status changes go through claim/release/complete/reopen');
            delete fields.status;
        }
        res.json(store.updateTask(req.params.id, sanitizeTaskInput(fields)));
    });
    app.get('/api/tasks/:id/comments', (req, res) => {
        store.getTask(req.params.id);
        res.json(store.listComments(req.params.id));
    });
    app.post('/api/tasks/:id/comments', (req, res) => res.status(201).json(store.addComment(req.params.id, commentInput(body(req)))));
    app.post('/api/tasks/:id/claim', (req, res) => res.json(store.claimTask(req.params.id, body(req))));
    app.post('/api/tasks/:id/heartbeat', (req, res) => res.json(store.heartbeat(req.params.id, body(req))));
    app.post('/api/tasks/:id/release', (req, res) => res.json(store.release(req.params.id, body(req))));
    app.post('/api/tasks/:id/complete', (req, res) => {
        const { summary, files_changed, filesChanged, notes, worker } = body(req);
        res.json(store.complete(req.params.id, { summary, files_changed: files_changed ?? filesChanged, notes, worker }));
    });
    app.post('/api/tasks/:id/reopen', (req, res) => res.json(store.reopen(req.params.id)));

    // ---- legacy planner routes, scoped to one project ------------------

    const legacyProject = (req) => store.ensureProject(typeof req.query.project === 'string' ? req.query.project : defaultProject).id;
    const active = (tasks) => tasks.filter((t) => t.status !== 'done');

    app.get('/api/tasks', (req, res) => res.json(active(store.listTasks(legacyProject(req)))));
    app.post('/api/tasks', (req, res) => {
        const { title, description, priority, tags } = body(req);
        if (!title || !description) throw new StoreError(400, 'title and description are required');
        res.status(201).json(store.createTask(legacyProject(req), newTaskFields({ title, description, priority, tags })));
    });
    app.get('/api/done', (req, res) => res.json(store.listTasks(legacyProject(req), { status: 'done' })));
    function doneTask(id) {
        const task = store.getTask(id);
        if (task.status !== 'done') throw new StoreError(404, 'Task not found');
        return task;
    }
    app.get('/api/done/:id', (req, res) => res.json(doneTask(req.params.id)));
    app.put('/api/done/:id/reopen', (req, res) => {
        doneTask(req.params.id);
        res.json(store.reopen(req.params.id));
    });
    app.post('/api/done/:id/comments', (req, res) => {
        doneTask(req.params.id);
        res.status(201).json(store.addComment(req.params.id, commentInput(body(req))));
    });

    app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

    // eslint-disable-next-line no-unused-vars
    app.use('/api', (err, req, res, next) => {
        if (err instanceof StoreError) return res.status(err.status).json({ error: err.message });
        if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
        if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    });

    // Serve the React production build — must come AFTER all /api routes.
    app.use(express.static(buildDir));
    app.get('/{*path}', (req, res, next) => res.sendFile(path.join(buildDir, 'index.html'), (err) => err && next()));

    return app;
}

function defaultDbPath() {
    return process.env.TASKFLOW_DB || path.join(__dirname, '..', 'data', 'taskflow.db');
}

module.exports = { createApp, openStore, neutralizeRoleHeadings, parseOrigins, defaultDbPath };
