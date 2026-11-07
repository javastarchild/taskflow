#!/usr/bin/env node
// Taskflow command-line client. Talks to a Taskflow server over HTTP, so it
// works from any repository without copying a planner/ folder into it.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createClient, ApiError } = require('../server/client');
const { readPlannerFolder, writePlannerFolder } = require('../server/legacy');

const EXIT = { ok: 0, error: 1, usage: 2, empty: 3 };

const USAGE = `Usage: taskflow <command> [args] [options]

Configuration (flag or environment variable):
  --url      TASKFLOW_URL        server URL (default http://127.0.0.1:3001)
  --token    TASKFLOW_TOKEN      API token (or TASKFLOW_TOKEN_FILE=<path>)
  --project  TASKFLOW_PROJECT    project slug or id
  --worker   TASKFLOW_WORKER     worker name (default <user>@<host>)
  --json                         print raw JSON (for agents)

Commands:
  health
  projects
  project-create <name> [--slug s] [--description d] [--repo url]
  goals
  goal-create <title> [--description d]
  goal-status <goal-id> <active|achieved|archived>
  tasks [--status todo|in-progress|done] [--goal <id>|none] [--ready]
  show <task-id>
  create <title> [--description d | --body-file f] [--priority high|medium|low]
                 [--tags a,b] [--depends id,id] [--goal <id>]
  queue
  claim [<task-id>] [--goal <id>] [--tags a,b] [--lease seconds]   exit 3 if nothing is ready
  heartbeat <task-id> [--lease seconds]
  release <task-id> [--reason text]
  comment <task-id> <text> [--as worker|planner]
  complete <task-id> --summary text [--files text] [--notes text]   (--*-file variants read a file)
  reopen <task-id>
  import-planner <planner-dir> [--goal title] [--overwrite]   existing tasks are skipped unless --overwrite
  export-planner <planner-dir>
`;

class UsageError extends Error {}

const BOOLEAN_FLAGS = new Set(['json', 'ready', 'help', 'overwrite']);

function parseArgs(argv) {
    const positional = [];
    const flags = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--') { positional.push(...argv.slice(i + 1)); break; }
        if (arg.startsWith('--')) {
            const [key, inline] = arg.slice(2).split(/=(.*)/s);
            if (BOOLEAN_FLAGS.has(key)) flags[key] = true;
            else if (inline !== undefined) flags[key] = inline;
            else if (i + 1 < argv.length) flags[key] = argv[++i];
            else throw new UsageError(`--${key} needs a value`);
        } else if (arg === '-h') {
            flags.help = true;
        } else {
            positional.push(arg);
        }
    }
    return { positional, flags };
}

const list = (value) => (value ? String(value).split(',').map((s) => s.trim()).filter(Boolean) : undefined);

function readToken(flags, env) {
    if (flags.token) return flags.token;
    if (env.TASKFLOW_TOKEN) return env.TASKFLOW_TOKEN;
    if (env.TASKFLOW_TOKEN_FILE) return fs.readFileSync(env.TASKFLOW_TOKEN_FILE, 'utf-8').trim();
    return '';
}

function textFlag(flags, name) {
    if (flags[`${name}-file`]) return fs.readFileSync(flags[`${name}-file`], 'utf-8');
    return flags[name];
}

function formatTask(t) {
    const who = t.status === 'in-progress' ? ` @${t.assignee}${t.lease_expired ? ' (lease expired)' : ''}` : '';
    const blocked = t.status === 'todo' && t.blocked_by.length ? ` blocked by ${t.blocked_by.map((d) => d.slice(0, 8)).join(',')}` : '';
    return `${t.id}  [${t.status}${t.ready ? ', ready' : ''}] (${t.priority}) ${t.title}${who}${blocked}`;
}

async function run(argv, { env = process.env, out = (s) => process.stdout.write(`${s}\n`) } = {}) {
    const { positional, flags } = parseArgs(argv);
    const [command, ...args] = positional;
    if (!command || flags.help || command === 'help') {
        out(USAGE);
        return command || flags.help ? EXIT.ok : EXIT.usage;
    }
    const client = createClient({ url: flags.url || env.TASKFLOW_URL || 'http://127.0.0.1:3001', token: readToken(flags, env) });
    const worker = flags.worker || env.TASKFLOW_WORKER || `${os.userInfo().username}@${os.hostname()}`;
    const project = () => {
        const value = flags.project || env.TASKFLOW_PROJECT;
        if (!value) throw new UsageError('Set --project or TASKFLOW_PROJECT');
        return value;
    };
    const arg = (i, name) => {
        if (!args[i]) throw new UsageError(`${command} needs <${name}>`);
        return args[i];
    };
    const lease = flags.lease === undefined ? undefined : Number(flags.lease);
    const print = (data, human) => out(flags.json ? JSON.stringify(data, null, 2) : human(data));
    const printTask = (t) => print(t, formatTask);

    switch (command) {
    case 'health':
        print(await client.health(), (h) => `ok (api v${h.version}, auth ${h.auth ? 'on' : 'off'})`);
        break;
    case 'projects':
        print(await client.listProjects(), (ps) => ps.map((p) =>
            `${p.slug.padEnd(20)} ${p.name}  todo:${p.counts.todo} in-progress:${p.counts['in-progress']} done:${p.counts.done}`).join('\n') || '(no projects)');
        break;
    case 'project-create':
        print(await client.createProject({ name: arg(0, 'name'), slug: flags.slug, description: flags.description, repo_url: flags.repo }),
            (p) => `created project ${p.slug} (${p.id})`);
        break;
    case 'goals':
        print(await client.listGoals(project()), (gs) => gs.map((g) =>
            `${g.id}  [${g.status}] ${g.title}  todo:${g.counts.todo} in-progress:${g.counts['in-progress']} done:${g.counts.done}`).join('\n') || '(no goals)');
        break;
    case 'goal-create':
        print(await client.createGoal(project(), { title: arg(0, 'title'), description: flags.description }), (g) => `created goal ${g.id} ${g.title}`);
        break;
    case 'goal-status':
        print(await client.updateGoal(arg(0, 'goal-id'), { status: arg(1, 'status') }), (g) => `goal ${g.id} is now ${g.status}`);
        break;
    case 'tasks':
        print(await client.listTasks(project(), { status: flags.status, goal: flags.goal, ready: flags.ready }),
            (ts) => ts.map(formatTask).join('\n') || '(no tasks)');
        break;
    case 'show':
        print(await client.getTask(arg(0, 'task-id')), (t) => [
            formatTask(t), '', t.body.trim(),
            ...t.comments.map((c) => `\n## ${c.author.toUpperCase()}${c.agent ? ` (${c.agent})` : ''} — ${c.timestamp}\n${c.content}`),
            ...(t.completion ? [`\n## Completion — ${t.completion.completed} by ${t.completion.worker}\n${t.completion.summary}`] : []),
        ].join('\n'));
        break;
    case 'create': {
        const body = flags['body-file'] ? fs.readFileSync(flags['body-file'], 'utf-8') : undefined;
        printTask(await client.createTask(project(), {
            title: arg(0, 'title'), description: body === undefined ? flags.description : undefined, body,
            priority: flags.priority, tags: list(flags.tags), depends_on: list(flags.depends), goal_id: flags.goal,
        }));
        break;
    }
    case 'queue':
        print(await client.queue(project()), (q) => [
            `${q.project.slug}: ready ${q.counts.ready}, blocked ${q.counts.blocked}, in-progress ${q.counts['in-progress']}, ` +
            `done ${q.counts.done}, expired leases ${q.counts.expired}`,
            ...q.workers.map((w) => `  ${w.worker} → ${w.task_id.slice(0, 8)} ${w.title} (lease ${w.expired ? 'EXPIRED' : `until ${w.lease_expires}`})`),
        ].join('\n'));
        break;
    case 'claim': {
        const fields = { worker, lease_seconds: lease };
        const task = args[0] ? await client.claimTask(args[0], fields)
            : await client.claimNext(project(), { ...fields, goal_id: flags.goal, tags: list(flags.tags) });
        if (!task) {
            print(null, () => 'nothing ready to claim');
            return EXIT.empty;
        }
        printTask(task);
        break;
    }
    case 'heartbeat':
        printTask(await client.heartbeat(arg(0, 'task-id'), { worker, lease_seconds: lease }));
        break;
    case 'release':
        printTask(await client.release(arg(0, 'task-id'), { worker, reason: flags.reason }));
        break;
    case 'comment':
        print(await client.addComment(arg(0, 'task-id'), { author: flags.as || 'worker', content: arg(1, 'text'), agent: worker }),
            (c) => `commented as ${c.author} at ${c.timestamp}`);
        break;
    case 'complete': {
        const summary = textFlag(flags, 'summary');
        if (!summary) throw new UsageError('complete needs --summary');
        printTask(await client.complete(arg(0, 'task-id'), {
            worker, summary, files_changed: textFlag(flags, 'files'), notes: textFlag(flags, 'notes'),
        }));
        break;
    }
    case 'reopen':
        printTask(await client.reopen(arg(0, 'task-id')));
        break;
    case 'import-planner': {
        const tasks = readPlannerFolder(path.resolve(arg(0, 'planner-dir')));
        print(await client.importTasks(project(), { tasks, goal: flags.goal, overwrite: flags.overwrite }),
            (s) => `imported into ${s.project}: ${s.created} new, ${s.updated} updated, ${s.skipped} skipped`);
        break;
    }
    case 'export-planner': {
        const slug = project();
        const [tasks, goals] = await Promise.all([client.listTasks(slug), client.listGoals(slug)]);
        const summary = writePlannerFolder(path.resolve(arg(0, 'planner-dir')), tasks, new Map(goals.map((g) => [g.id, g.title])));
        print(summary, (s) => `exported ${s.active} active and ${s.done} done tasks`);
        break;
    }
    default:
        throw new UsageError(`Unknown command "${command}"`);
    }
    return EXIT.ok;
}

if (require.main === module) {
    run(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (err) => {
        process.stderr.write(`taskflow: ${err.message}\n`);
        if (err instanceof UsageError) process.stderr.write('Run "taskflow help" for usage.\n');
        process.exitCode = err instanceof UsageError ? EXIT.usage : EXIT.error;
    });
}

module.exports = { run, parseArgs, EXIT, ApiError };
