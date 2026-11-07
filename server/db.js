// Central Taskflow store. One SQLite file holds every project, goal, task and
// comment, so target repositories no longer need a copied planner/ folder.
// Uses Node's built-in node:sqlite (Node >= 22.5), so there is no native npm
// dependency to compile.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// node:sqlite prints an ExperimentalWarning on first load. Silence just that
// one so CLI output stays clean.
const originalEmit = process.emitWarning;
process.emitWarning = (warning, ...args) => {
    const text = typeof warning === 'string' ? warning : warning && warning.message;
    if (text && text.includes('SQLite is an experimental feature')) return;
    return originalEmit.call(process, warning, ...args);
};
const { DatabaseSync } = require('node:sqlite');
process.emitWarning = originalEmit;

const SCHEMA_VERSION = 1;
const PRIORITIES = ['high', 'medium', 'low'];
const TASK_STATUSES = ['todo', 'in-progress', 'done'];
const GOAL_STATUSES = ['active', 'achieved', 'archived'];
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const DEFAULT_LEASE_SECONDS = 900;
const MIN_LEASE_SECONDS = 30;
const MAX_LEASE_SECONDS = 86400;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    repo_url TEXT NOT NULL DEFAULT '',
    created TEXT NOT NULL,
    updated TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    created TEXT NOT NULL,
    updated TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS goals_project ON goals(project_id);
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'todo',
    tags TEXT NOT NULL DEFAULT '[]',
    depends_on TEXT NOT NULL DEFAULT '[]',
    assignee TEXT,
    claimed_at TEXT,
    lease_expires TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    created TEXT NOT NULL,
    updated TEXT NOT NULL,
    completed TEXT,
    completion_worker TEXT,
    completion_summary TEXT,
    completion_files TEXT,
    completion_notes TEXT
);
CREATE INDEX IF NOT EXISTS tasks_project_status ON tasks(project_id, status);
CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author TEXT NOT NULL,
    agent TEXT,
    content TEXT NOT NULL,
    timestamp TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS comments_task ON comments(task_id, timestamp);
`;

class StoreError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const PRIORITY_RANK = "CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END";

function slugify(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63);
}

function clampLease(seconds) {
    if (seconds === undefined || seconds === null) return DEFAULT_LEASE_SECONDS;
    const n = Number(seconds);
    if (!Number.isFinite(n)) throw new StoreError(400, 'lease_seconds must be a number');
    return Math.min(MAX_LEASE_SECONDS, Math.max(MIN_LEASE_SECONDS, Math.round(n)));
}

function requireWorker(worker) {
    if (typeof worker !== 'string' || !worker.trim() || worker.length > 100)
        throw new StoreError(400, 'worker must be a non-empty string (max 100 chars)');
    return worker.trim();
}

function openStore(dbPath, { now = () => new Date() } = {}) {
    if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
    const db = new DatabaseSync(dbPath);
    db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
    const { user_version: version } = db.prepare('PRAGMA user_version').get();
    if (version > SCHEMA_VERSION)
        throw new Error(`Database schema v${version} is newer than this server (v${SCHEMA_VERSION})`);
    db.exec(SCHEMA);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);

    const iso = () => now().toISOString();

    // BEGIN IMMEDIATE takes the write lock up front, so two processes sharing
    // the file serialize here instead of both reading the same "ready" row.
    function transaction(fn) {
        db.exec('BEGIN IMMEDIATE');
        try {
            const result = fn();
            db.exec('COMMIT');
            return result;
        } catch (err) {
            db.exec('ROLLBACK');
            throw err;
        }
    }

    // ---- projects -------------------------------------------------------

    function countsFor(column, id) {
        const rows = db.prepare(`SELECT status, COUNT(*) AS n FROM tasks WHERE ${column} = ? GROUP BY status`).all(id);
        const counts = { todo: 0, 'in-progress': 0, done: 0 };
        for (const r of rows) counts[r.status] = r.n;
        return counts;
    }

    const projectOut = (row) => row && { ...row, counts: countsFor('project_id', row.id) };

    function listProjects() {
        return db.prepare('SELECT * FROM projects ORDER BY name COLLATE NOCASE').all().map(projectOut);
    }

    function findProject(ref) {
        if (typeof ref !== 'string') return null;
        return db.prepare('SELECT * FROM projects WHERE id = ? OR slug = ?').get(ref, ref.toLowerCase()) || null;
    }

    function getProject(ref) {
        const row = findProject(ref);
        if (!row) throw new StoreError(404, 'Project not found');
        return projectOut(row);
    }

    function createProject({ name, slug, description = '', repo_url = '', id, created } = {}) {
        if (typeof name !== 'string' || !name.trim() || name.length > 200)
            throw new StoreError(400, 'name must be a non-empty string (max 200 chars)');
        const finalSlug = slug === undefined ? slugify(name) : slug;
        if (typeof finalSlug !== 'string' || !SLUG_RE.test(finalSlug))
            throw new StoreError(400, 'slug must match ^[a-z0-9][a-z0-9-]{0,62}$');
        if (typeof description !== 'string' || typeof repo_url !== 'string')
            throw new StoreError(400, 'description and repo_url must be strings');
        if (db.prepare('SELECT 1 FROM projects WHERE slug = ?').get(finalSlug))
            throw new StoreError(409, `Project slug "${finalSlug}" already exists`);
        const ts = created || iso();
        const row = { id: id || crypto.randomUUID(), slug: finalSlug, name: name.trim(), description, repo_url, created: ts, updated: ts };
        db.prepare('INSERT INTO projects (id, slug, name, description, repo_url, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(row.id, row.slug, row.name, row.description, row.repo_url, row.created, row.updated);
        return projectOut(row);
    }

    function ensureProject(slug, fields = {}) {
        return findProject(slug) ? getProject(slug) : createProject({ name: slug, slug, ...fields });
    }

    function updateProject(ref, fields) {
        const project = getProject(ref);
        const allowed = ['name', 'description', 'repo_url'];
        rejectUnknown(fields, allowed);
        for (const k of allowed) {
            if (k in fields && typeof fields[k] !== 'string') throw new StoreError(400, `${k} must be a string`);
        }
        if ('name' in fields && !fields.name.trim()) throw new StoreError(400, 'name must not be empty');
        const next = { ...project, ...pick(fields, allowed), updated: iso() };
        db.prepare('UPDATE projects SET name = ?, description = ?, repo_url = ?, updated = ? WHERE id = ?')
            .run(next.name, next.description, next.repo_url, next.updated, project.id);
        return getProject(project.id);
    }

    // ---- goals ----------------------------------------------------------

    const goalOut = (row) => row && { ...row, counts: countsFor('goal_id', row.id) };

    function listGoals(projectRef) {
        const project = getProject(projectRef);
        return db.prepare('SELECT * FROM goals WHERE project_id = ? ORDER BY created').all(project.id).map(goalOut);
    }

    function getGoal(id) {
        const row = db.prepare('SELECT * FROM goals WHERE id = ?').get(id);
        if (!row) throw new StoreError(404, 'Goal not found');
        return goalOut(row);
    }

    function validateGoal(fields) {
        if ('title' in fields && (typeof fields.title !== 'string' || !fields.title.trim() || fields.title.length > 200))
            throw new StoreError(400, 'title must be a non-empty string (max 200 chars)');
        if ('description' in fields && typeof fields.description !== 'string')
            throw new StoreError(400, 'description must be a string');
        if ('status' in fields && !GOAL_STATUSES.includes(fields.status))
            throw new StoreError(400, `status must be one of ${GOAL_STATUSES.join(', ')}`);
    }

    function createGoal(projectRef, { title, description = '', status = 'active', id } = {}) {
        const project = getProject(projectRef);
        validateGoal({ title, description, status });
        const ts = iso();
        const row = { id: id || crypto.randomUUID(), project_id: project.id, title: title.trim(), description, status, created: ts, updated: ts };
        db.prepare('INSERT INTO goals (id, project_id, title, description, status, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(row.id, row.project_id, row.title, row.description, row.status, row.created, row.updated);
        return goalOut(row);
    }

    function updateGoal(id, fields) {
        const goal = getGoal(id);
        const allowed = ['title', 'description', 'status'];
        rejectUnknown(fields, allowed);
        validateGoal(fields);
        const next = { ...goal, ...pick(fields, allowed), updated: iso() };
        db.prepare('UPDATE goals SET title = ?, description = ?, status = ?, updated = ? WHERE id = ?')
            .run(next.title, next.description, next.status, next.updated, id);
        return getGoal(id);
    }

    // ---- tasks ----------------------------------------------------------

    function listComments(taskId) {
        return db.prepare('SELECT * FROM comments WHERE task_id = ? ORDER BY timestamp, rowid').all(taskId);
    }

    function statusesOf(ids) {
        if (!ids.length) return new Map();
        const rows = db.prepare(`SELECT id, status FROM tasks WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
        return new Map(rows.map((r) => [r.id, r.status]));
    }

    function leaseExpired(row, at = iso()) {
        return row.status === 'in-progress' && Boolean(row.lease_expires) && row.lease_expires <= at;
    }

    function taskOut(row, { withComments = true } = {}) {
        const depends_on = JSON.parse(row.depends_on);
        const statuses = statusesOf(depends_on);
        // A dependency that is missing from the store counts as unfinished.
        const blocked_by = depends_on.filter((d) => statuses.get(d) !== 'done');
        const reclaimable = leaseExpired(row);
        const out = {
            id: row.id, project_id: row.project_id, goal_id: row.goal_id, title: row.title, body: row.body,
            priority: row.priority, status: row.status, tags: JSON.parse(row.tags), depends_on,
            ready: (row.status === 'todo' || reclaimable) && blocked_by.length === 0,
            blocked_by, assignee: row.assignee, claimed_at: row.claimed_at, lease_expires: row.lease_expires,
            lease_expired: reclaimable, attempts: row.attempts, created: row.created, updated: row.updated,
            completion: row.status === 'done' ? {
                completed: row.completed, worker: row.completion_worker, summary: row.completion_summary || '',
                files_changed: row.completion_files || '', notes: row.completion_notes || '',
            } : null,
        };
        if (withComments) out.comments = listComments(row.id);
        return out;
    }

    function rowFor(id) {
        const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
        if (!row) throw new StoreError(404, 'Task not found');
        return row;
    }

    const getTask = (id) => taskOut(rowFor(id));

    function listTasks(projectRef, { status, goal, ready } = {}) {
        const project = getProject(projectRef);
        const where = ['project_id = ?'];
        const params = [project.id];
        if (status !== undefined) {
            if (!TASK_STATUSES.includes(status)) throw new StoreError(400, `status must be one of ${TASK_STATUSES.join(', ')}`);
            where.push('status = ?');
            params.push(status);
        }
        if (goal === 'none') where.push('goal_id IS NULL');
        else if (goal !== undefined) { where.push('goal_id = ?'); params.push(goal); }
        const rows = db.prepare(`SELECT * FROM tasks WHERE ${where.join(' AND ')} ORDER BY ${PRIORITY_RANK}, created, rowid`).all(...params);
        const tasks = rows.map((r) => taskOut(r));
        return ready ? tasks.filter((t) => t.ready) : tasks;
    }

    function validateTask(fields, projectId) {
        if ('title' in fields && (typeof fields.title !== 'string' || !fields.title.trim() || fields.title.length > 200))
            throw new StoreError(400, 'title must be a non-empty string (max 200 chars)');
        if ('body' in fields && typeof fields.body !== 'string') throw new StoreError(400, 'body must be a string');
        if ('priority' in fields && !PRIORITIES.includes(fields.priority))
            throw new StoreError(400, `priority must be one of ${PRIORITIES.join(', ')}`);
        if ('tags' in fields && (!Array.isArray(fields.tags) || !fields.tags.every((t) => typeof t === 'string' && t.length <= 64)))
            throw new StoreError(400, 'tags must be an array of strings');
        if ('depends_on' in fields && (!Array.isArray(fields.depends_on) || !fields.depends_on.every(isUuid)))
            throw new StoreError(400, 'depends_on must be an array of task ids');
        if ('goal_id' in fields && fields.goal_id !== null) {
            if (!isUuid(fields.goal_id)) throw new StoreError(400, 'goal_id must be a goal id or null');
            const goal = db.prepare('SELECT project_id FROM goals WHERE id = ?').get(fields.goal_id);
            if (!goal || goal.project_id !== projectId) throw new StoreError(400, 'goal_id does not belong to this project');
        }
    }

    function createTask(projectRef, fields = {}) {
        const project = getProject(projectRef);
        const { title, body = '', priority = 'medium', tags = [], depends_on = [], goal_id = null } = fields;
        validateTask({ title, body, priority, tags, depends_on, goal_id }, project.id);
        const ts = iso();
        const id = crypto.randomUUID();
        db.prepare(`INSERT INTO tasks (id, project_id, goal_id, title, body, priority, status, tags, depends_on, created, updated)
                    VALUES (?, ?, ?, ?, ?, ?, 'todo', ?, ?, ?, ?)`)
            .run(id, project.id, goal_id, title.trim(), body, priority, JSON.stringify(tags), JSON.stringify(depends_on), ts, ts);
        return getTask(id);
    }

    function updateTask(id, fields) {
        const row = rowFor(id);
        const allowed = ['title', 'body', 'priority', 'tags', 'depends_on', 'goal_id'];
        rejectUnknown(fields, allowed);
        validateTask(fields, row.project_id);
        if ((fields.depends_on || []).includes(id)) throw new StoreError(400, 'a task cannot depend on itself');
        const next = { ...row, ...pick(fields, allowed) };
        db.prepare('UPDATE tasks SET title = ?, body = ?, priority = ?, tags = ?, depends_on = ?, goal_id = ?, updated = ? WHERE id = ?')
            .run(next.title, next.body, next.priority,
                typeof next.tags === 'string' ? next.tags : JSON.stringify(next.tags),
                typeof next.depends_on === 'string' ? next.depends_on : JSON.stringify(next.depends_on),
                next.goal_id, iso(), id);
        return getTask(id);
    }

    // ---- queue lifecycle ------------------------------------------------

    function claimRow(row, worker, leaseSeconds) {
        const at = now();
        const ts = at.toISOString();
        const expires = new Date(at.getTime() + leaseSeconds * 1000).toISOString();
        // The WHERE clause repeats the readiness check so a row that changed
        // since we selected it is never double-assigned.
        const result = db.prepare(`UPDATE tasks SET status = 'in-progress', assignee = ?, claimed_at = ?, lease_expires = ?,
                                   attempts = attempts + 1, updated = ?
                                   WHERE id = ? AND (status = 'todo' OR (status = 'in-progress' AND lease_expires <= ?))`)
            .run(worker, ts, expires, ts, row.id, ts);
        return result.changes === 1;
    }

    function claimNext(projectRef, { worker, lease_seconds, goal_id, tags } = {}) {
        const name = requireWorker(worker);
        const lease = clampLease(lease_seconds);
        if (tags !== undefined && (!Array.isArray(tags) || !tags.every((t) => typeof t === 'string')))
            throw new StoreError(400, 'tags must be an array of strings');
        return transaction(() => {
            const project = getProject(projectRef);
            const ts = iso();
            const params = [project.id, ts];
            let goalClause = '';
            if (goal_id !== undefined && goal_id !== null) { goalClause = 'AND goal_id = ?'; params.push(goal_id); }
            const candidates = db.prepare(`SELECT * FROM tasks WHERE project_id = ?
                    AND (status = 'todo' OR (status = 'in-progress' AND lease_expires <= ?)) ${goalClause}
                    ORDER BY ${PRIORITY_RANK}, created, rowid`).all(...params);
            for (const row of candidates) {
                const rowTags = JSON.parse(row.tags);
                if (tags && tags.length && !tags.every((t) => rowTags.includes(t))) continue;
                const deps = JSON.parse(row.depends_on);
                const statuses = statusesOf(deps);
                if (!deps.every((d) => statuses.get(d) === 'done')) continue;
                if (claimRow(row, name, lease)) return getTask(row.id);
            }
            return null;
        });
    }

    function claimTask(id, { worker, lease_seconds } = {}) {
        const name = requireWorker(worker);
        const lease = clampLease(lease_seconds);
        return transaction(() => {
            const task = taskOut(rowFor(id), { withComments: false });
            if (!task.ready) {
                if (task.status === 'in-progress' && task.assignee === name) return getTask(id);
                throw new StoreError(409, task.status === 'in-progress'
                    ? `Task is held by ${task.assignee}` : task.status === 'done'
                        ? 'Task is already done' : `Task is blocked by ${task.blocked_by.join(', ')}`);
            }
            if (!claimRow(rowFor(id), name, lease)) throw new StoreError(409, 'Task was claimed concurrently');
            return getTask(id);
        });
    }

    function assertHolder(row, worker) {
        if (row.status !== 'in-progress' || row.assignee !== worker)
            throw new StoreError(409, row.status === 'in-progress'
                ? `Task is held by ${row.assignee}, not ${worker}` : `Task is not in progress (status: ${row.status})`);
    }

    function heartbeat(id, { worker, lease_seconds } = {}) {
        const name = requireWorker(worker);
        const lease = clampLease(lease_seconds);
        return transaction(() => {
            const row = rowFor(id);
            assertHolder(row, name);
            const at = now();
            db.prepare('UPDATE tasks SET lease_expires = ?, updated = ? WHERE id = ?')
                .run(new Date(at.getTime() + lease * 1000).toISOString(), at.toISOString(), id);
            return getTask(id);
        });
    }

    function release(id, { worker, reason } = {}) {
        const name = requireWorker(worker);
        if (reason !== undefined && typeof reason !== 'string') throw new StoreError(400, 'reason must be a string');
        return transaction(() => {
            const row = rowFor(id);
            assertHolder(row, name);
            db.prepare(`UPDATE tasks SET status = 'todo', assignee = NULL, claimed_at = NULL, lease_expires = NULL, updated = ? WHERE id = ?`)
                .run(iso(), id);
            if (reason && reason.trim()) insertComment(id, 'worker', `Released: ${reason}`, name);
            return getTask(id);
        });
    }

    function complete(id, { worker, summary, files_changed = '', notes = '', completed } = {}) {
        if (typeof summary !== 'string' || !summary.trim()) throw new StoreError(400, 'summary is required');
        if (typeof files_changed !== 'string' || typeof notes !== 'string')
            throw new StoreError(400, 'files_changed and notes must be strings');
        const name = worker === undefined ? 'api' : requireWorker(worker);
        return transaction(() => {
            const row = rowFor(id);
            if (row.status === 'done') throw new StoreError(409, 'Task is already done');
            if (row.status === 'in-progress' && row.assignee && row.assignee !== name && !leaseExpired(row))
                throw new StoreError(409, `Task is held by ${row.assignee}`);
            const ts = completed || iso();
            db.prepare(`UPDATE tasks SET status = 'done', lease_expires = NULL, assignee = ?, completed = ?, completion_worker = ?,
                        completion_summary = ?, completion_files = ?, completion_notes = ?, updated = ? WHERE id = ?`)
                .run(name, ts, name, summary, files_changed, notes, iso(), id);
            return getTask(id);
        });
    }

    function reopen(id) {
        return transaction(() => {
            rowFor(id);
            db.prepare(`UPDATE tasks SET status = 'todo', assignee = NULL, claimed_at = NULL, lease_expires = NULL, completed = NULL,
                        completion_worker = NULL, completion_summary = NULL, completion_files = NULL, completion_notes = NULL,
                        updated = ? WHERE id = ?`).run(iso(), id);
            return getTask(id);
        });
    }

    function queueStatus(projectRef) {
        const project = getProject(projectRef);
        const tasks = db.prepare(`SELECT * FROM tasks WHERE project_id = ? AND status != 'done'`).all(project.id)
            .map((r) => taskOut(r, { withComments: false }));
        const counts = { ...project.counts, ready: 0, blocked: 0, expired: 0 };
        const workers = [];
        for (const t of tasks) {
            if (t.ready) counts.ready++;
            else if (t.status === 'todo') counts.blocked++;
            if (t.lease_expired) counts.expired++;
            if (t.status === 'in-progress') workers.push({
                worker: t.assignee, task_id: t.id, title: t.title, claimed_at: t.claimed_at,
                lease_expires: t.lease_expires, expired: t.lease_expired,
            });
        }
        return { project, counts, workers };
    }

    // ---- comments -------------------------------------------------------

    function insertComment(taskId, author, content, agent = null, timestamp = iso(), id = crypto.randomUUID()) {
        db.prepare('INSERT INTO comments (id, task_id, author, agent, content, timestamp) VALUES (?, ?, ?, ?, ?, ?)')
            .run(id, taskId, author, agent, content, timestamp);
        return { id, task_id: taskId, author, agent, content, timestamp };
    }

    function addComment(taskId, { author, content, agent } = {}) {
        rowFor(taskId);
        if (typeof author !== 'string' || typeof content !== 'string' || !content.trim())
            throw new StoreError(400, 'author and content are required strings');
        const role = author.toLowerCase();
        if (!['planner', 'worker'].includes(role)) throw new StoreError(400, 'author must be "planner" or "worker"');
        if (agent !== undefined && agent !== null && (typeof agent !== 'string' || agent.length > 100))
            throw new StoreError(400, 'agent must be a string (max 100 chars)');
        return insertComment(taskId, role, content, agent || null);
    }

    // ---- legacy import --------------------------------------------------

    // Insert or refresh a task carried over from a planner/ folder. Keyed by
    // the task UUID so re-importing is idempotent.
    function upsertImportedTask(projectId, task) {
        return transaction(() => {
            const existing = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(task.id);
            if (existing && existing.project_id !== projectId)
                throw new StoreError(409, `Task ${task.id} already belongs to another project`);
            const c = task.completion || {};
            const params = [
                task.goal_id || null, task.title, task.body, task.priority, task.status,
                JSON.stringify(task.tags), JSON.stringify(task.depends_on), task.created, task.updated || task.created,
                c.completed || null, c.worker || null, c.summary || null, c.files_changed || null, c.notes || null,
            ];
            if (existing) {
                db.prepare(`UPDATE tasks SET goal_id = COALESCE(?, goal_id), title = ?, body = ?, priority = ?, status = ?, tags = ?, depends_on = ?,
                            created = ?, updated = ?, completed = ?, completion_worker = ?, completion_summary = ?,
                            completion_files = ?, completion_notes = ? WHERE id = ?`).run(...params, task.id);
            } else {
                db.prepare(`INSERT INTO tasks (goal_id, title, body, priority, status, tags, depends_on, created, updated, completed,
                            completion_worker, completion_summary, completion_files, completion_notes, id, project_id)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...params, task.id, projectId);
            }
            if (task.status === 'in-progress') {
                // Folder-based claims carry no lease. Record who held it but
                // leave the lease already expired so any worker can reclaim it.
                const ts = iso();
                db.prepare(`UPDATE tasks SET assignee = COALESCE(assignee, ?), claimed_at = COALESCE(claimed_at, ?),
                            lease_expires = COALESCE(lease_expires, ?) WHERE id = ?`)
                    .run(task.assignee || 'legacy-import', ts, ts, task.id);
            } else {
                db.prepare('UPDATE tasks SET assignee = ?, claimed_at = NULL, lease_expires = NULL WHERE id = ?')
                    .run(task.status === 'done' ? (c.worker || null) : null, task.id);
            }
            for (const comment of task.comments || []) {
                const dupe = db.prepare('SELECT 1 FROM comments WHERE task_id = ? AND author = ? AND timestamp = ? AND content = ?')
                    .get(task.id, comment.author, comment.timestamp, comment.content);
                if (!dupe) insertComment(task.id, comment.author, comment.content, comment.agent || null, comment.timestamp);
            }
            return { created: !existing };
        });
    }

    const hasTask = (id) => Boolean(db.prepare('SELECT 1 FROM tasks WHERE id = ?').get(id));

    function findGoalByTitle(projectId, title) {
        return db.prepare('SELECT * FROM goals WHERE project_id = ? AND title = ?').get(projectId, title) || null;
    }

    return {
        db, close: () => db.close(), transaction,
        listProjects, getProject, findProject, createProject, ensureProject, updateProject,
        listGoals, getGoal, createGoal, updateGoal, findGoalByTitle,
        listTasks, getTask, createTask, updateTask, listComments, addComment,
        claimNext, claimTask, heartbeat, release, complete, reopen, queueStatus,
        upsertImportedTask, hasTask,
    };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

function rejectUnknown(fields, allowed) {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new StoreError(400, 'body must be a JSON object');
    const unknown = Object.keys(fields).filter((k) => !allowed.includes(k));
    if (unknown.length) throw new StoreError(400, `fields not editable: ${unknown.join(', ')}`);
}

function pick(obj, keys) {
    return Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));
}

module.exports = {
    openStore, StoreError, slugify, isUuid, UUID_RE,
    PRIORITIES, TASK_STATUSES, GOAL_STATUSES, DEFAULT_LEASE_SECONDS,
};
