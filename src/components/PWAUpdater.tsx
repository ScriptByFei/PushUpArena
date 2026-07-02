import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const UPDATE_CHECK_INTERVAL = 5 * 60 * 1000; // alle 5 Minuten

export function PWAUpdater() {
  useRegisterSW({
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

  return null;
}
