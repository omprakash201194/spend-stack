import React from 'react';

const SUMMARY_CARDS = [
  { label: 'Total Transactions', value: '—', note: 'Import a statement to begin' },
  { label: 'This Month Spending', value: '—', note: 'No data yet' },
  { label: 'Categories Tagged', value: '—', note: 'No data yet' },
  { label: 'Pending Review', value: '—', note: 'No data yet' },
];

function DashboardView() {
  return (
    <div className="view">
      <header className="view-header">
        <h2 className="view-title">Dashboard</h2>
        <p className="view-subtitle">Your financial overview at a glance</p>
      </header>

      <section className="summary-grid">
        {SUMMARY_CARDS.map((card) => (
          <div key={card.label} className="summary-card">
            <span className="summary-value">{card.value}</span>
            <span className="summary-label">{card.label}</span>
            <span className="summary-note">{card.note}</span>
          </div>
        ))}
      </section>

      <section className="empty-state">
        <p className="empty-state-icon">📂</p>
        <h3>No statements imported yet</h3>
        <p>
          Go to <strong>Import</strong> to upload a bank statement and start tracking your
          finances.
        </p>
      </section>
    </div>
  );
}

export default DashboardView;
