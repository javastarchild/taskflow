import { createContext, useCallback, useEffect, useState } from 'react';
import * as api from '../api/client';

export const TaskContext = createContext(null);
const storedProject = () => {
  try { return localStorage.getItem('taskflowProject') || ''; } catch { return ''; }
};

export function TaskProvider({ children }) {
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState('');
  const [goal, setGoal] = useState('');
  const [goals, setGoals] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [visibleTasks, setVisibleTasks] = useState([]);
  const [queue, setQueue] = useState(null);
  const [queueError, setQueueError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [revision, setRevision] = useState(0);
  const [connection, setConnection] = useState(0);
  const refresh = useCallback(() => setRevision(v => v + 1), []);
  const selectProject = useCallback(slug => {
    setProject(slug);
    setGoal('');
    setAllTasks([]);
    setVisibleTasks([]);
    setGoals([]);
    setQueue(null);
    setQueueError('');
    try { localStorage.setItem('taskflowProject', slug); } catch {}
  }, []);

  useEffect(() => {
    const changed = () => {
      setProject('');
      setGoal('');
      setAllTasks([]);
      setVisibleTasks([]);
      setGoals([]);
      setQueue(null);
      setQueueError('');
      setProjects([]);
      setConnection(v => v + 1);
    };
    window.addEventListener('taskflow-settings', changed);
    return () => window.removeEventListener('taskflow-settings', changed);
  }, [selectProject]);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    api.getProjects().then(items => {
      if (!current) return;
      setProjects(items);
      const saved = storedProject();
      selectProject(items.some(p => p.slug === saved) ? saved : items[0]?.slug || '');
    }).catch(err => { if (current) setError(err.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [connection, selectProject]);

  useEffect(() => {
    if (!project) return;
    let current = true;
    setLoading(true);
    setError(null);
    setVisibleTasks([]);
    let pending = false;
    const loadTasks = () => {
      if (pending) return;
      pending = true;
      Promise.all([api.getTasks(project, goal), api.getGoals(project), goal ? api.getTasks(project) : null])
        .then(([tasks, nextGoals, unfiltered]) => {
          if (!current) return;
          setError(null);
          setVisibleTasks(tasks);
          setAllTasks(unfiltered || tasks);
          setGoals(nextGoals);
        }).catch(err => { if (current) setError(err.message); })
        .finally(() => { pending = false; if (current) setLoading(false); });
    };
    loadTasks();
    const interval = setInterval(loadTasks, 10000);
    return () => { current = false; clearInterval(interval); };
  }, [project, goal, revision]);

  useEffect(() => {
    if (!project) return;
    let current = true;
    const refreshQueue = () => api.getQueue(project).then(data => {
      if (current) { setQueue(data); setQueueError(''); }
    }).catch(err => { if (current) setQueueError(err.message); });
    refreshQueue();
    const interval = setInterval(refreshQueue, 10000);
    return () => { current = false; clearInterval(interval); };
  }, [project, revision]);

  async function mutate(operation) {
    const result = await operation();
    refresh();
    return result;
  }
  async function createProject(data) {
    const created = await api.createProject(data);
    setProjects(previous => [...previous, created]);
    selectProject(created.slug);
    return created;
  }
  const value = {
    projects, project, selectProject, createProject, goals, goal, setGoal,
    allTasks, tasks: visibleTasks.filter(t => t.status !== 'done'),
    doneTasks: visibleTasks.filter(t => t.status === 'done'),
    queue, queueError, loading, error, refresh,
    createGoal: data => mutate(() => api.createGoal(project, data)),
    updateGoal: (id, data) => mutate(() => api.updateGoal(id, data)),
    createTask: data => mutate(() => api.createTask(project, { ...data, goal_id: data.goal_id === undefined ? (goal && goal !== 'none' ? goal : null) : data.goal_id })),
    updateTask: (id, data) => mutate(() => api.updateTask(id, data)),
    completeTask: (id, data) => mutate(() => api.completeTask(id, data)),
    reopenTask: id => mutate(() => api.reopenTask(id)),
    addComment: (id, data) => mutate(() => api.addComment(id, data)),
    addDoneComment: (id, data) => mutate(() => api.addComment(id, data))
  };
  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}
