// When the server sets TASKFLOW_TOKEN, every /api call must carry it. The
// token is asked for once and kept in sessionStorage (cleared when the tab closes).
const TOKEN_KEY = 'taskflowToken';

const readToken = () => {
  try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
};

// Parallel requests that all get 401 share one prompt.
let pendingPrompt = null;
const askForToken = () => {
  if (!pendingPrompt) {
    pendingPrompt = Promise.resolve().then(() => {
      const entered = window.prompt('Taskflow access token (TASKFLOW_TOKEN):');
      if (entered) {
        try { sessionStorage.setItem(TOKEN_KEY, entered.trim()); } catch {}
      }
      return Boolean(entered);
    }).finally(() => { pendingPrompt = null; });
  }
  return pendingPrompt;
};

const request = async (url, options = {}, retried = false) => {
  const headers = { ...options.headers };
  const token = readToken();
  if (token) headers['X-Taskflow-Token'] = token;
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401 && !retried && (await askForToken())) {
    return request(url, options, true);
  }
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
};

const get = (url) => request(url);
const post = (url, data) => request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
const put = (url, data) => request(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: data !== undefined ? JSON.stringify(data) : undefined });

export const getTasks = () => get('/api/tasks');
export const getTask = (uuid) => get(`/api/tasks/${uuid}`);
export const createTask = (data) => post('/api/tasks', data);
export const updateTask = (uuid, data) => put(`/api/tasks/${uuid}`, data);
export const completeTask = (uuid, data) => post(`/api/tasks/${uuid}/complete`, data);
export const getDoneTasks = () => get('/api/done');
export const getDoneTask = (uuid) => get(`/api/done/${uuid}`);
export const reopenTask = (uuid) => put(`/api/done/${uuid}/reopen`);
export const addComment = (uuid, data) => post(`/api/tasks/${uuid}/comments`, data);
export const addDoneComment = (uuid, data) => post(`/api/done/${uuid}/comments`, data);
