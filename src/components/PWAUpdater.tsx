import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

// Vollautomatische Updates: prüft beim Start, stündlich und beim Fokus-Wechsel
// auf neue Versionen. Mit registerType 'autoUpdate' wird eine gefundene Version
// automatisch aktiviert und die App neu geladen – ohne Zutun.
const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000; // stündlich

export function PWAUpdater() {
  const { updateServiceWorker } = useRegisterSW({
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
        updateServiceWorker(false);
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [updateServiceWorker]);

  return null;
}
