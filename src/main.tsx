import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  let reloaded = false;
  try { reloaded = sessionStorage.getItem('rid_chunk_reload') === '1'; } catch {}
  if (!reloaded) {
    try { sessionStorage.setItem('rid_chunk_reload', '1'); } catch {}
    window.location.reload();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

setTimeout(() => {
  try {
    sessionStorage.removeItem('rid_chunk_reload');
  } catch {}
}, 10000);
