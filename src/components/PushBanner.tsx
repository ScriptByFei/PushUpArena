/**
 * PushBanner – schmaler, dauerhaft wegklickbarer Banner für User
 * die Push noch nicht aktiviert haben (Permission = 'default').
 * Erscheint auf allen geschützten Seiten, bis der User aktiviert
 * oder dauerhaft schließt.
 */
import { useEffect, useState } from 'react';
import { requestPushPermission } from '@/lib/pushNotifications';

const DISMISSED_KEY = 'push-banner-dismissed';

const pushSupported =
  typeof window !== 'undefined' &&
  'Notification' in window &&
  'serviceWorker' in navigator &&
  'PushManager' in window;

export function PushBanner() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported) return;
    if (Notification.permission !== 'default') return;
    if (localStorage.getItem(DISMISSED_KEY)) return;
    // Kurze Verzögerung damit die Seite zuerst lädt
    const t = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  }

  async function onEnable() {
    setBusy(true);
    try {
      await requestPushPermission();
    } catch (_) {
      // ignorieren
    } finally {
      localStorage.setItem(DISMISSED_KEY, '1');
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
