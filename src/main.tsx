import { createRoot } from 'react-dom/client';
import './styles/base.css';
import './styles/app.css';
import { App } from './App';
import { applyTheme } from './lib/theme';

applyTheme();
if (/Electron/.test(navigator.userAgent)) document.documentElement.classList.add('mac-app');
createRoot(document.getElementById('root')!).render(<App />);

// Earlier builds installed an offline service worker: remove it so updates always show up.
try {
  navigator.serviceWorker?.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
} catch {
  /* sandboxed frames refuse service workers */
}
