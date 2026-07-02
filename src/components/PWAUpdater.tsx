import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const UPDATE_CHECK_INTERVAL = 60 * 1000; // jede Minute prüfen

export function PWAUpdater() {
  const { updateServiceWorker } = useRegisterSW({
    onNeedRefresh() {
      // Neue Version verfügbar → sofort anwenden und Seite neu laden
      void updateServiceWorker(true);
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // Regelmäßig auf Updates prüfen
      setInterval(() => registration.update().catch(() => {}), UPDATE_CHECK_INTERVAL);
    },
  });

  // Beim Zurückwechseln zur App sofort prüfen
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') {
        navigator.serviceWorker?.getRegistration().then((reg) => reg?.update()).catch(() => {});
      }
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  return null;
}
