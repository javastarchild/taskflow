import { useTasks } from '../hooks/useTasks';
import './ProjectPanel.css';

export function QueuePanel() {
  const { queue, queueError, refresh } = useTasks();
  return <section className="queue-panel" aria-label="Queue status">
    <h2>Queue status</h2>
    <button className="btn-secondary" onClick={refresh}>Refresh queue</button>
    {queueError && <p role="alert">{queueError}</p>}
    {!queue && <p>Loading queue…</p>}
    {queue && <>
      <dl className="queue-counts">
        {['ready', 'blocked', 'in-progress', 'done', 'expired'].map(key => <div key={key}><dt>{key}</dt><dd>{queue.counts[key]}</dd></div>)}
      </dl>
      <h3>Workers</h3>
      {!queue.workers.length ? <p>No active workers.</p> : <div className="queue-workers"><table>
        <thead><tr><th>Worker</th><th>Task</th><th>Lease expires</th><th>Status</th></tr></thead>
        <tbody>{queue.workers.map(w => <tr key={w.task_id}><td>{w.worker}</td><td>{w.title}</td><td>{w.lease_expires}</td><td>{w.expired ? 'Expired' : 'Active'}</td></tr>)}</tbody>
      </table></div>}
    </>}
  </section>;
}
