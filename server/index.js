const { createApp, openStore, defaultDbPath } = require('./app');

const LOOPBACK = ['127.0.0.1', '::1', 'localhost'];

const PORT = Number(process.env.PORT || 3001);
const TOKEN = process.env.TASKFLOW_TOKEN || '';
// Without a token the API is only safe on loopback; refuse anything wider
// unless the operator opts in explicitly.
const HOST = process.env.HOST || (TOKEN ? '0.0.0.0' : '127.0.0.1');
if (!TOKEN && !LOOPBACK.includes(HOST) && process.env.TASKFLOW_INSECURE_NO_TOKEN !== '1') {
    console.error(`Refusing to listen on ${HOST} without TASKFLOW_TOKEN. Set a token (recommended) or TASKFLOW_INSECURE_NO_TOKEN=1.`);
    process.exit(1);
}

const dbPath = defaultDbPath();
const store = openStore(dbPath);
const app = createApp({ store, token: TOKEN });

const server = app.listen(PORT, HOST, () => {
    console.log(`Taskflow server on http://${HOST}:${PORT}`);
    console.log(`Database: ${dbPath}`);
    if (!TOKEN) console.warn('TASKFLOW_TOKEN is not set — API is protected only by the loopback bind and Origin/CORS checks');
});

function shutdown() {
    server.close(() => {
        store.close();
        process.exit(0);
    });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
