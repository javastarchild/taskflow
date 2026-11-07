import { useEffect, useState } from 'react';
import { useTasks } from '../hooks/useTasks';
import { useNav } from '../context/NavContext';
import { PriorityBadge } from './PriorityBadge';
import { CommentInput } from './CommentInput';
import './ActiveTasksTab.css';

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

function formatDate(iso) {
  return new Date(iso).toLocaleDateString();
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}

function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const pd = (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
    if (pd !== 0) return pd;
    return new Date(b.created) - new Date(a.created);
  });
}

const BLANK_FORM = { title: '', description: '', priority: 'medium', tags: '', depends_on: [] };

export function ActiveTasksTab() {
  const { tasks, allTasks, createTask, updateTask, completeTask, addComment } = useTasks();
  const { focusedTask, clearFocus } = useNav();
  const [selectedId, setSelectedId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [editState, setEditState] = useState(null);
  const [completeTarget, setCompleteTarget] = useState(null);
  const [completeSummary, setCompleteSummary] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (focusedTask?.tab === 'Active') {
      setSelectedId(focusedTask.id);
      setEditState(null);
      setCompleteTarget(null);
      clearFocus();
    }
  }, [focusedTask, clearFocus]);

  const sorted = sortTasks(tasks);

  function toggleCard(id) {
    setSelectedId(prev => prev === id ? null : id);
    setEditState(null);
    setCompleteTarget(null);
    setCompleteSummary('');
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await createTask({ title: form.title.trim(), description: form.description.trim(), priority: form.priority, tags: form.tags.split(',').map(tag => tag.trim()).filter(Boolean), depends_on: form.depends_on });
      setForm(BLANK_FORM);
      setShowForm(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(task) {
    setEditState({ title: task.title, description: task.body ?? '', priority: task.priority });
    setCompleteTarget(null);
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    if (!editState.title.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await updateTask(selectedId, { title: editState.title.trim(), body: editState.description, priority: editState.priority });
      setEditState(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleComplete(e) {
    e.preventDefault();
    if (!completeSummary.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await completeTask(completeTarget, { summary: completeSummary.trim() });
      setSelectedId(null);
      setCompleteTarget(null);
      setCompleteSummary('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="active-tab">
      {error && <p role="alert">{error}</p>}
      <div className="tab-section-header">
        <h2>Active Tasks</h2>
        <button className="btn-primary" onClick={() => { setShowForm(v => !v); }}>
          {showForm ? 'Cancel' : '+ New Task'}
        </button>
      </div>

      {showForm && (
        <form className="task-form" onSubmit={handleCreate}>
          <input
            className="form-input"
            placeholder="Title (required)"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            required
          />
          <textarea
            className="form-textarea"
            placeholder="Description"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={4}
          />
          <select
            className="form-select"
            value={form.priority}
            onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <label>Tags (comma-separated)<input className="form-input" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} /></label>
          <label>Depends on<select className="form-select" multiple value={form.depends_on} onChange={e => setForm(f => ({ ...f, depends_on: Array.from(e.target.selectedOptions, option => option.value) }))}>
            {allTasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}
          </select></label>
          <div className="form-actions">
            <button className="btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create Task'}
            </button>
          </div>
        </form>
      )}

      {sorted.length === 0 && !showForm && (
        <div className="empty-state">
          <p>No active tasks.</p>
          <button className="btn-primary" onClick={() => setShowForm(true)}>+ New Task</button>
        </div>
      )}

      <div className="task-list">
        {sorted.map(task => {
          const comments = task.comments ?? [];
          const isOpen = selectedId === task.id;
          return (
            <div key={task.id} className={`task-card${isOpen ? ' expanded' : ''}`}>
              <div className="task-card-header" onClick={() => toggleCard(task.id)}>
                <span className="task-title">{task.title}</span>
                <div className="task-meta">
                  <PriorityBadge priority={task.priority} />
                  <span className="task-date">{formatDate(task.created)}</span>
                  {comments.length > 0 && (
                    <span className="task-comment-count">{comments.length} comment{comments.length !== 1 ? 's' : ''}</span>
                  )}
                  <span className="task-chevron">{isOpen ? '▲' : '▼'}</span>
                </div>
              </div>

              <div className="task-queue-meta">
                Status: {task.status} · Ready: {task.ready ? 'Yes' : 'No'} · Assignee: {task.assignee || 'Unassigned'} · Lease expires: {task.lease_expires || '—'}
                <div>Blocked by: {(task.blocked_by || []).map(id => allTasks.find(t => t.id === id)?.title || id).join(', ') || 'None'}</div>
              </div>
              {isOpen && (
                <div className="task-detail">
                  {editState ? (
                    <form onSubmit={handleSaveEdit} className="task-form">
                      <input
                        className="form-input"
                        value={editState.title}
                        onChange={e => setEditState(s => ({ ...s, title: e.target.value }))}
                        required
                      />
                      <textarea
                        className="form-textarea"
                        value={editState.description}
                        onChange={e => setEditState(s => ({ ...s, description: e.target.value }))}
                        rows={6}
                      />
                      <select
                        className="form-select"
                        value={editState.priority}
                        onChange={e => setEditState(s => ({ ...s, priority: e.target.value }))}
                      >
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                      <div className="form-actions">
                        <button className="btn-primary" type="submit" disabled={submitting}>Save</button>
                        <button className="btn-secondary" type="button" onClick={() => setEditState(null)}>Cancel</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      {task.body && <pre className="task-body">{task.body.trim()}</pre>}

                      <div className="comment-thread">
                        {comments.length > 0 && (
                          <>
                            <h4>Comments</h4>
                            {comments.map((c, i) => (
                              <div key={i} className={`comment comment-${c.author}`}>
                                <div className="comment-header">
                                  <span className={`comment-badge comment-badge-${c.author}`}>{c.author.toUpperCase()}</span>
                                  <span className="comment-time">{formatDateTime(c.timestamp)}</span>
                                </div>
                                <p className="comment-content">{c.content}</p>
                              </div>
                            ))}
                          </>
                        )}
                        <CommentInput onSubmit={(author, content) => addComment(task.id, { author, content })} />
                      </div>

                      {completeTarget === task.id ? (
                        <form onSubmit={handleComplete} className="complete-form">
                          <label className="form-label">Completion summary (required)</label>
                          <textarea
                            className="form-textarea"
                            value={completeSummary}
                            onChange={e => setCompleteSummary(e.target.value)}
                            rows={3}
                            autoFocus
                          />
                          <div className="form-actions">
                            <button className="btn-success" type="submit" disabled={submitting || !completeSummary.trim()}>
                              {submitting ? 'Completing…' : 'Confirm Complete'}
                            </button>
                            <button className="btn-secondary" type="button" onClick={() => { setCompleteTarget(null); setCompleteSummary(''); }}>
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="form-actions">
                          <button className="btn-secondary" onClick={() => startEdit(task)}>Edit</button>
                          <button className="btn-success" onClick={() => setCompleteTarget(task.id)}>Mark Complete</button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
