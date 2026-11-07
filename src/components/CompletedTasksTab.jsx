import { useEffect, useState } from 'react';
import { useTasks } from '../hooks/useTasks';
import { useNav } from '../context/NavContext';
import { getDoneTask } from '../api/client';
import { PriorityBadge } from './PriorityBadge';
import { CommentInput } from './CommentInput';
import './CompletedTasksTab.css';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}

function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

function sortDone(tasks) {
  return [...tasks].sort((a, b) => {
    const ca = a.completion?.completed ?? '';
    const cb = b.completion?.completed ?? '';
    return new Date(cb) - new Date(ca);
  });
}

export function CompletedTasksTab() {
  const { doneTasks, reopenTask, addDoneComment } = useTasks();
  const { focusedTask, clearFocus } = useNav();
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const sorted = sortDone(doneTasks);
  const completedToday = doneTasks.filter(t => isToday(t.completion?.completed)).length;

  async function openDetail(id) {
    setSelectedId(id);
    setDetail(null);
    setLoadingDetail(true);
    setError('');
    try {
      setDetail(await getDoneTask(id));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingDetail(false);
    }
  }

  useEffect(() => {
    if (focusedTask?.tab === 'Completed' && focusedTask.id !== selectedId) {
      openDetail(focusedTask.id);
      clearFocus();
    }
  }, [focusedTask, clearFocus]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCardClick(id) {
    if (selectedId === id) { setSelectedId(null); setDetail(null); return; }
    openDetail(id);
  }

  async function handleReopen(uuid) {
    setSubmitting(true);
    setError('');
    try {
      await reopenTask(uuid);
      setSelectedId(null);
      setDetail(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddComment(uuid, author, content) {
    await addDoneComment(uuid, { author, content });
    // refresh detail to show new comment
    const full = await getDoneTask(uuid);
    setDetail(full);
  }

  return (
    <div className="completed-tab">
      {error && <p role="alert">{error}</p>}
      <div className="stats-bar">
        <span className="stat"><strong>{doneTasks.length}</strong> completed total</span>
        <span className="stat-divider">·</span>
        <span className="stat"><strong>{completedToday}</strong> today</span>
      </div>

      {sorted.length === 0 && (
        <div className="empty-state"><p>No completed tasks yet.</p></div>
      )}

      <div className="task-list">
        {sorted.map(task => {
          const isOpen = selectedId === task.id;
          const completedAt = task.completion?.completed;
          const worker = task.completion?.worker;
          return (
            <div key={task.id} className={`task-card${isOpen ? ' expanded' : ''}`}>
              <div className="task-card-header" onClick={() => handleCardClick(task.id)}>
                <span className="task-title">{task.title}</span>
                <div className="task-meta">
                  <PriorityBadge priority={task.priority} />
                  <span className="task-date">{formatDate(completedAt)}</span>
                  {worker && <span className="task-worker">{worker}</span>}
                  <span className="task-chevron">{isOpen ? '▲' : '▼'}</span>
                </div>
              </div>

              {isOpen && (
                <div className="task-detail">
                  {loadingDetail && <p className="loading">Loading…</p>}

                  {detail && detail.id === task.id && (() => {
                    const summary = detail.completion?.summary;
                    const filesChanged = detail.completion?.files_changed;
                    const plannerNotes = detail.completion?.notes;
                    const comments = detail.comments ?? [];

                    return (
                      <>
                        {detail.body && (
                          <div className="detail-section">
                            <h4>Description</h4>
                            <pre className="task-body">{detail.body.trim()}</pre>
                          </div>
                        )}
                        {summary && (
                          <div className="detail-section">
                            <h4>What Was Done</h4>
                            <pre className="task-body">{summary}</pre>
                          </div>
                        )}
                        {filesChanged && (
                          <div className="detail-section">
                            <h4>Files Changed</h4>
                            <pre className="task-body">{filesChanged}</pre>
                          </div>
                        )}
                        {plannerNotes && (
                          <div className="detail-section">
                            <h4>Notes for Planner</h4>
                            <pre className="task-body">{plannerNotes}</pre>
                          </div>
                        )}

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
                          <CommentInput onSubmit={(author, content) => handleAddComment(task.id, author, content)} />
                        </div>

                        <div className="form-actions">
                          <button className="btn-secondary" onClick={() => handleReopen(task.id)} disabled={submitting}>
                            {submitting ? 'Reopening…' : 'Reopen'}
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
