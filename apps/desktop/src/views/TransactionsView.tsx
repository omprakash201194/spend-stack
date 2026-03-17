import React from 'react';

function TransactionsView() {
  return (
    <div className="view">
      <header className="view-header">
        <h2 className="view-title">Transactions</h2>
        <p className="view-subtitle">Browse and manage your imported transactions</p>
      </header>

      <div className="empty-state">
        <p className="empty-state-icon">💳</p>
        <h3>No transactions yet</h3>
        <p>Import a bank statement to see your transactions here.</p>
      </div>
    </div>
  );
}

export default TransactionsView;
