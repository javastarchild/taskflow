import { useState } from 'react';
import { useTasks } from '../hooks/useTasks';
import { useNav } from '../context/NavContext';
import './ActivityFeedTab.css';

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}

export function ActivityFeedTab() {
  const { tasks, doneTasks } = useTasks();
  const { focusTask } = useNav();
  const [expanded, setExpanded] = useState(new Set());

  const taskMap = {};
  for (const t of tasks) taskMap[t.id] = { title: t.title, tab: 'Active' };
  for (const t of doneTasks) taskMap[t.id] = { title: t.title, tab: 'Completed' };

  const entries = [];
  for (const t of [...tasks, ...doneTasks]) {
    for (const c of t.comments ?? []) {
      entries.push({ ...c, taskId: t.id, taskTitle: t.title, tab: taskMap[t.id]?.tab });
    }
  }
  entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  function toggleExpand(key) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  if (entries.length === 0) {
    return (
      <div className="activity-tab">
        <div className="empty-state"><p>No comments yet.</p></div>
      </div>
    );
  }

  return (
    <div className="activity-tab">
      <div className="feed">
        {entries.map((entry, i) => {
          const key = `${entry.taskId}-${entry.timestamp}-${i}`;
          const isExpanded = expanded.has(key);
          return (
            <div key={key} className={`feed-entry feed-entry-${entry.author}`}>
              <div className="feed-entry-header">
                <span className={`author-badge author-badge-${entry.author}`}>
                  {entry.author.toUpperCase()}
                </span>
                <button
                  className="feed-task-link"
                  onClick={() => focusTask(entry.taskId, entry.tab)}
                  title={`Go to task in ${entry.tab} tab`}
                >
                  {entry.taskTitle}
                </button>
                <span className="feed-timestamp">{formatDateTime(entry.timestamp)}</span>
              </div>
              <div className={`feed-content${isExpanded ? ' expanded' : ''}`}>
                {entry.content}
              </div>
              {entry.content.length > 180 && (
                <button className="show-more" onClick={() => toggleExpand(key)}>
                  {isExpanded ? 'show less' : 'show more'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
