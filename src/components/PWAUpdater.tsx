import { useEffect, useRef } from 'react';

const VERSION_CHECK_INTERVAL = 30 * 1000; // alle 30 Sekunden

export function PWAUpdater() {
  const deployedVersion = useRef<number | null>(null);

  // Wenn neuer SW die Kontrolle übernimmt → sofort hart neu laden
  useEffect(() => {
    function onControllerChange() {
      window.location.reload();
    }
    navigator.serviceWorker?.addEventListener('controllerchange', onControllerChange);
    return () => navigator.serviceWorker?.removeEventListener('controllerchange', onControllerChange);
  }, []);

  // SW-Update-Prüfung alle 5 Minuten + bei Rückkehr zur App
  useEffect(() => {
    function triggerUpdate() {
      navigator.serviceWorker?.getRegistration().then((reg) => reg?.update()).catch(() => {});
    }
    function onVisibility() {
      if (document.visibilityState === 'visible') triggerUpdate();
    }
    document.addEventListener('visibilitychange', onVisibility);
    const interval = setInterval(triggerUpdate, 5 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(interval);
    };
  }, []);

  // Version-Check: /version.json alle 30s abrufen.
  // Geht direkt ans Netzwerk (JSON nicht im SW-Precache) →
  // erzwingt Reload wenn neues Deploy erkannt wird.
  useEffect(() => {
    async function checkVersion() {
      try {
        const res = await fetch('/version.json', { cache: 'no-store' });
        if (!res.ok) return;
        const { v } = (await res.json()) as { v: number };
        if (deployedVersion.current === null) {
          deployedVersion.current = v;
        } else if (deployedVersion.current !== v) {
          window.location.reload();
        }
      } catch {
        // offline — ignorieren
      }
    }
    void checkVersion();
    const interval = setInterval(checkVersion, VERSION_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  return null;
}
