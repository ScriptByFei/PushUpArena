// Zentrale Logik, ob das PWA-Installations-Gate für Browser-Tests übersprungen
// werden darf. Betrifft AUSSCHLIESSLICH das Install-Gate (InstallHint.tsx) —
// Auth/Session/RLS/Rollen sind davon vollständig unberührt.

const PRODUCTION_HOSTNAME = 'push-up-arena-alpha.vercel.app';
const SESSION_KEY = 'pua_preview_bypass';

function isLocalhost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost');
}

function isProductionHost(hostname: string): boolean {
  return hostname === PRODUCTION_HOSTNAME;
}

/** True, wenn das PWA-Installations-Gate für diese Session übersprungen werden darf. */
export function shouldBypassPwaInstallGate(): boolean {
  // Vite ersetzt import.meta.env.DEV zur Build-Zeit; im Production-Build ist dieser Zweig tot.
  if (import.meta.env.DEV) return true;

  const { hostname, search } = window.location;

  if (isProductionHost(hostname)) return false;

  if (isLocalhost(hostname)) return true;

  const previewRequested = new URLSearchParams(search).get('preview') === '1';
  if (previewRequested) {
    sessionStorage.setItem(SESSION_KEY, '1');
    return true;
  }

  // Für die Dauer der Browser-Session merken, damit ?preview=1 bei
  // Client-seitiger Navigation nicht verloren geht.
  return sessionStorage.getItem(SESSION_KEY) === '1';
}
