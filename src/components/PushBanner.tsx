/**
 * PushBanner – erscheint bei jedem App-Start wenn Push noch nicht aktiviert.
 * Blendet sich nach 5 Sekunden automatisch aus (oder bei Klick auf X / Aktivieren).
 * Wird nicht angezeigt wenn der User Push bewusst über die Glocke deaktiviert hat.
 */
import { useEffect, useRef, useState } from 'react';
import { requestPushPermission, PUSH_USER_DISABLED_KEY } from '@/lib/pushNotifications';

const AUTO_DISMISS_MS = 5000;
const SHOW_DELAY_MS = 800;

const pushSupported =
  typeof window !== 'undefined' &&
  'Notification' in window &&
  'serviceWorker' in navigator &&
  'PushManager' in window;

export function PushBanner() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!pushSupported) return;
    // Nur zeigen wenn noch nie aktiviert (nicht 'granted' und nicht 'denied')
    if (Notification.permission !== 'default') return;
    // Nicht zeigen wenn User Push bewusst über Glocke abgelehnt hat
    if (localStorage.getItem(PUSH_USER_DISABLED_KEY)) return;

    const showTimer = setTimeout(() => {
      setVisible(true);
      // Auto-dismiss nach 5 Sekunden
      autoDismissRef.current = setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    }, SHOW_DELAY_MS);

    return () => {
      clearTimeout(showTimer);
      if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
    };
  }, []);

  function dismiss() {
    if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
    setVisible(false);
  }

  async function onEnable() {
    if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
    setBusy(true);
    try {
      await requestPushPermission();
    } catch (_) {
      // ignorieren
    } finally {
      localStorage.setItem('push-prompted', '1');
      setBusy(false);
      setVisible(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="mx-4 mb-0 mt-0 flex items-center gap-3 rounded-2xl border border-brand-500/30 bg-brand-500/10 px-4 py-3">
      <span className="text-xl shrink-0">🔔</span>
      <p className="flex-1 text-sm text-slate-300">
        <span className="font-semibold text-slate-100">Push aktivieren</span> — erhalte Benachrichtigungen zu Freunden &amp; Meilensteinen.
      </p>
      <button
        onClick={onEnable}
        disabled={busy}
        className="shrink-0 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
      >
        {busy ? '…' : 'Aktivieren'}
      </button>
      <button
        onClick={dismiss}
        aria-label="Schließen"
        className="shrink-0 text-slate-500 hover:text-slate-300 transition"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"/>
        </svg>
      </button>
    </div>
  );
}
