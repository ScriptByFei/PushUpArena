import { useEffect, useRef } from 'react';

// __BUILD_VERSION__ wird von vite.config.ts zur Build-Zeit eingebettet.
// Entspricht dem `v`-Wert aus public/version.json dieses Builds.
declare const __BUILD_VERSION__: string;
const BUNDLE_VERSION = __BUILD_VERSION__;

const VERSION_CHECK_INTERVAL = 30 * 1000; // alle 30 Sekunden

/** iOS-sichere Navigation: erzwingt echten Request durch den SW (kein BF-Cache). */
function hardNavigate() {
  window.location.href = window.location.href;
}

/** Nuclear-Option: alle SWs deregistrieren, dann neu laden. */
async function nukeAndReload() {
  const regs = await navigator.serviceWorker?.getRegistrations().catch(() => [] as ServiceWorkerRegistration[]);
  for (const reg of regs ?? []) {
    await reg.unregister().catch(() => {});
  }
  hardNavigate();
}

export function PWAUpdater() {
  // Verhindert Reload-Schleifen innerhalb einer Session.
  const hasInitiatedReload = useRef(false);

  // SW-Update-Prüfung alle 5 Minuten + bei Rückkehr zur App.
  // Der controllerchange-Listener in main.tsx triggert den Reload wenn neuer SW aktiv ist.
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

  // Version-Check: vergleicht eingebettete Bundle-Version mit aktueller Server-Version.
  // Mismatch = App ist veraltet → SW-Update + Reload.
  useEffect(() => {
    async function checkVersion() {
      try {
        const res = await fetch('/version.json', { cache: 'no-store' });
        if (!res.ok) return;
        const { v } = (await res.json()) as { v: number | string };

        if (String(v) === String(BUNDLE_VERSION)) return; // aktuell

        if (hasInitiatedReload.current) return; // kein Loop
        hasInitiatedReload.current = true;

        // Stufe 1: SW-Update → controllerchange → hardNavigate (in main.tsx)
        const reg = await navigator.serviceWorker?.getRegistration();
        await reg?.update().catch(() => {});

        // Stufe 2: Falls nach 4s kein controllerchange → direkt navigieren
        setTimeout(hardNavigate, 4000);

        // Stufe 3: Falls nach 10s immer noch alte Version → Nuclear-Option
        setTimeout(nukeAndReload, 10000);
      } catch {
        // Offline — ignorieren
      }
    }

    void checkVersion();
    const interval = setInterval(checkVersion, VERSION_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  return null;
}
