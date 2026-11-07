import { useTasks } from '../hooks/useTasks';
import './ProjectPanel.css';

export function QueuePanel() {
  const { queue, queueError, refresh } = useTasks();
  return <section className="queue-panel" aria-label="Queue status">
    <h2>Queue status</h2><p className="queue-caption">All goals in the selected project · Updates every 10s</p>
    <button className="btn-secondary" onClick={refresh}>Refresh queue</button>
    {queueError && <p role="alert">{queueError}</p>}
    {!queue && <p>Loading queue…</p>}
    {queue && <>
      <dl className="queue-counts">
        {['ready', 'blocked', 'in-progress', 'done', 'expired'].map(key => <div key={key}><dt>{key}</dt><dd>{queue.counts[key]}</dd></div>)}
      </dl>
      <h3>Workers</h3>
      {!queue.workers.length ? <p>No active workers.</p> : <div className="queue-workers">
        {queue.workers.map(w => <article className="worker-card" key={w.task_id}>
          <div className="worker-heading"><strong>{w.worker}</strong><span className={w.expired ? 'lease-expired' : 'lease-active'}>{w.expired ? 'Expired' : 'Active'}</span></div>
          <p>{w.title}</p><small>Lease expires</small><time>{w.lease_expires}</time>
        </article>)}
      </div>}
    </>}
  </section>;
}
