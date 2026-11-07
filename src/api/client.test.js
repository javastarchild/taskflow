import * as api from './client';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  delete process.env.REACT_APP_TASKFLOW_API_URL;
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
});
afterEach(() => { delete process.env.REACT_APP_TASKFLOW_API_URL; });

test('uses environment URL, Bearer token and runtime override without trailing slash', async () => {
  process.env.REACT_APP_TASKFLOW_API_URL = 'https://env.example/';
  sessionStorage.setItem('taskflowToken', 'session-token');
  await api.getProjects();
  expect(fetch).toHaveBeenLastCalledWith('https://env.example/api/projects', expect.objectContaining({ headers: { Authorization: 'Bearer session-token' } }));
  api.saveSettings({ url: 'https://runtime.example///', token: 'remembered', remember: true });
  expect(sessionStorage.getItem('taskflowToken')).toBeNull();
  expect(localStorage.getItem('taskflowToken')).toBe('remembered');
  await api.getTasks('my-project', 'none');
  expect(fetch).toHaveBeenLastCalledWith('https://runtime.example/api/projects/my-project/tasks?goal=none', expect.objectContaining({ headers: { Authorization: 'Bearer remembered' } }));
});

test('defaults to same origin and stores tokens in session with explicit clear', async () => {
  api.saveSettings({ url: '', token: 'temporary', remember: false });
  expect(sessionStorage.getItem('taskflowToken')).toBe('temporary');
  expect(localStorage.getItem('taskflowToken')).toBeNull();
  api.clearToken();
  await api.getHealth();
  expect(fetch).toHaveBeenCalledWith('/api/health', { headers: {} });
});

test('returns null for 204 without parsing JSON', async () => {
  const json = jest.fn();
  fetch.mockResolvedValue({ ok: true, status: 204, json });
  await expect(api.reopenTask('task-id')).resolves.toBeNull();
  expect(json).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledWith('/api/tasks/task-id/reopen', expect.objectContaining({ method: 'POST' }));
});

test('completes as ui and comments use the v1 route', async () => {
  await api.completeTask('task-id', { summary: 'Finished' });
  expect(fetch).toHaveBeenLastCalledWith('/api/tasks/task-id/complete', expect.objectContaining({ body: JSON.stringify({ summary: 'Finished', worker: 'ui' }) }));
  await api.addDoneComment('task-id', { author: 'planner', content: 'Thanks' });
  expect(fetch).toHaveBeenLastCalledWith('/api/tasks/task-id/comments', expect.objectContaining({ method: 'POST' }));
});

test('an empty saved URL falls back to the build-time URL and non-JSON errors are readable', async () => {
  process.env.REACT_APP_TASKFLOW_API_URL = 'https://env.example';
  api.saveSettings({ url: '', token: '', remember: false });
  expect(localStorage.getItem('taskflowApiUrl')).toBeNull();
  fetch.mockResolvedValue({ ok: false, status: 404, json: async () => { throw new SyntaxError('Unexpected token <'); } });
  await expect(api.getProjects()).rejects.toThrow('Unexpected response from https://env.example (404); check the API base URL');
});
