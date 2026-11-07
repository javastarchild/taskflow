import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';

let projects;
let goals;
let tasks;
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const requested = path => fetch.mock.calls.some(([url]) => url === path);
const posted = path => fetch.mock.calls.find(([url, options]) => url === path && options.method === 'POST');

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  projects = [{ id: 'p1', slug: 'alpha', name: 'Alpha' }, { id: 'p2', slug: 'beta', name: 'Beta' }];
  goals = [{ id: 'g1', title: 'Launch', status: 'active' }];
  tasks = [{ id: 't1', title: 'Dependency', status: 'todo', priority: 'high', ready: true, created: '2026-11-07', comments: [] }];
  global.fetch = jest.fn(async (url, options = {}) => {
    const data = options.body ? JSON.parse(options.body) : {};
    if (url === '/api/health') return response({ ok: true, version: 1 });
    if (url === '/api/projects') {
      if (options.method === 'POST') {
        const project = { id: 'p3', slug: 'new-project', ...data };
        projects.push(project);
        return response(project, 201);
      }
      return response([...projects]);
    }
    if (url.endsWith('/goals')) {
      if (options.method === 'POST') { const goal = { id: 'g2', status: 'active', ...data }; goals.push(goal); return response(goal, 201); }
      return response([...goals]);
    }
    if (url.startsWith('/api/goals/')) {
      goals = goals.map(g => g.id === url.split('/').pop() ? { ...g, ...data } : g);
      return response(goals[0]);
    }
    if (url.endsWith('/queue')) return response({ counts: { ready: 2, blocked: 3, 'in-progress': 1, done: 4, expired: 1 }, workers: [{ worker: 'codex-1', task_id: 't2', title: 'Running task', lease_expires: '2026-11-07T17:00:00Z', expired: true }] });
    if (url.includes('/tasks')) {
      if (options.method === 'POST') return response({ id: 'new-task', ...data }, 201);
      return response(tasks);
    }
    throw new Error(`Unexpected request: ${url}`);
  });
});

test('renders tabs and restores/persists project selection', async () => {
  localStorage.setItem('taskflowProject', 'beta');
  render(<App />);
  await waitFor(() => expect(screen.getByLabelText('Project')).toHaveValue('beta'));
  expect(requested('/api/projects/beta/tasks')).toBe(true);
  for (const tab of ['Active', 'Completed', 'Activity']) expect(screen.getByRole('button', { name: tab })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Project'), { target: { value: 'alpha' } });
  await waitFor(() => expect(requested('/api/projects/alpha/tasks')).toBe(true));
  expect(localStorage.getItem('taskflowProject')).toBe('alpha');
});

test('empty projects prompt creation and select the created project', async () => {
  projects = [];
  render(<App />);
  expect(await screen.findByText('Create a project to start organizing tasks.')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'New Project' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));
  await waitFor(() => expect(screen.getByLabelText('Project')).toHaveValue('new-project'));
  expect(JSON.parse(posted('/api/projects')[1].body)).toEqual({ name: 'New Project' });
  expect(localStorage.getItem('taskflowProject')).toBe('new-project');
});

test('creates goals, filters tasks by goal and no goal, and changes goal status', async () => {
  render(<App />);
  await screen.findByText('Launch (active)');
  fireEvent.change(screen.getByLabelText('Goal title'), { target: { value: 'Ship UI' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Goal' }));
  await screen.findByText('Ship UI (active)');
  expect(JSON.parse(posted('/api/projects/alpha/goals')[1].body)).toEqual({ title: 'Ship UI', description: '' });
  fireEvent.change(screen.getByLabelText('Goal filter'), { target: { value: 'g2' } });
  await waitFor(() => expect(requested('/api/projects/alpha/tasks?goal=g2')).toBe(true));
  fireEvent.change(screen.getByLabelText('Goal status'), { target: { value: 'achieved' } });
  await screen.findByText('Ship UI (achieved)');
  fireEvent.change(screen.getByLabelText('Goal filter'), { target: { value: 'none' } });
  await waitFor(() => expect(requested('/api/projects/alpha/tasks?goal=none')).toBe(true));
});

test('creates scoped tasks with selected goal, tags and project dependencies', async () => {
  render(<App />);
  await screen.findByText('Launch (active)');
  fireEvent.change(screen.getByLabelText('Goal filter'), { target: { value: 'g1' } });
  await waitFor(() => expect(requested('/api/projects/alpha/tasks?goal=g1')).toBe(true));
  await screen.findByText('Dependency');
  fireEvent.click(screen.getAllByRole('button', { name: '+ New Task' })[0]);
  fireEvent.change(screen.getByPlaceholderText('Title (required)'), { target: { value: 'Ship task' } });
  fireEvent.change(screen.getByPlaceholderText('Description'), { target: { value: 'Implement it' } });
  fireEvent.change(screen.getByLabelText('Tags (comma-separated)'), { target: { value: 'ui, release' } });
  const dependencies = screen.getByLabelText('Depends on');
  within(dependencies).getByRole('option', { name: 'Dependency' }).selected = true;
  fireEvent.change(dependencies);
  fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));
  await waitFor(() => expect(posted('/api/projects/alpha/tasks')).toBeDefined());
  expect(JSON.parse(posted('/api/projects/alpha/tasks')[1].body)).toEqual({ title: 'Ship task', description: 'Implement it', priority: 'medium', tags: ['ui', 'release'], depends_on: ['t1'], goal_id: 'g1' });
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Create Task' })).not.toBeInTheDocument());
});

test('queue renders counts and worker lease; polling stops on unmount', async () => {
  jest.useFakeTimers();
  try {
    const { unmount } = render(<App />);
    await act(async () => {});
    const queue = screen.getByRole('region', { name: 'Queue status' });
    for (const [key, count] of Object.entries({ ready: 2, blocked: 3, 'in-progress': 1, done: 4, expired: 1 })) {
      expect(within(queue).getByText(key).nextSibling).toHaveTextContent(String(count));
    }
    expect(within(queue).getByText('codex-1')).toBeInTheDocument();
    expect(within(queue).getByText('Running task')).toBeInTheDocument();
    expect(within(queue).getByText('2026-11-07T17:00:00Z')).toBeInTheDocument();
    expect(within(queue).getByText('Expired')).toBeInTheDocument();
    const count = () => fetch.mock.calls.filter(([url]) => url.endsWith('/queue')).length;
    const initial = count();
    await act(async () => { jest.advanceTimersByTime(10000); });
    expect(count()).toBe(initial + 1);
    unmount();
    await act(async () => { jest.advanceTimersByTime(20000); });
    expect(count()).toBe(initial + 1);
  } finally { jest.useRealTimers(); }
});

test('401 opens token form and saving retries with a session Bearer token', async () => {
  const original = fetch.getMockImplementation();
  fetch.mockImplementation((url, options) => url !== '/api/health' && !options.headers.Authorization ? Promise.resolve(response({ error: 'Unauthorized' }, 401)) : original(url, options));
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Sign in to Taskflow' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Access token'), { target: { value: 'valid-token' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
  await screen.findByText('Launch (active)');
  expect(sessionStorage.getItem('taskflowToken')).toBe('valid-token');
  expect(localStorage.getItem('taskflowToken')).toBeNull();
  expect(await screen.findByText('Healthy (API v1)')).toBeInTheDocument();
});

test('completed and activity tabs display v1 completion and comments and reopen through POST', async () => {
  const done = { id: 'done1', title: 'Finished work', status: 'done', priority: 'low', created: '2026-11-07', completion: { completed: '2026-11-07', worker: 'ui', summary: 'Delivered feature', files_changed: 'src/App.js', notes: 'Ready for review' }, comments: [{ author: 'planner', timestamp: '2026-11-07', content: 'Looks good' }] };
  tasks.push(done);
  const original = fetch.getMockImplementation();
  fetch.mockImplementation((url, options) => url === '/api/tasks/done1' ? Promise.resolve(response(done)) : original(url, options));
  render(<App />);
  await screen.findByText('Dependency');
  fireEvent.click(screen.getByRole('button', { name: 'Completed' }));
  fireEvent.click(await screen.findByText('Finished work'));
  expect(await screen.findByText('Delivered feature')).toBeInTheDocument();
  expect(screen.getByText('src/App.js')).toBeInTheDocument();
  expect(screen.getByText('Ready for review')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
  await waitFor(() => expect(posted('/api/tasks/done1/reopen')).toBeDefined());
  fireEvent.click(screen.getByRole('button', { name: /Activity/ }));
  expect(await screen.findByText('Looks good')).toBeInTheDocument();
});

test('ignores a late task response after selecting a different project', async () => {
  const original = fetch.getMockImplementation();
  let resolveAlpha;
  fetch.mockImplementation((url, options) => url === '/api/projects/alpha/tasks' ? new Promise(resolve => { resolveAlpha = resolve; }) : original(url, options));
  render(<App />);
  await waitFor(() => expect(resolveAlpha).toBeDefined());
  fireEvent.change(screen.getByLabelText('Project'), { target: { value: 'beta' } });
  await screen.findByText('Dependency');
  await act(async () => { resolveAlpha(response([{ ...tasks[0], title: 'Stale alpha task' }])); });
  expect(screen.queryByText('Stale alpha task')).not.toBeInTheDocument();
  expect(screen.getByText('Dependency')).toBeInTheDocument();
});
