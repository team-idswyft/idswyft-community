import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

document.body.style.backgroundColor = '#080c14';
document.body.style.margin = '0';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
