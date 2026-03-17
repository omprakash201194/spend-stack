import React, { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar.js';
import DashboardView from './views/DashboardView.js';
import TransactionsView from './views/TransactionsView.js';
import ImportView from './views/ImportView.js';
import CategoriesView from './views/CategoriesView.js';
import SettingsView from './views/SettingsView.js';

export type NavItem = 'dashboard' | 'transactions' | 'import' | 'categories' | 'settings';

function App() {
  const [activeView, setActiveView] = useState<NavItem>('dashboard');
  const [ipcMessage, setIpcMessage] = useState<string | null>(null);

  useEffect(() => {
    // Subscribe to the main-process ready message via the secure IPC bridge.
    const cleanup = window.electronAPI?.onMainProcessMessage((msg) => {
      setIpcMessage(msg);
    });
    return cleanup ?? undefined;
  }, []);

  function renderView() {
    switch (activeView) {
      case 'dashboard':
        return <DashboardView ipcMessage={ipcMessage} />;
      case 'transactions':
        return <TransactionsView />;
      case 'import':
        return <ImportView />;
      case 'categories':
        return <CategoriesView />;
      case 'settings':
        return <SettingsView />;
    }
  }

  return (
    <div className="app-shell">
      <Sidebar activeView={activeView} onNavigate={setActiveView} />
      <main className="app-main">{renderView()}</main>
    </div>
  );
}

export default App;
