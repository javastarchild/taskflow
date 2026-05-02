import { createContext, useCallback, useEffect, useState } from 'react';
import * as api from '../api/client';

export const TaskContext = createContext(null);

export function TaskProvider({ children }) {
  const [tasks, setTasks] = useState([]);
  const [doneTasks, setDoneTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [active, done] = await Promise.all([api.getTasks(), api.getDoneTasks()]);
      setTasks(active);
      setDoneTasks(done);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const createTask = useCallback(async (data) => {
    const task = await api.createTask(data);
    await refresh();
    return task;
  }, [refresh]);

  const updateTask = useCallback(async (uuid, data) => {
    const task = await api.updateTask(uuid, data);
    await refresh();
    return task;
  }, [refresh]);

  const completeTask = useCallback(async (uuid, completionData) => {
    await api.completeTask(uuid, completionData);
    await refresh();
  }, [refresh]);

  const reopenTask = useCallback(async (uuid) => {
    await api.reopenTask(uuid);
    await refresh();
  }, [refresh]);

  const addComment = useCallback(async (uuid, data) => {
    await api.addComment(uuid, data);
    await refresh();
  }, [refresh]);

  const addDoneComment = useCallback(async (uuid, data) => {
    await api.addDoneComment(uuid, data);
    await refresh();
  }, [refresh]);

  return (
    <TaskContext.Provider value={{ tasks, doneTasks, loading, error, refresh, createTask, updateTask, completeTask, reopenTask, addComment, addDoneComment }}>
      {children}
    </TaskContext.Provider>
  );
}
