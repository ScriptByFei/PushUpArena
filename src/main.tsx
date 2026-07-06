import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import './index.css';
import { initOneSignal } from '@/lib/onesignal';

void initOneSignal();

// Früh registrieren — bevor React mounted — damit kein SW-Update verpasst wird.
// Wenn ein neuer Service Worker aktiviert wird (controllerchange), hart neu laden
// damit sofort die neuen Assets vom frisch aktivierten SW ausgeliefert werden.
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  window.location.reload();
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
