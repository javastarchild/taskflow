// Minimal Taskflow HTTP client shared by the CLI and agent scripts. Uses the
// global fetch in Node >= 18, so it has no dependencies.
class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function createClient({ url = 'http://127.0.0.1:3001', token = '' } = {}) {
    const base = url.replace(/\/+$/, '');

    async function request(method, route, body) {
        const headers = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        let res;
        try {
            res = await fetch(`${base}/api${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
        } catch (err) {
            throw new ApiError(0, `Cannot reach Taskflow at ${base}: ${err.cause?.message || err.message}`);
        }
        if (res.status === 204) return null;
        const text = await res.text();
        let data;
        try { data = text ? JSON.parse(text) : null; } catch {
            throw new ApiError(res.status, `Unexpected non-JSON response (${res.status}) from ${base}`);
        }
        if (!res.ok) throw new ApiError(res.status, (data && data.error) || `Request failed (${res.status})`);
        return data;
    }

    const p = (project) => `/projects/${encodeURIComponent(project)}`;
    const t = (id) => `/tasks/${encodeURIComponent(id)}`;
    const qs = (params) => {
        const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== false);
        return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, v === true ? '1' : String(v)]))}` : '';
    };

    return {
        request,
        health: () => request('GET', '/health'),
        listProjects: () => request('GET', '/projects'),
        getProject: (project) => request('GET', p(project)),
        createProject: (fields) => request('POST', '/projects', fields),
        updateProject: (project, fields) => request('PUT', p(project), fields),
        listGoals: (project) => request('GET', `${p(project)}/goals`),
        createGoal: (project, fields) => request('POST', `${p(project)}/goals`, fields),
        updateGoal: (id, fields) => request('PUT', `/goals/${encodeURIComponent(id)}`, fields),
        listTasks: (project, filters = {}) => request('GET', `${p(project)}/tasks${qs(filters)}`),
        createTask: (project, fields) => request('POST', `${p(project)}/tasks`, fields),
        getTask: (id) => request('GET', t(id)),
        updateTask: (id, fields) => request('PUT', t(id), fields),
        queue: (project) => request('GET', `${p(project)}/queue`),
        claimNext: (project, fields) => request('POST', `${p(project)}/claim`, fields),
        claimTask: (id, fields) => request('POST', `${t(id)}/claim`, fields),
        heartbeat: (id, fields) => request('POST', `${t(id)}/heartbeat`, fields),
        release: (id, fields) => request('POST', `${t(id)}/release`, fields),
        complete: (id, fields) => request('POST', `${t(id)}/complete`, fields),
        reopen: (id) => request('POST', `${t(id)}/reopen`, {}),
        addComment: (id, fields) => request('POST', `${t(id)}/comments`, fields),
        importTasks: (project, fields) => request('POST', `${p(project)}/import`, fields),
    };
}

module.exports = { createClient, ApiError };
