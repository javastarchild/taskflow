const express = require('express');
const cors = require('cors');
const path = require('path');
const fsp = require('fs').promises;
const matter = require('gray-matter');
const crypto = require('crypto');

const app = express();

// Agents treat task files as instructions, so any page that can write tasks
// can steer them. Three layers keep that to the intended UI:
//   1. CORS is limited to CORS_ORIGINS (comma-separated).
//   2. State-changing requests whose Origin isn't allowed are refused, even
//      if the browser sent them as "simple" requests that skip preflight.
//   3. When TASKFLOW_TOKEN is set, every /api request must send it in the
//      X-Taskflow-Token header (the SPA asks for it once per session).
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001')
    .split(',').map((o) => o.trim()).filter(Boolean);
const TOKEN = process.env.TASKFLOW_TOKEN || '';

app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json({ limit: '256kb' }));

app.use('/api', (req, res, next) => {
    const origin = req.get('Origin');
    if (req.method !== 'GET' && origin && !ALLOWED_ORIGINS.includes(origin)) {
        return res.status(403).json({ error: 'Origin not allowed' });
    }
    if (TOKEN) {
        const given = Buffer.from(req.get('X-Taskflow-Token') || '');
        const expected = Buffer.from(TOKEN);
        if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
            return res.status(401).json({ error: 'Missing or invalid X-Taskflow-Token' });
        }
    }
    next();
});

const PRIORITIES = ['high', 'medium', 'low'];
const STATUSES = ['todo', 'in-progress'];
// Front-matter fields a client may change. id/created are server-owned.
const EDITABLE_FIELDS = ['title', 'priority', 'status', 'tags', 'depends_on', 'body'];

function validateTaskFields(fields) {
    if ('title' in fields && (typeof fields.title !== 'string' || !fields.title.trim() || fields.title.length > 200))
        return 'title must be a non-empty string (max 200 chars)';
    if ('priority' in fields && !PRIORITIES.includes(fields.priority))
        return `priority must be one of ${PRIORITIES.join(', ')}`;
    if ('status' in fields && !STATUSES.includes(fields.status))
        return `status must be one of ${STATUSES.join(', ')}`;
    if ('tags' in fields && (!Array.isArray(fields.tags) || !fields.tags.every((t) => typeof t === 'string')))
        return 'tags must be an array of strings';
    if ('depends_on' in fields && (!Array.isArray(fields.depends_on) || !fields.depends_on.every((u) => UUID_RE.test(u))))
        return 'depends_on must be an array of task ids';
    if ('body' in fields && typeof fields.body !== 'string')
        return 'body must be a string';
    return null;
}

// Comment threads are split on "## PLANNER — ..." / "## WORKER — ..." lines,
// so a comment containing such a line could impersonate the other role.
// Escape the heading marker; Markdown renders "\##" as a literal "##".
function neutralizeRoleHeadings(text) {
    return text.replace(/^([ \t]*)(#{1,6}[ \t]*(?:PLANNER|WORKER)\b)/gim, '$1\\$2');
}

// PLANNER_DIR can be overridden via env var so Docker can mount any project's planner/
const PLANNER_DIR = process.env.PLANNER_DIR || path.join(__dirname, '..', 'planner');
const TASKS_DIR = path.join(PLANNER_DIR, 'tasks');
const DONE_DIR = path.join(PLANNER_DIR, 'done');

// Task ids are server-generated UUIDs. Reject anything else so a malicious
// :uuid param (e.g. "..%2F..%2Fetc") can't escape TASKS_DIR/DONE_DIR when
// joined into a filesystem path.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
app.param('uuid', (req, res, next, uuid) => {
    if (!UUID_RE.test(uuid)) {
        return res.status(400).json({ error: 'Invalid task id' });
    }
    next();
});

async function readTask(taskPath) {
    const content = await fsp.readFile(taskPath, 'utf-8');
    const { data, content: body } = matter(content);
    return { ...data, body };
}

function parseComments(content) {
    const comments = [];
    const regex = /^## (PLANNER|WORKER) — (.+)$/gm;
    let match;
    const positions = [];
    while ((match = regex.exec(content)) !== null) {
        positions.push({
            author: match[1].toLowerCase(),
            timestamp: match[2].trim(),
            contentStart: match.index + match[0].length,
            index: match.index
        });
    }
    for (let i = 0; i < positions.length; i++) {
        const end = i + 1 < positions.length ? positions[i + 1].index : content.length;
        comments.push({
            author: positions[i].author,
            timestamp: positions[i].timestamp,
            content: content.slice(positions[i].contentStart, end).trim()
        });
    }
    return comments;
}

async function readComments(commentsPath) {
    try {
        return parseComments(await fsp.readFile(commentsPath, 'utf-8'));
    } catch {
        return [];
    }
}

// GET /api/tasks
app.get('/api/tasks', async (req, res) => {
    try {
        const uuids = await fsp.readdir(TASKS_DIR);
        const tasks = await Promise.all(uuids.map(async (uuid) => {
            try {
                const task = await readTask(path.join(TASKS_DIR, uuid, 'task.md'));
                const comments = await readComments(path.join(TASKS_DIR, uuid, 'comments.md'));
                return { ...task, comments };
            } catch { return null; }
        }));
        res.json(tasks.filter(Boolean));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/tasks/:uuid
app.get('/api/tasks/:uuid', async (req, res) => {
    try {
        const task = await readTask(path.join(TASKS_DIR, req.params.uuid, 'task.md'));
        const comments = await readComments(path.join(TASKS_DIR, req.params.uuid, 'comments.md'));
        res.json({ ...task, comments });
    } catch (err) {
        if (err.code === 'ENOENT') return res.status(404).json({ error: 'Task not found' });
        res.status(500).json({ error: err.message });
    }
});

// POST /api/tasks
app.post('/api/tasks', async (req, res) => {
    const { title, description, priority = 'medium', tags = [] } = req.body || {};
    if (!title || !description) return res.status(400).json({ error: 'title and description are required' });
    if (typeof description !== 'string') return res.status(400).json({ error: 'description must be a string' });
    const invalid = validateTaskFields({ title, priority, tags });
    if (invalid) return res.status(400).json({ error: invalid });
    const uuid = crypto.randomUUID();
    const frontMatter = { id: uuid, title, priority, created: new Date().toISOString(), status: 'todo', tags };
    const body = `## Objective\n\n${neutralizeRoleHeadings(description)}\n`;
    const taskDir = path.join(TASKS_DIR, uuid);
    await fsp.mkdir(taskDir, { recursive: true });
    await fsp.writeFile(path.join(taskDir, 'task.md'), matter.stringify(body, frontMatter));
    res.status(201).json({ ...frontMatter, body });
});

// PUT /api/tasks/:uuid
app.put('/api/tasks/:uuid', async (req, res) => {
    const taskPath = path.join(TASKS_DIR, req.params.uuid, 'task.md');
    try {
        const updates = req.body || {};
        const unknown = Object.keys(updates).filter((k) => !EDITABLE_FIELDS.includes(k));
        if (unknown.length) return res.status(400).json({ error: `fields not editable: ${unknown.join(', ')}` });
        const invalid = validateTaskFields(updates);
        if (invalid) return res.status(400).json({ error: invalid });
        const { body: existingBody, ...existingFront } = await readTask(taskPath);
        const { body: newBody, ...frontUpdates } = updates;
        const updatedFront = { ...existingFront, ...frontUpdates };
        const updatedBody = newBody !== undefined ? newBody : existingBody;
        await fsp.writeFile(taskPath, matter.stringify(updatedBody, updatedFront));
        res.json({ ...updatedFront, body: updatedBody });
    } catch (err) {
        if (err.code === 'ENOENT') return res.status(404).json({ error: 'Task not found' });
        res.status(500).json({ error: err.message });
    }
});

// GET /api/tasks/:uuid/comments
app.get('/api/tasks/:uuid/comments', async (req, res) => {
    try {
        await fsp.access(path.join(TASKS_DIR, req.params.uuid, 'task.md'));
        res.json(await readComments(path.join(TASKS_DIR, req.params.uuid, 'comments.md')));
    } catch (err) {
        if (err.code === 'ENOENT') return res.status(404).json({ error: 'Task not found' });
        res.status(500).json({ error: err.message });
    }
});

// POST /api/tasks/:uuid/comments
app.post('/api/tasks/:uuid/comments', async (req, res) => {
    const { author, content } = req.body || {};
    if (!author || !content) return res.status(400).json({ error: 'author and content are required' });
    if (typeof author !== 'string' || typeof content !== 'string')
        return res.status(400).json({ error: 'author and content must be strings' });
    if (!['planner', 'worker'].includes(author.toLowerCase()))
        return res.status(400).json({ error: 'author must be "planner" or "worker"' });
    try {
        await fsp.access(path.join(TASKS_DIR, req.params.uuid, 'task.md'));
        const timestamp = new Date().toISOString();
        const safe = neutralizeRoleHeadings(content);
        await fsp.appendFile(
            path.join(TASKS_DIR, req.params.uuid, 'comments.md'),
            `\n## ${author.toUpperCase()} — ${timestamp}\n${safe}\n`
        );
        res.status(201).json({ author: author.toLowerCase(), timestamp, content: safe });
    } catch (err) {
        if (err.code === 'ENOENT') return res.status(404).json({ error: 'Task not found' });
        res.status(500).json({ error: err.message });
    }
});

// POST /api/tasks/:uuid/complete
app.post('/api/tasks/:uuid/complete', async (req, res) => {
    const { summary, filesChanged, notes } = req.body || {};
    if (!summary || typeof summary !== 'string') return res.status(400).json({ error: 'summary is required' });
    const srcDir = path.join(TASKS_DIR, req.params.uuid);
    const dstDir = path.join(DONE_DIR, req.params.uuid);
    try {
        await fsp.access(srcDir);
        await fsp.rename(srcDir, dstDir);
        let body = `## What Was Done\n${summary}\n`;
        if (filesChanged) body += `\n## Files Changed\n${filesChanged}\n`;
        if (notes) body += `\n## Notes for Planner\n${notes}\n`;
        await fsp.writeFile(
            path.join(dstDir, 'completion.md'),
            matter.stringify(body, { completed: new Date().toISOString(), worker: 'api' })
        );
        res.json(await readTask(path.join(dstDir, 'task.md')));
    } catch (err) {
        if (err.code === 'ENOENT') return res.status(404).json({ error: 'Task not found' });
        res.status(500).json({ error: err.message });
    }
});

// GET /api/done
app.get('/api/done', async (req, res) => {
    try {
        const uuids = await fsp.readdir(DONE_DIR);
        const tasks = await Promise.all(uuids.map(async (uuid) => {
            try {
                const task = await readTask(path.join(DONE_DIR, uuid, 'task.md'));
                const comments = await readComments(path.join(DONE_DIR, uuid, 'comments.md'));
                let completion = {};
                try {
                    const { data } = matter(await fsp.readFile(path.join(DONE_DIR, uuid, 'completion.md'), 'utf-8'));
                    completion = data;
                } catch {}
                return { ...task, comments, completion };
            } catch { return null; }
        }));
        res.json(tasks.filter(Boolean));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/done/:uuid/comments
app.post('/api/done/:uuid/comments', async (req, res) => {
    const { author, content } = req.body || {};
    if (!author || !content) return res.status(400).json({ error: 'author and content are required' });
    if (typeof author !== 'string' || typeof content !== 'string')
        return res.status(400).json({ error: 'author and content must be strings' });
    if (!['planner', 'worker'].includes(author.toLowerCase()))
        return res.status(400).json({ error: 'author must be "planner" or "worker"' });
    try {
        await fsp.access(path.join(DONE_DIR, req.params.uuid, 'task.md'));
        const timestamp = new Date().toISOString();
        const safe = neutralizeRoleHeadings(content);
        await fsp.appendFile(
            path.join(DONE_DIR, req.params.uuid, 'comments.md'),
            `\n## ${author.toUpperCase()} — ${timestamp}\n${safe}\n`
        );
        res.status(201).json({ author: author.toLowerCase(), timestamp, content: safe });
    } catch (err) {
        if (err.code === 'ENOENT') return res.status(404).json({ error: 'Task not found' });
        res.status(500).json({ error: err.message });
    }
});

// GET /api/done/:uuid
app.get('/api/done/:uuid', async (req, res) => {
    const doneDir = path.join(DONE_DIR, req.params.uuid);
    try {
        const task = await readTask(path.join(doneDir, 'task.md'));
        const comments = await readComments(path.join(doneDir, 'comments.md'));
        let completion = {};
        try {
            const { data, content: compBody } = matter(await fsp.readFile(path.join(doneDir, 'completion.md'), 'utf-8'));
            completion = { ...data, body: compBody };
        } catch {}
        res.json({ ...task, comments, completion });
    } catch (err) {
        if (err.code === 'ENOENT') return res.status(404).json({ error: 'Task not found' });
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/done/:uuid/reopen
app.put('/api/done/:uuid/reopen', async (req, res) => {
    const srcDir = path.join(DONE_DIR, req.params.uuid);
    const dstDir = path.join(TASKS_DIR, req.params.uuid);
    try {
        await fsp.access(srcDir);
        try { await fsp.unlink(path.join(srcDir, 'completion.md')); } catch {}
        await fsp.rename(srcDir, dstDir);
        const taskPath = path.join(dstDir, 'task.md');
        const { body, ...front } = await readTask(taskPath);
        front.status = 'todo';
        await fsp.writeFile(taskPath, matter.stringify(body, front));
        res.json({ ...front, body });
    } catch (err) {
        if (err.code === 'ENOENT') return res.status(404).json({ error: 'Task not found' });
        res.status(500).json({ error: err.message });
    }
});

// Serve React production build — must come AFTER all /api routes
const buildDir = path.join(__dirname, '..', 'build');
app.use(express.static(buildDir));
app.get('/{*path}', (req, res) => res.sendFile(path.join(buildDir, 'index.html')));

module.exports = { app, neutralizeRoleHeadings, validateTaskFields, PLANNER_DIR, TOKEN };
