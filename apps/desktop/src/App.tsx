import React, { useState, useEffect } from 'react';

function App() {
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    const api = (window as Window & typeof globalThis & { electronAPI?: { onMainProcessMessage: (cb: (msg: string) => void) => void } }).electronAPI;
    api?.onMainProcessMessage((msg) => setMessage(msg));
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>SpendStack</h1>
        <p>Local-first personal finance</p>
        {message && <p className="ipc-message">Ready at {message}</p>}
      </header>
    </div>
  );
}

export default App;
