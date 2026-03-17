import React, { useState } from 'react';
import Sidebar from './components/Sidebar.js';
import DashboardView from './views/DashboardView.js';
import TransactionsView from './views/TransactionsView.js';
import ImportView from './views/ImportView.js';
import CategoriesView from './views/CategoriesView.js';
import SettingsView from './views/SettingsView.js';

export type NavItem = 'dashboard' | 'transactions' | 'import' | 'categories' | 'settings';

function App() {
  const [activeView, setActiveView] = useState<NavItem>('dashboard');

  function renderView() {
    switch (activeView) {
      case 'dashboard':
        return <DashboardView />;
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
