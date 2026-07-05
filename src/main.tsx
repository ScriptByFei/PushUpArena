import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import './index.css';
import { initOneSignal } from '@/lib/onesignal';

void initOneSignal();

// Früh registrieren — bevor React mounted — damit kein SW-Update verpasst wird
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  window.location.reload();
});
// Sofort auf Updates prüfen wenn App lädt
navigator.serviceWorker?.getRegistration().then((reg) => reg?.update()).catch(() => {});

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
