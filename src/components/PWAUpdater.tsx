import { useRegisterSW } from 'virtual:pwa-register/react';

// Vollautomatische Updates: registriert den Service Worker, prüft beim Start und
// danach stündlich auf neue Versionen. Mit registerType 'autoUpdate' wird eine
// gefundene Version automatisch aktiviert und die App neu geladen – ohne Zutun.
const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000; // stündlich

export function PWAUpdater() {
  useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      registration.update().catch(() => {});
      setInterval(() => registration.update().catch(() => {}), UPDATE_CHECK_INTERVAL);
    },
  });

  return null;
}
