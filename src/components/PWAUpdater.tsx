import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const UPDATE_CHECK_INTERVAL = 5 * 60 * 1000; // alle 5 Minuten

export function PWAUpdater() {
  const { updateServiceWorker } = useRegisterSW({
    onNeedRefresh() {
      // Sofort automatisch neu laden — kein manuelles Banner nötig.
      updateServiceWorker(true);
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      registration.update().catch(() => {});
      setInterval(() => registration.update().catch(() => {}), UPDATE_CHECK_INTERVAL);
    },
  });

  // Wenn der neue SW die Kontrolle übernimmt → Seite sofort neu laden.
  // Wichtig für iOS PWA, wo controllerchange nicht immer automatisch
  // durch workbox-window abgefangen wird.
  useEffect(() => {
    function handleControllerChange() {
      window.location.reload();
    }
    navigator.serviceWorker?.addEventListener('controllerchange', handleControllerChange);
    return () => navigator.serviceWorker?.removeEventListener('controllerchange', handleControllerChange);
  }, []);

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
