const json = (r) => r.json();
const post = (url, data) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(json);
const put = (url, data) => fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: data !== undefined ? JSON.stringify(data) : undefined }).then(json);

export const getTasks = () => fetch('/api/tasks').then(json);
export const getTask = (uuid) => fetch(`/api/tasks/${uuid}`).then(json);
export const createTask = (data) => post('/api/tasks', data);
export const updateTask = (uuid, data) => put(`/api/tasks/${uuid}`, data);
export const completeTask = (uuid, data) => post(`/api/tasks/${uuid}/complete`, data);
export const getDoneTasks = () => fetch('/api/done').then(json);
export const getDoneTask = (uuid) => fetch(`/api/done/${uuid}`).then(json);
export const reopenTask = (uuid) => put(`/api/done/${uuid}/reopen`);
export const addComment = (uuid, data) => post(`/api/tasks/${uuid}/comments`, data);
export const addDoneComment = (uuid, data) => post(`/api/done/${uuid}/comments`, data);
