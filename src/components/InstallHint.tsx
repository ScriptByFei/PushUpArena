import { useEffect, useState } from 'react';

const STORAGE_KEY = 'pwa-install-hint-dismissed';

function isStandalone(): boolean {
  // Standard display-mode check (Android/Chrome/Edge)
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // iOS Safari
  if ((window.navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  return false;
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Never show in standalone/PWA mode
    if (isStandalone()) return;
    // Don't show if already dismissed
    if (localStorage.getItem(STORAGE_KEY) === '1') return;
    setVisible(true);
  }, []);

  if (!visible) return null;

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  }

  const ios = isIOS();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-md rounded-2xl border border-ink-600 bg-ink-800/95 p-4 shadow-2xl backdrop-blur-md">
        <div className="flex items-start gap-3">
          <img src="/icons/icon-192.png" alt="PushUpArena" className="h-10 w-10 flex-shrink-0 rounded-xl" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-100">PushUpArena installieren</p>
            {ios ? (
              <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                Tippe auf das <span className="text-brand-400 font-medium">Teilen-Symbol</span> unten → <span className="text-brand-400 font-medium">„Zum Home-Bildschirm"</span> → „Hinzufügen"
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                Tippe auf <span className="text-brand-400 font-medium">⋮</span> oben rechts → <span className="text-brand-400 font-medium">„App installieren"</span> oder „Zum Startbildschirm"
              </p>
            )}
          </div>
          <button
            onClick={dismiss}
            className="flex-shrink-0 rounded-lg p-1 text-slate-400 hover:text-slate-200 transition-colors"
            aria-label="Schließen"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
