import { useState } from 'react';
import { useTasks } from '../hooks/useTasks';
import './ProjectPanel.css';

export function ProjectPanel() {
  const { projects, project, selectProject, createProject, goals, goal, setGoal, createGoal, updateGoal, loading } = useTasks();
  const [projectForm, setProjectForm] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event, operation) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError('');
    try { await operation(new FormData(form)); form.reset(); } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return (
    <section className="project-panel" aria-label="Projects and goals">
      {error && <p role="alert">{error}</p>}
      <label>Project
        <select value={project} onChange={e => selectProject(e.target.value)} disabled={!projects.length}>
          {!projects.length && <option value="">No projects</option>}
          {projects.map(p => <option key={p.id} value={p.slug}>{p.name}</option>)}
        </select>
      </label>
      <button className="btn-secondary" onClick={() => setProjectForm(v => !v)}>New Project</button>
      {!projects.length && !loading && <p>Create a project to start organizing tasks.</p>}
      {(projectForm || !projects.length) && <form className="task-form" onSubmit={e => submit(e, async data => {
        await createProject(Object.fromEntries([...data.entries()].filter(([, value]) => value.trim())));
        setProjectForm(false);
      })}>
        <label>Project name<input name="name" required /></label>
        <label>Project slug<input name="slug" pattern="[a-z0-9][a-z0-9-]{0,62}" /></label>
        <label>Project description<textarea name="description" /></label>
        <label>Repository URL<input name="repo_url" type="url" /></label>
        <button className="btn-primary" disabled={busy}>Create Project</button>
      </form>}
      {project && <>
        <label>Goal filter<select value={goal} onChange={e => setGoal(e.target.value)}>
          <option value="">All goals</option>
          <option value="none">No goal</option>
          {goals.map(g => <option key={g.id} value={g.id}>{g.title} ({g.status})</option>)}
        </select></label>
        {goals.filter(g => g.id === goal).map(g => <label key={g.id}>Goal status
          <select value={g.status} disabled={busy} onChange={async e => {
            setBusy(true); setError('');
            try { await updateGoal(g.id, { status: e.target.value }); } catch (err) { setError(err.message); }
            finally { setBusy(false); }
          }}>
            {['active', 'achieved', 'archived'].map(status => <option key={status}>{status}</option>)}
          </select>
        </label>)}
        <details className="goal-form"><summary>New goal</summary>
        <form className="task-form" onSubmit={e => submit(e, data => createGoal({ title: data.get('title').trim(), description: data.get('description').trim() }))}>
          <label>Goal title<input name="title" required /></label>
          <label>Goal description<textarea name="description" /></label>
          <button className="btn-secondary" disabled={busy}>Create Goal</button>
        </form>
        </details>
      </>}
    </section>
  );
}
