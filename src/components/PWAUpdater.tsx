import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from './ui/Button';
import { XIcon } from './ui/icons';

// Zeigt ein Banner, sobald eine neue Version bereitsteht. "Aktualisieren" aktiviert
// den wartenden Service Worker und lädt die App neu – kein Neu-Installieren nötig.
const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000; // stündlich

export function PWAUpdater() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // Direkt beim Start und danach regelmäßig nach Updates suchen.
      registration.update().catch(() => {});
      setInterval(() => registration.update().catch(() => {}), UPDATE_CHECK_INTERVAL);
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[60] flex justify-center px-3"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
    >
      <div className="flex w-full max-w-sm animate-pop-in items-center gap-3 rounded-xl border border-brand-500/50 bg-ink-800 px-4 py-3 shadow-glow">
        <span className="flex-1 text-sm font-medium text-slate-100">
          Neue Version verfügbar
        </span>
        <Button size="sm" onClick={() => updateServiceWorker(true)}>
          Aktualisieren
        </Button>
        <button
          onClick={() => setNeedRefresh(false)}
          aria-label="Später"
          className="rounded-lg p-1 text-slate-400 hover:text-slate-200"
        >
          <XIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
