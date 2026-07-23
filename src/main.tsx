import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import './index.css';
import { initOneSignal } from '@/lib/onesignal';

void initOneSignal();

// ── iOS PWA back-swipe guard ──────────────────────────────────────────────────
// All in-app navigation uses { replace: true } so the browser history stack
// never grows. This popstate handler is a safety net: if the iOS system
// left-edge back gesture fires and pops a history entry, we immediately push
// the current URL back so neither the browser nor React Router navigates away.
// Registered BEFORE ReactDOM.createRoot so our capture-phase listener fires
// before React Router's bubble-phase listener; React Router then sees no URL
// change and does nothing.
(function blockIOSBackSwipe() {
  window.history.pushState(null, '', window.location.href);
  window.addEventListener(
    'popstate',
    () => { window.history.pushState(null, '', window.location.href); },
    true, // capture phase → fires before React Router's listener
  );
})();

// Früh registrieren — bevor React mounted — damit kein SW-Update verpasst wird.
// Wenn ein neuer Service Worker aktiviert wird (controllerchange), hart neu laden
// damit sofort die neuen Assets vom frisch aktivierten SW ausgeliefert werden.
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  window.location.href = window.location.href;
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
