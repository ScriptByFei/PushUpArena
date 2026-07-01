import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const UPDATE_CHECK_INTERVAL = 5 * 60 * 1000; // alle 5 Minuten

export function PWAUpdater() {
  const [needsUpdate, setNeedsUpdate] = useState(false);

  const { updateServiceWorker } = useRegisterSW({
    onNeedRefresh() {
      setNeedsUpdate(true);
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      registration.update().catch(() => {});
      setInterval(() => registration.update().catch(() => {}), UPDATE_CHECK_INTERVAL);
    },
  });

  // Beim Zurückwechseln zur App sofort auf Updates prüfen.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        navigator.serviceWorker?.getRegistration().then((reg) => reg?.update()).catch(() => {});
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  if (!needsUpdate) return null;

  return (
    <div className="fixed bottom-24 inset-x-4 z-50 flex items-center justify-between gap-3 rounded-2xl border border-brand-500/40 bg-ink-800 px-4 py-3 shadow-glow">
      <p className="text-sm text-slate-200">🆕 Neue Version verfügbar</p>
      <button
        onClick={() => updateServiceWorker(true)}
        className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-500"
      >
        Aktualisieren
      </button>
    </div>
  );
}
