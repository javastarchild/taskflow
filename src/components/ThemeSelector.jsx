import { useEffect, useState } from 'react';

export function ThemeSelector() {
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('taskflowTheme');
      return ['light', 'dark', 'system'].includes(saved) ? saved : 'system';
    } catch { return 'system'; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('taskflowTheme', theme); } catch {}
  }, [theme]);
  return <label className="theme-selector">Theme
    <select value={theme} onChange={event => setTheme(event.target.value)}>
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  </label>;
}
