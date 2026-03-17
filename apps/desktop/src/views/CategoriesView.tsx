import React from 'react';

function CategoriesView() {
  return (
    <div className="view">
      <header className="view-header">
        <h2 className="view-title">Categories</h2>
        <p className="view-subtitle">Manage spending categories and auto-categorization rules</p>
      </header>

      <div className="empty-state">
        <p className="empty-state-icon">🏷</p>
        <h3>No categories yet</h3>
        <p>Categories will appear here once you import transactions.</p>
      </div>
    </div>
  );
}

export default CategoriesView;
