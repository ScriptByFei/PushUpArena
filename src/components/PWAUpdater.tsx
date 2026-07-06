import { useEffect, useRef } from 'react';

// __BUILD_VERSION__ wird von vite.config.ts zur Build-Zeit eingebettet.
// Entspricht dem `v`-Wert aus public/version.json dieses Builds.
declare const __BUILD_VERSION__: string;
const BUNDLE_VERSION = __BUILD_VERSION__;

const VERSION_CHECK_INTERVAL = 30 * 1000; // alle 30 Sekunden

export function PWAUpdater() {
  // Verhindert Reload-Schleifen: nach einem initiierten Reload nicht nochmal auslösen.
  const hasInitiatedReload = useRef(false);

  // SW-Update-Prüfung alle 5 Minuten + bei Rückkehr zur App (visibility change).
  // Der controllerchange-Listener in main.tsx löst den Reload aus sobald der neue SW aktiv ist.
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

  // Version-Check: vergleicht die im Bundle eingebettete Build-Version mit der
  // aktuellen Server-Version aus /version.json.
  //
  // WARUM: Der alte Code speicherte beim ersten Laden die Server-Version als "bekannt"
  // und erkannte nur Änderungen WÄHREND einer Session. Wenn die App seit Tagen nicht
  // geöffnet wurde (alter Bundle, neue Server-Version), gab es keinen erkannten Mismatch.
  //
  // JETZT: Wir vergleichen "meine Build-Version" vs. "aktuelle Server-Version".
  // Jeder Mismatch = App läuft mit veralteten Assets → SW-Update triggern + Reload.
  useEffect(() => {
    async function checkVersion() {
      try {
        const res = await fetch('/version.json', { cache: 'no-store' });
        if (!res.ok) return;
        const { v } = (await res.json()) as { v: number | string };

        if (String(v) === String(BUNDLE_VERSION)) {
          // App ist aktuell.
          return;
        }

        // App ist veraltet — aber nur EINMAL pro Session initiieren,
        // um Reload-Schleifen zu vermeiden falls der neue SW nicht lädt.
        if (hasInitiatedReload.current) return;
        hasInitiatedReload.current = true;

        // Erst SW-Update triggern: der controllerchange-Listener in main.tsx
        // löst nach ~1-3s automatisch window.location.reload() aus.
        const reg = await navigator.serviceWorker?.getRegistration();
        await reg?.update().catch(() => {});

        // Fallback: falls controllerchange nach 5s nicht ausgelöst hat (z.B. kein SW),
        // direkt neu laden.
        setTimeout(() => {
          window.location.reload();
        }, 5000);
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
