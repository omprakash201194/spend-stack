import React from 'react';

const SETTINGS_SECTIONS = [
  { title: 'Profile', description: 'Manage your user profile and authentication settings.' },
  { title: 'Workspace', description: 'Configure family workspace sharing and privacy rules.' },
  { title: 'Data & Privacy', description: 'Control data retention, exports, and privacy options.' },
  { title: 'AI Insights', description: 'Enable optional AI-powered spending insights.' },
];

function SettingsView() {
  return (
    <div className="view">
      <header className="view-header">
        <h2 className="view-title">Settings</h2>
        <p className="view-subtitle">Configure SpendStack to suit your needs</p>
      </header>

      <ul className="settings-list">
        {SETTINGS_SECTIONS.map((section) => (
          <li key={section.title} className="settings-item">
            <span className="settings-item-title">{section.title}</span>
            <span className="settings-item-desc">{section.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default SettingsView;
