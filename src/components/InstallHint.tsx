import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

// Diese Pfade bleiben im Browser zugänglich (E-Mail-Links, Rechtliches)
const BROWSER_ALLOWED = ['/auth/confirm', '/reset-password', '/forgot-password', '/privacy', '/imprint'];

function isStandalone(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  if ((window.navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  return false;
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

// Context so other components (e.g. Login) know when the overlay is blocking
const InstallHintContext = createContext(false);
export function useInstallHintActive() { return useContext(InstallHintContext); }

export function InstallHintProvider({ children }: { children: ReactNode }) {
  const [standalone, setStandalone] = useState(true); // optimistic: avoid flash
  const { pathname } = useLocation();

  useEffect(() => {
    setStandalone(isStandalone());
  }, []);

  const isAllowedInBrowser = BROWSER_ALLOWED.some((p) => pathname.startsWith(p));
  const active = !standalone && !isAllowedInBrowser;

  const ios = isIOS();

  return (
    <InstallHintContext.Provider value={active}>
      {children}
      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-5 bg-ink-950/95 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-ink-600 bg-ink-800 shadow-2xl overflow-hidden">
            <div className="bg-brand-500/10 border-b border-ink-600 px-6 pt-6 pb-5 text-center">
              <img src="/icons/icon-192.png" alt="PushUpArena" className="mx-auto mb-3 h-16 w-16 rounded-2xl shadow-lg" />
              <h2 className="text-lg font-bold text-slate-100">App installieren</h2>
              <p className="mt-1 text-sm text-slate-400">
                PushupArena ist nur als installierte App verfügbar.
              </p>
            </div>
            <div className="px-6 py-5">
              {ios ? (
                <ol className="space-y-3 text-sm text-slate-300">
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-xs font-bold text-brand-400">1</span>
                    <span>Tippe auf das <span className="font-semibold text-slate-100">Teilen-Symbol</span> <span className="text-slate-400">↑</span> in der Safari-Leiste unten</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-xs font-bold text-brand-400">2</span>
                    <span>Wähle <span className="font-semibold text-slate-100">„Zum Home-Bildschirm"</span></span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-xs font-bold text-brand-400">3</span>
                    <span>Tippe oben rechts auf <span className="font-semibold text-slate-100">„Hinzufügen"</span></span>
                  </li>
                </ol>
              ) : (
                <ol className="space-y-3 text-sm text-slate-300">
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-xs font-bold text-brand-400">1</span>
                    <span>Tippe auf <span className="font-semibold text-slate-100">⋮</span> oben rechts im Browser</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-xs font-bold text-brand-400">2</span>
                    <span>Wähle <span className="font-semibold text-slate-100">„App installieren"</span> oder „Zum Startbildschirm"</span>
                  </li>
                </ol>
              )}
            </div>
          </div>
        </div>
      )}
    </InstallHintContext.Provider>
  );
}
