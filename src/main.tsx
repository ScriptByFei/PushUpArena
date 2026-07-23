import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import './index.css';
import { initOneSignal } from '@/lib/onesignal';

void initOneSignal();

// ── iOS PWA horizontal-swipe / back-swipe guard ──────────────────────────────
// Layer 1 — popstate guard:
//   All in-app navigation uses { replace: true } so the history stack never
//   grows.  If the iOS system left-edge back gesture fires anyway, the capture-
//   phase listener pushes the current URL back before React Router sees the
//   popstate, so React Router never navigates away.
// Layer 2 — touchmove preventDefault:
//   Even without history to go back to, iOS may start the back-swipe animation
//   before JS gets a chance to respond.  A non-passive touchmove listener that
//   calls preventDefault() for horizontal swipes starting on the left edge tells
//   iOS to cancel the gesture before the animation begins.
(function blockIOSBackSwipe() {
  // Layer 1
  window.history.pushState(null, '', window.location.href);
  window.addEventListener(
    'popstate',
    () => { window.history.pushState(null, '', window.location.href); },
    true, // capture phase → fires before React Router's bubble-phase listener
  );

  // Layer 2 — intercept horizontal edge-swipes at the touch level
  let _startX = 0;
  let _startY = 0;
  let _blockingHoriz = false;

  window.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    _startX = t.clientX;
    _startY = t.clientY;
    _blockingHoriz = false;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - _startX;
    const dy = e.touches[0].clientY - _startY;

    if (!_blockingHoriz) {
      // Only decide once per gesture — when the finger has moved enough
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      _blockingHoriz = Math.abs(dx) > Math.abs(dy) && _startX < 30 && dx > 0;
    }

    if (_blockingHoriz) {
      // Horizontal right-swipe from left edge → block iOS back animation
      e.preventDefault();
    }
  }, { passive: false }); // must be non-passive to call preventDefault
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
