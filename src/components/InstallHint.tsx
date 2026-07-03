import { useEffect, useState } from 'react';

const STORAGE_KEY = 'pwa-install-hint-dismissed';

function isStandalone(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  if ((window.navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  return false;
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
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
    // Full-screen overlay that blurs the content behind
    <div className="fixed inset-0 z-50 flex items-center justify-center px-5 bg-ink-950/80 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl border border-ink-600 bg-ink-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-brand-500/10 border-b border-ink-600 px-6 pt-6 pb-5 text-center">
          <img src="/icons/icon-192.png" alt="PushUpArena" className="mx-auto mb-3 h-16 w-16 rounded-2xl shadow-lg" />
          <h2 className="text-lg font-bold text-slate-100">App installieren</h2>
          <p className="mt-1 text-sm text-slate-400">Für das beste Erlebnis inkl. Push-Benachrichtigungen</p>
        </div>

        {/* Instructions */}
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

        {/* Footer */}
        <div className="border-t border-ink-700 px-6 py-4 text-center">
          <button
            onClick={dismiss}
            className="text-xs text-slate-500 hover:text-slate-400 transition-colors underline underline-offset-2"
          >
            Trotzdem im Browser fortfahren
          </button>
        </div>
      </div>
    </div>
  );
}
