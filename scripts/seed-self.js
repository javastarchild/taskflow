#!/usr/bin/env node
// Reproducibly load Taskflow's own planner/ history into the central queue as
// project "taskflow". Safe to re-run: import is keyed by task UUID.
//
//   npm run seed:self                       # writes to TASKFLOW_DB (default data/taskflow.db)
//   TASKFLOW_URL=https://host TASKFLOW_TOKEN=... npm run seed:self   # seeds a remote server
const path = require('path');
const { readPlannerFolder, importTasks } = require('../server/legacy');

const PLANNER_DIR = path.join(__dirname, '..', 'planner');
const PROJECT = {
    slug: 'taskflow',
    name: 'Taskflow',
    description: 'Planner/worker task queue for AI agents — developed through its own queue.',
    repo_url: 'https://github.com/javastarchild/taskflow',
};
// Tasks without a `goal:` in front matter predate goals (the original UI build).
const LEGACY_GOAL = 'Planner UI v1 (legacy folder era)';

async function main() {
    const tasks = readPlannerFolder(PLANNER_DIR);
    let summary;
    if (process.env.TASKFLOW_URL) {
        const { createClient } = require('../server/client');
        const client = createClient({ url: process.env.TASKFLOW_URL, token: process.env.TASKFLOW_TOKEN || '' });
        const exists = (await client.listProjects()).some((p) => p.slug === PROJECT.slug);
        if (!exists) await client.createProject(PROJECT);
        summary = await client.importTasks(PROJECT.slug, { tasks, goal: LEGACY_GOAL });
    } else {
        const { openStore } = require('../server/db');
        const { defaultDbPath } = require('../server/app');
        const store = openStore(defaultDbPath());
        if (!store.findProject(PROJECT.slug)) store.createProject(PROJECT);
        summary = importTasks(store, tasks, { project: PROJECT.slug, goal: LEGACY_GOAL });
        store.close();
    }
    const byStatus = summary.tasks.reduce((acc, t) => ({ ...acc, [t.status]: (acc[t.status] || 0) + 1 }), {});
    console.log(`Seeded project "${summary.project}": ${summary.created} new, ${summary.skipped} already present`, byStatus);
}

main().catch((err) => {
    console.error(`seed:self failed: ${err.message}`);
    process.exitCode = 1;
});
