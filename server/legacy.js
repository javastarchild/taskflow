// Bridge between the old copy-into-every-repo planner/ folders and the
// central store. Import is non-destructive and idempotent; export writes the
// same folder protocol back out so agents that still read files keep working.
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { PRIORITIES, isUuid } = require('./db');

const COMMENT_RE = /^## (PLANNER|WORKER) — (.+)$/gm;

function parseComments(content) {
    const positions = [];
    let match;
    COMMENT_RE.lastIndex = 0;
    while ((match = COMMENT_RE.exec(content)) !== null) {
        positions.push({ author: match[1].toLowerCase(), timestamp: match[2].trim(), start: match.index + match[0].length, index: match.index });
    }
    return positions.map((p, i) => ({
        author: p.author,
        timestamp: p.timestamp,
        content: content.slice(p.start, i + 1 < positions.length ? positions[i + 1].index : content.length).trim(),
    }));
}

const toIso = (value, fallback) => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
    if (typeof value === 'string' && value.trim()) {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? value : d.toISOString();
    }
    return fallback;
};

const normalizeBody = (text) => `${text.replace(/^\s*\n/, '').trimEnd()}\n`;

// Split a completion.md body into its "## Heading" sections.
function parseSections(content) {
    const sections = {};
    let current = null;
    for (const line of content.split('\n')) {
        const heading = /^##\s+(.+?)\s*$/.exec(line);
        if (heading) {
            current = heading[1].toLowerCase();
            sections[current] = [];
        } else if (current) {
            sections[current].push(line);
        }
    }
    return Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, v.join('\n').trim()]));
}

function readIfExists(file) {
    try { return fs.readFileSync(file, 'utf-8'); } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
    }
}

function readLegacyTask(taskDir, isDone, fallbackTime) {
    const raw = readIfExists(path.join(taskDir, 'task.md'));
    if (raw === null) return null;
    const { data, content } = matter(raw);
    const id = String(data.id || path.basename(taskDir));
    if (!isUuid(id)) throw new Error(`${taskDir}: task id "${id}" is not a UUID`);
    const created = toIso(data.created, fallbackTime);
    const task = {
        id,
        title: String(data.title || '(untitled)').slice(0, 200),
        body: normalizeBody(content),
        priority: PRIORITIES.includes(data.priority) ? data.priority : 'medium',
        status: isDone ? 'done' : data.status === 'in-progress' ? 'in-progress' : 'todo',
        tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
        depends_on: Array.isArray(data.depends_on) ? data.depends_on.map(String).filter(isUuid) : [],
        created,
        assignee: typeof data.assignee === 'string' ? data.assignee : undefined,
        goal: typeof data.goal === 'string' ? data.goal : undefined,
        comments: parseComments(readIfExists(path.join(taskDir, 'comments.md')) || ''),
    };
    if (isDone) {
        const completion = readIfExists(path.join(taskDir, 'completion.md'));
        const parsed = completion === null ? { data: {}, content: '' } : matter(completion);
        const sections = parseSections(parsed.content);
        task.completion = {
            completed: toIso(parsed.data.completed, created),
            worker: parsed.data.worker ? String(parsed.data.worker) : 'legacy-import',
            summary: sections['what was done'] || parsed.content.trim() || 'Imported from planner/done',
            files_changed: sections['files changed'] || '',
            notes: sections['notes for planner'] || '',
        };
        task.updated = task.completion.completed;
    }
    return task;
}

function listTaskDirs(dir) {
    try {
        return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(dir, d.name)).sort();
    } catch (err) {
        if (err.code === 'ENOENT') return [];
        throw err;
    }
}

// Read every task under planner/tasks and planner/done.
function readPlannerFolder(plannerDir) {
    if (!fs.existsSync(plannerDir)) throw new Error(`${plannerDir} does not exist`);
    const fallbackTime = new Date().toISOString();
    const tasks = [];
    for (const [sub, isDone] of [['tasks', false], ['done', true]]) {
        for (const taskDir of listTaskDirs(path.join(plannerDir, sub))) {
            const task = readLegacyTask(taskDir, isDone, fallbackTime);
            if (task) tasks.push(task);
        }
    }
    return tasks;
}

const STATUSES = ['todo', 'in-progress', 'done'];
const isStr = (v, max = 100000) => typeof v === 'string' && v.length <= max;

// Imported records arrive over HTTP, so check shape before touching the store.
function validateImportedTask(t) {
    if (!t || typeof t !== 'object') return 'each task must be an object';
    if (!isUuid(t.id)) return 'task id must be a UUID';
    if (!isStr(t.title, 200) || !t.title.trim()) return `${t.id}: title must be a non-empty string`;
    if (!isStr(t.body)) return `${t.id}: body must be a string`;
    if (!PRIORITIES.includes(t.priority)) return `${t.id}: invalid priority`;
    if (!STATUSES.includes(t.status)) return `${t.id}: invalid status`;
    if (!Array.isArray(t.tags) || !t.tags.every((x) => isStr(x, 64))) return `${t.id}: tags must be strings`;
    if (!Array.isArray(t.depends_on) || !t.depends_on.every(isUuid)) return `${t.id}: depends_on must be task ids`;
    if (!isStr(t.created, 64)) return `${t.id}: created must be a timestamp string`;
    for (const k of ['goal', 'assignee', 'updated']) if (t[k] !== undefined && !isStr(t[k], 200)) return `${t.id}: ${k} must be a string`;
    if (!Array.isArray(t.comments || [])) return `${t.id}: comments must be an array`;
    for (const c of t.comments || []) {
        if (!c || !['planner', 'worker'].includes(c.author) || !isStr(c.content) || !isStr(c.timestamp, 64))
            return `${t.id}: comments need author planner|worker, content and timestamp`;
    }
    if (t.status === 'done') {
        const c = t.completion;
        if (!c || !isStr(c.summary) || !isStr(c.completed, 64) || !isStr(c.worker, 100)
            || !isStr(c.files_changed || '') || !isStr(c.notes || ''))
            return `${t.id}: done tasks need completion { completed, worker, summary }`;
    }
    return null;
}

// Add parsed planner tasks to `projectSlug` (created if missing). Tasks that
// already exist are skipped, so re-running an import never rolls back queue
// progress; `overwrite` refreshes them from the files instead. `goal` puts
// tasks that name no goal under that goal title.
function importTasks(store, tasks, { project: projectSlug, projectName, goal, overwrite = false, sanitize = (x) => x } = {}) {
    if (!projectSlug) throw new Error('project slug is required');
    if (!Array.isArray(tasks)) throw Object.assign(new Error('tasks must be an array'), { status: 400 });
    for (const t of tasks) {
        const invalid = validateImportedTask(t);
        if (invalid) throw Object.assign(new Error(invalid), { status: 400 });
    }
    const project = store.findProject(projectSlug) ? store.getProject(projectSlug)
        : store.createProject({ name: projectName || projectSlug, slug: projectSlug });
    const goalId = (title) => {
        if (!title) return null;
        const found = store.findGoalByTitle(project.id, title);
        return (found || store.createGoal(project.id, { title })).id;
    };
    const summary = { project: project.slug, created: 0, updated: 0, skipped: 0, tasks: [] };
    for (const t of tasks) {
        if (!overwrite && store.hasTask(t.id)) {
            summary.skipped++;
            continue;
        }
        const task = {
            ...t, body: sanitize(t.body),
            comments: (t.comments || []).map((c) => ({ ...c, content: sanitize(c.content) })),
            goal_id: goalId(t.goal || goal),
        };
        const { created } = store.upsertImportedTask(project.id, task);
        summary[created ? 'created' : 'updated']++;
        summary.tasks.push({ id: task.id, title: task.title, status: task.status });
    }
    return summary;
}

const importPlanner = (store, plannerDir, options) => importTasks(store, readPlannerFolder(plannerDir), options);

function writeComments(dir, comments) {
    const file = path.join(dir, 'comments.md');
    if (!comments.length) return fs.rmSync(file, { force: true });
    fs.writeFileSync(file, comments.map((c) => `\n## ${c.author.toUpperCase()} — ${c.timestamp}\n${c.content}\n`).join(''));
}

// Write tasks back out in the planner/ folder protocol. Task folders are
// moved between tasks/ and done/ so artifacts stay with them. `goals` maps
// goal id → title.
function writePlannerFolder(plannerDir, tasks, goals = new Map()) {
    const tasksDir = path.join(plannerDir, 'tasks');
    const doneDir = path.join(plannerDir, 'done');
    fs.mkdirSync(tasksDir, { recursive: true });
    fs.mkdirSync(doneDir, { recursive: true });
    const summary = { active: 0, done: 0 };
    for (const task of tasks) {
        if (!isUuid(task.id)) throw new Error(`refusing to export task with non-UUID id ${task.id}`);
        const isDone = task.status === 'done';
        const dest = path.join(isDone ? doneDir : tasksDir, task.id);
        const other = path.join(isDone ? tasksDir : doneDir, task.id);
        if (fs.existsSync(other)) {
            if (fs.existsSync(dest)) fs.rmSync(other, { recursive: true });
            else fs.renameSync(other, dest);
        }
        fs.mkdirSync(dest, { recursive: true });
        const front = { id: task.id, title: task.title, priority: task.priority, created: task.created, status: task.status };
        if (task.depends_on.length) front.depends_on = task.depends_on;
        if (task.tags.length) front.tags = task.tags;
        if (task.goal_id && goals.has(task.goal_id)) front.goal = goals.get(task.goal_id);
        if (task.status === 'in-progress' && task.assignee) front.assignee = task.assignee;
        fs.writeFileSync(path.join(dest, 'task.md'), matter.stringify(task.body, front));
        writeComments(dest, task.comments || []);
        const completionFile = path.join(dest, 'completion.md');
        if (isDone) {
            const c = task.completion;
            let body = `## What Was Done\n\n${c.summary}\n`;
            if (c.files_changed) body += `\n## Files Changed\n\n${c.files_changed}\n`;
            if (c.notes) body += `\n## Notes for Planner\n\n${c.notes}\n`;
            fs.writeFileSync(completionFile, matter.stringify(body, { completed: c.completed, worker: c.worker }));
            summary.done++;
        } else {
            fs.rmSync(completionFile, { force: true });
            summary.active++;
        }
    }
    return summary;
}

function exportPlanner(store, plannerDir, { project: projectSlug } = {}) {
    const project = store.getProject(projectSlug);
    const goals = new Map(store.listGoals(project.id).map((g) => [g.id, g.title]));
    return { project: project.slug, ...writePlannerFolder(plannerDir, store.listTasks(project.id), goals) };
}

module.exports = {
    importPlanner, importTasks, readPlannerFolder, validateImportedTask,
    exportPlanner, writePlannerFolder, parseComments, readLegacyTask,
};
