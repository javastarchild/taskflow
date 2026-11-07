import './App.css';
import { ThemeSelector } from './components/ThemeSelector';
import { Settings } from './components/Settings';
import { ProjectPanel } from './components/ProjectPanel';
import { QueuePanel } from './components/QueuePanel';
import { TaskProvider } from './context/TaskContext';
import { NavProvider, useNav } from './context/NavContext';
import { useTasks } from './hooks/useTasks';
import { ActiveTasksTab } from './components/ActiveTasksTab';
import { CompletedTasksTab } from './components/CompletedTasksTab';
import { ActivityFeedTab } from './components/ActivityFeedTab';

const TABS = ['Active', 'Completed', 'Activity'];

function TabBar({ active, onChange, activityCount }) {
  return (
    <div className="tab-bar">
      {TABS.map((tab) => (
        <button
          key={tab}
          className={`tab${active === tab ? ' active' : ''}`}
          onClick={() => onChange(tab)}
        >
          {tab}
          {tab === 'Activity' && activityCount > 0 && (
            <span className="tab-badge">{activityCount}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function TabContent({ active }) {
  if (active === 'Active') return <ActiveTasksTab />;
  if (active === 'Completed') return <CompletedTasksTab />;
  return <ActivityFeedTab />;
}

function AppShell() {
  const { tasks, doneTasks, project, goal, error, loading } = useTasks();
  const { activeTab, setActiveTab } = useNav();

  const totalComments = [...tasks, ...doneTasks].reduce(
    (sum, t) => sum + (t.comments?.length ?? 0), 0
  );

  return (
    <div className="App">
      <header className="app-header">
        <div><p className="app-eyebrow">TASKFLOW</p><h1 className="app-title">Workspace</h1></div>
        <div className="app-controls"><ThemeSelector /><Settings /></div>
      </header>
      <div className="workspace-layout">
        <main className="planner-area" aria-label="Planner">
          <h2 className="panel-title">Planner</h2>
          <ProjectPanel />
          {error && <p role="alert">{error}</p>}
          {loading && <p role="status">Loading…</p>}
          <TabBar active={activeTab} onChange={setActiveTab} activityCount={totalComments} />
          <div className="tab-content">
            {project && <TabContent key={`${project}:${goal}`} active={activeTab} />}
          </div>
        </main>
        <aside className="queue-sidebar" aria-label="Queue monitor">
          {project ? <QueuePanel /> : <section className="queue-panel"><h2>Queue status</h2><p>Select or create a project to monitor its queue.</p></section>}
        </aside>
      </div>
    </div>
  );
}

function App() {
  return (
    <TaskProvider>
      <NavProvider>
        <AppShell />
      </NavProvider>
    </TaskProvider>
  );
}

export default App;
