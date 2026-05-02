import { createContext, useCallback, useContext, useState } from 'react';

const NavContext = createContext(null);

export function NavProvider({ children }) {
  const [activeTab, setActiveTab] = useState('Active');
  const [focusedTask, setFocusedTask] = useState(null); // { id, tab: 'Active'|'Completed' }

  const focusTask = useCallback((id, tab) => {
    setActiveTab(tab);
    setFocusedTask({ id, tab });
  }, []);

  const clearFocus = useCallback(() => setFocusedTask(null), []);

  return (
    <NavContext.Provider value={{ activeTab, setActiveTab, focusedTask, focusTask, clearFocus }}>
      {children}
    </NavContext.Provider>
  );
}

export function useNav() {
  return useContext(NavContext);
}
