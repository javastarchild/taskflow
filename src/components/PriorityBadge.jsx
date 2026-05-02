import './PriorityBadge.css';

export function PriorityBadge({ priority }) {
  return <span className={`priority-badge priority-${priority}`}>{priority}</span>;
}
