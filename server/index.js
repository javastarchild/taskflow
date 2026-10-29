const { app, PLANNER_DIR, TOKEN } = require('./app');

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log(`Taskflow server on http://localhost:${PORT}`);
    console.log(`Planner dir: ${PLANNER_DIR}`);
    if (!TOKEN) console.warn('TASKFLOW_TOKEN is not set — API is protected only by the Origin/CORS checks');
});
