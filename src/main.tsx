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

  // Layer 2 — intercept horizontal edge-swipes at the touch level.
  //
  // Two-phase approach:
  //   a) touchstart (non-passive) fires BEFORE iOS gesture recognition and
  //      calls preventDefault() for touches that start in the left-edge zone
  //      below the header.  This is the earliest possible interception point.
  //   b) touchmove (non-passive) continues blocking for the duration of the
  //      gesture and also catches wider-zone starts that slipped through (a).
  //
  // Header height ~80px (safe-area + 48px header) — touches above that line
  // reach the hamburger button and must NOT be prevented.
  // Content has px-4 (16 px) padding, so nothing interactive exists in the
  // leftmost 16 px below the header; 50 px zone is safe.

  const EDGE_WIDTH  = 50;  // px from left edge considered back-gesture zone

  let _startX        = 0;
  let _startY        = 0;
  let _blockingHoriz = false;

  window.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    _startX = t.clientX;
    _startY = t.clientY;
    _blockingHoriz = false;

    // Never block touches on interactive chrome — the header (hamburger) and
    // the bottom nav (Start icon is within the 50 px edge zone on narrow phones).
    // preventDefault() on touchstart suppresses the synthetic click, so we must
    // exempt any element that the user might want to tap.
    const headerEl = document.querySelector('header');
    if (headerEl?.contains(e.target as Node)) return;
    const bottomNavEl = document.querySelector('nav');
    if (bottomNavEl?.contains(e.target as Node)) return;

    // Immediately claim touches in the left-edge zone so iOS cannot start the
    // system back-swipe animation.  The AppLayout drawer gesture handler still
    // receives touchmove / touchend and can drive the NavDrawer panel.
    if (t.clientX < EDGE_WIDTH) {
      _blockingHoriz = true;
      e.preventDefault();
    }
  }, { passive: false }); // non-passive so we can call preventDefault

  window.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - _startX;
    const dy = e.touches[0].clientY - _startY;

    if (!_blockingHoriz) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      // Wider zone for move-phase detection (gesture may have started just
      // outside the touchstart zone but is clearly a left-edge right-swipe)
      _blockingHoriz = Math.abs(dx) > Math.abs(dy) && _startX < EDGE_WIDTH && dx > 0;
    }

    if (_blockingHoriz) {
      e.preventDefault();
    }
  }, { passive: false });
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
