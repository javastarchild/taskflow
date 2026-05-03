const express = require('express');
const cors = require('cors');
const path = require('path');
const fsp = require('fs').promises;
const matter = require('gray-matter');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// PLANNER_DIR can be overridden via env var so Docker can mount any project's planner/
const PLANNER_DIR = process.env.PLANNER_DIR || path.join(__dirname, '..', 'planner');
const TASKS_DIR = path.join(PLANNER_DIR, 'tasks');
const DONE_DIR = path.join(PLANNER_DIR, 'done');

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
    const { title, description, priority = 'medium', tags = [] } = req.body;
    if (!title || !description) return res.status(400).json({ error: 'title and description are required' });
    const uuid = crypto.randomUUID();
    const frontMatter = { id: uuid, title, priority, created: new Date().toISOString(), status: 'todo', tags };
    const body = `## Objective\n\n${description}\n`;
    const taskDir = path.join(TASKS_DIR, uuid);
    await fsp.mkdir(taskDir, { recursive: true });
    await fsp.writeFile(path.join(taskDir, 'task.md'), matter.stringify(body, frontMatter));
    res.status(201).json({ ...frontMatter, body });
});

// PUT /api/tasks/:uuid
app.put('/api/tasks/:uuid', async (req, res) => {
    const taskPath = path.join(TASKS_DIR, req.params.uuid, 'task.md');
    try {
        const { body: existingBody, ...existingFront } = await readTask(taskPath);
        const { body: newBody, ...frontUpdates } = req.body;
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
    const { author, content } = req.body;
    if (!author || !content) return res.status(400).json({ error: 'author and content are required' });
    if (!['planner', 'worker'].includes(author.toLowerCase()))
        return res.status(400).json({ error: 'author must be "planner" or "worker"' });
    try {
        await fsp.access(path.join(TASKS_DIR, req.params.uuid, 'task.md'));
        const timestamp = new Date().toISOString();
        await fsp.appendFile(
            path.join(TASKS_DIR, req.params.uuid, 'comments.md'),
            `\n## ${author.toUpperCase()} — ${timestamp}\n${content}\n`
        );
        res.status(201).json({ author: author.toLowerCase(), timestamp, content });
    } catch (err) {
        if (err.code === 'ENOENT') return res.status(404).json({ error: 'Task not found' });
        res.status(500).json({ error: err.message });
    }
});

// POST /api/tasks/:uuid/complete
app.post('/api/tasks/:uuid/complete', async (req, res) => {
    const { summary, filesChanged, notes } = req.body;
    if (!summary) return res.status(400).json({ error: 'summary is required' });
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
    const { author, content } = req.body;
    if (!author || !content) return res.status(400).json({ error: 'author and content are required' });
    if (!['planner', 'worker'].includes(author.toLowerCase()))
        return res.status(400).json({ error: 'author must be "planner" or "worker"' });
    try {
        await fsp.access(path.join(DONE_DIR, req.params.uuid, 'task.md'));
        const timestamp = new Date().toISOString();
        await fsp.appendFile(
            path.join(DONE_DIR, req.params.uuid, 'comments.md'),
            `\n## ${author.toUpperCase()} — ${timestamp}\n${content}\n`
        );
        res.status(201).json({ author: author.toLowerCase(), timestamp, content });
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
app.get('*', (req, res) => res.sendFile(path.join(buildDir, 'index.html')));

app.listen(PORT, () => {
    console.log(`Taskflow server on http://localhost:${PORT}`);
    console.log(`Planner dir: ${PLANNER_DIR}`);
});
