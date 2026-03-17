import React from 'react';

const SUPPORTED_BANKS = ['ICICI Bank', 'Bank of Baroda', 'Kotak Bank'];
const SUPPORTED_FORMATS = ['PDF', 'CSV', 'XLSX'];

function ImportView() {
  return (
    <div className="view">
      <header className="view-header">
        <h2 className="view-title">Import Statement</h2>
        <p className="view-subtitle">Upload a bank statement to import your transactions</p>
      </header>

      <div className="import-drop-zone">
        <p className="empty-state-icon">⬆</p>
        <h3>Drop your statement here</h3>
        <p>or click to browse</p>
        <p className="import-hint">
          Supported formats: {SUPPORTED_FORMATS.join(', ')}
        </p>
      </div>

      <section className="import-banks">
        <h4 className="section-title">Supported Banks</h4>
        <ul className="bank-list">
          {SUPPORTED_BANKS.map((bank) => (
            <li key={bank} className="bank-item">
              {bank}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default ImportView;
