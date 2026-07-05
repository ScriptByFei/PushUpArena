import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const UPDATE_CHECK_INTERVAL = 5 * 60 * 1000; // SW-Prüfung alle 5 Minuten
const VERSION_CHECK_INTERVAL = 30 * 1000;    // Version-Prüfung alle 30 Sekunden

export function PWAUpdater() {
  const deployedVersion = useRef<number | null>(null);

  const { updateServiceWorker } = useRegisterSW({
    onNeedRefresh() {
      updateServiceWorker(true);
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      registration.update().catch(() => {});
      setInterval(() => registration.update().catch(() => {}), UPDATE_CHECK_INTERVAL);
    },
  });

  // Wenn neuer SW die Kontrolle übernimmt → sofort neu laden
  useEffect(() => {
    function handleControllerChange() {
      window.location.reload();
    }
    navigator.serviceWorker?.addEventListener('controllerchange', handleControllerChange);
    return () => navigator.serviceWorker?.removeEventListener('controllerchange', handleControllerChange);
  }, []);

  // Beim Zurückwechseln zur App SW-Update prüfen
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        navigator.serviceWorker?.getRegistration().then((reg) => reg?.update()).catch(() => {});
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Versions-Check: /version.json alle 30s abrufen.
  // Geht am SW-Cache vorbei (JSON nicht precached) und erzwingt
  // einen harten Reload wenn ein neues Deploy erkannt wird.
  useEffect(() => {
    async function checkVersion() {
      try {
        const res = await fetch('/version.json', { cache: 'no-store' });
        if (!res.ok) return;
        const { v } = await res.json() as { v: number };
        if (deployedVersion.current === null) {
          deployedVersion.current = v;
        } else if (deployedVersion.current !== v) {
          // Neue Version erkannt → hart neu laden
          window.location.reload();
        }
      } catch {
        // Offline oder Netzwerkfehler — ignorieren
      }
    }

    void checkVersion();
    const interval = setInterval(checkVersion, VERSION_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  return null;
}
