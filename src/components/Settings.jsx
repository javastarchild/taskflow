import { useEffect, useState } from 'react';
import * as api from '../api/client';
import './Settings.css';

export function Settings() {
  const [open, setOpen] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [url, setUrl] = useState(api.getApiUrl);
  const [token, setToken] = useState(api.getToken);
  const [remember, setRemember] = useState(api.isTokenRemembered);
  const [health, setHealth] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const signIn = () => { setUnauthorized(true); setOpen(true); };
    window.addEventListener('taskflow-unauthorized', signIn);
    return () => window.removeEventListener('taskflow-unauthorized', signIn);
  }, []);
  useEffect(() => {
    if (!open) return;
    let current = true;
    setHealth('Checking server…');
    api.getHealth().then(data => { if (current) setHealth(data.ok ? `Healthy (API v${data.version})` : 'Server unhealthy'); })
      .catch(err => { if (current) setHealth(`Health check failed: ${err.message}`); });
    return () => { current = false; };
  }, [open, revision]);
  return <div className="settings">
    <button className="btn-secondary" onClick={() => setOpen(v => !v)}>Settings</button>
    {open && <section className="settings-panel" aria-label="API settings">
      <h2>{unauthorized ? 'Sign in to Taskflow' : 'API settings'}</h2>
      {unauthorized && <p role="alert">Access denied. Enter a valid Taskflow token and save to sign in.</p>}
      <form onSubmit={e => {
        e.preventDefault();
        setUnauthorized(false);
        api.saveSettings({ url, token, remember });
        setRevision(v => v + 1);
      }}>
        <label>API base URL<input type="url" placeholder="Same origin (default)" value={url} onChange={e => setUrl(e.target.value)} /></label>
        <label>Access token<input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} /></label>
        <label><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /> Remember on this device</label>
        <button className="btn-primary" type="submit">Save settings</button>
        <button className="btn-secondary" type="button" onClick={() => { api.clearToken(); setToken(''); setRemember(false); }}>Clear token</button>
      </form>
      <p role="status">{health}</p>
      <button className="btn-secondary" onClick={() => setRevision(v => v + 1)}>Check health</button>
    </section>}
  </div>;
}
