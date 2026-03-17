import React from 'react';
import type { NavItem } from '../App.js';

interface SidebarProps {
  activeView: NavItem;
  onNavigate: (view: NavItem) => void;
}

interface NavEntry {
  id: NavItem;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavEntry[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '▦' },
  { id: 'transactions', label: 'Transactions', icon: '⇄' },
  { id: 'import', label: 'Import', icon: '↑' },
  { id: 'categories', label: 'Categories', icon: '⊞' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

function Sidebar({ activeView, onNavigate }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-logo">$</span>
        <span className="sidebar-title">SpendStack</span>
      </div>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`sidebar-nav-item${activeView === item.id ? ' active' : ''}`}
            onClick={() => onNavigate(item.id)}
            aria-current={activeView === item.id ? 'page' : undefined}
            aria-label={item.label}
          >
            <span className="nav-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <span className="sidebar-tagline">Local-first personal finance</span>
      </div>
    </aside>
  );
}

export default Sidebar;
