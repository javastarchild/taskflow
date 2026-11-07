const readStorage = (storage, key) => {
  try { return window[storage].getItem(key); } catch { return null; }
};
const writeStorage = (storage, key, value) => {
  try {
    if (value === null) window[storage].removeItem(key);
    else window[storage].setItem(key, value);
  } catch {}
};
export const getApiUrl = () => (readStorage('localStorage', 'taskflowApiUrl') ?? process.env.REACT_APP_TASKFLOW_API_URL ?? '').trim().replace(/\/+$/, '');
export const getToken = () => readStorage('sessionStorage', 'taskflowToken') || readStorage('localStorage', 'taskflowToken') || '';
export const isTokenRemembered = () => Boolean(readStorage('localStorage', 'taskflowToken'));
export function saveSettings({ url, token, remember }) {
  // An empty field falls back to REACT_APP_TASKFLOW_API_URL / same origin.
  writeStorage('localStorage', 'taskflowApiUrl', url.trim().replace(/\/+$/, '') || null);
  writeStorage('sessionStorage', 'taskflowToken', null);
  writeStorage('localStorage', 'taskflowToken', null);
  writeStorage(remember ? 'localStorage' : 'sessionStorage', 'taskflowToken', token.trim() || null);
  window.dispatchEvent(new Event('taskflow-settings'));
}
export function clearToken() {
  writeStorage('sessionStorage', 'taskflowToken', null);
  writeStorage('localStorage', 'taskflowToken', null);
  window.dispatchEvent(new Event('taskflow-settings'));
}
const request = async (path, options = {}) => {
  const token = getToken();
  const res = await fetch(`${getApiUrl()}${path}`, {
    ...options, headers: { ...options.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  });
  if (res.status === 401) window.dispatchEvent(new Event('taskflow-unauthorized'));
  if (res.status === 204) return null;
  let body;
  try { body = await res.json(); } catch {
    throw new Error(`Unexpected response from ${getApiUrl() || 'this origin'} (${res.status}); check the API base URL`);
  }
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
};
const post = (url, data) => request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
const put = (url, data) => request(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
const projectPath = project => `/api/projects/${encodeURIComponent(project)}`;
export const getHealth = () => request('/api/health');
export const getProjects = () => request('/api/projects');
export const createProject = data => post('/api/projects', data);
export const getGoals = project => request(`${projectPath(project)}/goals`);
export const createGoal = (project, data) => post(`${projectPath(project)}/goals`, data);
export const updateGoal = (id, data) => put(`/api/goals/${id}`, data);
export const getQueue = project => request(`${projectPath(project)}/queue`);
export const getTasks = (project, goal = '') => request(`${projectPath(project)}/tasks${goal ? `?goal=${encodeURIComponent(goal)}` : ''}`);
export const getTask = id => request(`/api/tasks/${id}`);
export const createTask = (project, data) => post(`${projectPath(project)}/tasks`, data);
export const updateTask = (id, data) => put(`/api/tasks/${id}`, data);
export const completeTask = (id, data) => post(`/api/tasks/${id}/complete`, { ...data, worker: 'ui' });
export const reopenTask = id => post(`/api/tasks/${id}/reopen`);
export const addComment = (id, data) => post(`/api/tasks/${id}/comments`, data);
export const getDoneTask = getTask;
export const addDoneComment = addComment;
