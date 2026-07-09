/**
 * PushPrompt – einmaliges Modal für bestehende User die Push noch nie aktiviert haben.
 * Neue User bekommen diesen Schritt bereits im OnboardingFlow.
 * Erscheint beim ersten Login nach dem Deploy, nie wieder danach (localStorage).
 */
import { useEffect, useState } from 'react';
import { requestPushPermission } from '@/lib/pushNotifications';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';

const STORAGE_KEY = 'push-prompted';

const pushSupported =
  typeof window !== 'undefined' &&
  'Notification' in window &&
  'serviceWorker' in navigator &&
  'PushManager' in window;

export function PushPrompt() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (!pushSupported) return;
    if (Notification.permission !== 'default') return;
    if (localStorage.getItem(STORAGE_KEY)) return;

    // Kurze Verzögerung damit andere Modals (OnboardingFlow) Vorrang haben
    const t = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(t);
  }, [user]);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  }

  async function onEnable() {
    setBusy(true);
    localStorage.setItem(STORAGE_KEY, '1');
    try {
      await requestPushPermission();
    } catch (_) {
      // Browser-Dialog abgelehnt — kein Fehler zeigen
    } finally {
      setBusy(false);
      setVisible(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md animate-pop-in rounded-t-3xl border-t border-ink-700 bg-ink-900 px-6 pb-10 pt-6">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-ink-600" />

        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/20 text-3xl">
          🔔
        </div>
        <p className="text-lg font-extrabold text-slate-100">Benachrichtigungen aktivieren</p>
        <p className="mt-1 text-sm text-slate-400">
          Erhalte eine Nachricht wenn jemand eine Freundschaftsanfrage sendet
          oder annimmt, und wenn Meilensteine erreicht werden.
        </p>

        <div className="mt-6 space-y-3">
          <Button fullWidth size="lg" loading={busy} onClick={onEnable}>
            Jetzt aktivieren
          </Button>
          <button
            onClick={dismiss}
            className="w-full text-center text-sm text-slate-500 hover:text-slate-400 transition-colors"
          >
            Nein danke
          </button>
        </div>
      </div>
    </div>
  );
}
