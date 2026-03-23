import React, { useState } from 'react';

const SETTINGS_SECTIONS = [
  { title: 'Profile', description: 'Manage your user profile and authentication settings.' },
  { title: 'Workspace', description: 'Configure family workspace sharing and privacy rules.' },
  { title: 'Data & Privacy', description: 'Control data retention, exports, and privacy options.' },
  { title: 'AI Insights', description: 'Enable optional AI-powered spending insights.' },
];

function SettingsView() {
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'success' | 'failed' | 'canceled'>('idle');
  const [exportPath, setExportPath] = useState<string | undefined>(undefined);
  const [exportError, setExportError] = useState<string | undefined>(undefined);

  async function handleExportDiagnostics() {
    setExportStatus('exporting');
    setExportPath(undefined);
    setExportError(undefined);

    const result = await window.electronAPI?.exportDiagnostics();
    if (!result) {
      setExportStatus('failed');
      setExportError('Electron API unavailable.');
      return;
    }
    if (result.canceled) {
      setExportStatus('canceled');
    } else if (result.success) {
      setExportStatus('success');
      setExportPath(result.filePath);
    } else {
      setExportStatus('failed');
      setExportError(result.error ?? 'Unknown error.');
    }
  }

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

      <section className="settings-diagnostics">
        <h3 className="settings-section-title">Diagnostics</h3>
        <p className="settings-section-desc">
          Export a diagnostics bundle for troubleshooting. The bundle includes app version,
          platform info, and feature flag state — no raw secrets or personal data.
        </p>
        <button
          className="btn-export-diagnostics"
          disabled={exportStatus === 'exporting'}
          onClick={() => { void handleExportDiagnostics(); }}
        >
          {exportStatus === 'exporting' ? 'Exporting…' : 'Export Diagnostics Bundle'}
        </button>
        {exportStatus === 'success' && (
          <p className="diagnostics-status diagnostics-status--success">
            Bundle saved to: {exportPath}
          </p>
        )}
        {exportStatus === 'canceled' && (
          <p className="diagnostics-status diagnostics-status--canceled">Export canceled.</p>
        )}
        {exportStatus === 'failed' && (
          <p className="diagnostics-status diagnostics-status--error">
            Export failed: {exportError}
          </p>
        )}
      </section>
    </div>
  );
}

export default SettingsView;
