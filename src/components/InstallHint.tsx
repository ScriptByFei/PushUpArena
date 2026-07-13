import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

// Diese Pfade bleiben im Browser zugänglich (E-Mail-Links, Rechtliches)
const BROWSER_ALLOWED = ['/auth/confirm', '/reset-password', '/forgot-password', '/privacy', '/imprint'];

const LS_KEY = 'pua_ios_non_safari_dismissed';

function isStandalone(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  if ((window.navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  return false;
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** True only for real Safari on iOS — not Chrome/Firefox/Edge/etc. */
function isIOSSafari(): boolean {
  if (!isIOS()) return false;
  // Third-party browsers on iOS carry their own tokens
  return !/CriOS|FxiOS|EdgiOS|OPiOS|mercury|GSA/i.test(navigator.userAgent);
}

// Context so other components (e.g. Login) know when the overlay is blocking
const InstallHintContext = createContext(false);
export function useInstallHintActive() { return useContext(InstallHintContext); }

// ─── Non-Safari iOS dialog (dismissible) ────────────────────────────────────

function NonSafariIOSDialog({ onDismiss, onNeverShow }: {
  onDismiss: () => void;
  onNeverShow: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm px-0">
      <div className="w-full max-w-md rounded-t-3xl border-t border-ink-700 bg-ink-900 px-5 pb-10 pt-4 shadow-2xl">
        {/* Drag handle */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink-600" />

        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/15">
            <span className="text-3xl">📲</span>
          </div>
          <h2 className="text-[17px] font-extrabold text-slate-100">PushUpArena installieren</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
            Um PushUpArena als App auf deinem Home-Bildschirm zu installieren,
            musst du die Seite in <span className="font-semibold text-slate-200">Safari</span> öffnen.
          </p>
          <p className="mt-1 text-[13px] text-slate-500">
            Die Installation ist auf dem iPhone ausschließlich über Safari möglich.
          </p>
        </div>

        {/* Steps */}
        <div className="mb-5 rounded-2xl border border-ink-700 bg-ink-800 px-4 py-4">
          <ol className="space-y-3">
            {[
              'Öffne diese Seite in Safari.',
              <>Tippe auf das <span className="font-semibold text-slate-100">Teilen-Symbol</span> <span className="text-slate-400">↑</span></>,
              <>Wähle <span className="font-semibold text-slate-100">„Zum Home-Bildschirm"</span></>,
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-xs font-bold text-brand-400">
                  {i + 1}
                </span>
                <span className="text-[13px] leading-snug text-slate-300">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-2.5">
          <button
            onClick={onDismiss}
            className="w-full rounded-2xl bg-brand-500 py-3.5 text-[15px] font-bold text-white transition active:bg-brand-600"
          >
            Verstanden
          </button>
          <button
            onClick={onNeverShow}
            className="w-full rounded-2xl border border-ink-600 py-3.5 text-[14px] font-semibold text-slate-400 transition hover:bg-ink-800 active:bg-ink-700"
          >
            Nicht mehr anzeigen
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Safari iOS blocker (existing behavior) ──────────────────────────────────

function SafariIOSBlocker() {
  return (
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
          <ol className="space-y-3 text-sm text-slate-300">
            <li className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-xs font-bold text-brand-400">1</span>
              <span>Tippe auf das <span className="font-semibold text-slate-100">Teilen-Symbol</span> <span className="text-slate-400">↑</span> in der Safari-Leiste</span>
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
        </div>
      </div>
    </div>
  );
}

// ─── Non-iOS blocker (existing behavior) ─────────────────────────────────────

function NonIOSBlocker() {
  return (
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
        </div>
      </div>
    </div>
  );
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function InstallHintProvider({ children }: { children: ReactNode }) {
  const [standalone, setStandalone] = useState(true); // optimistic: avoid flash
  const [nonSafariDismissed, setNonSafariDismissed] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setStandalone(isStandalone());
    setNonSafariDismissed(localStorage.getItem(LS_KEY) === '1');
  }, []);

  const isAllowedInBrowser = BROWSER_ALLOWED.some((p) => pathname.startsWith(p));

  // Never block if standalone or on an allowed path
  if (standalone || isAllowedInBrowser) {
    return (
      <InstallHintContext.Provider value={false}>
        {children}
      </InstallHintContext.Provider>
    );
  }

  const ios = isIOS();
  const safari = isIOSSafari();

  // iOS + non-Safari: show dismissible dialog
  if (ios && !safari) {
    const showDialog = !nonSafariDismissed;
    const handleDismiss = () => setNonSafariDismissed(true);
    const handleNeverShow = () => {
      localStorage.setItem(LS_KEY, '1');
      setNonSafariDismissed(true);
    };

    return (
      <InstallHintContext.Provider value={showDialog}>
        {children}
        {showDialog && (
          <NonSafariIOSDialog onDismiss={handleDismiss} onNeverShow={handleNeverShow} />
        )}
      </InstallHintContext.Provider>
    );
  }

  // iOS + Safari: full-screen blocker with install steps
  if (ios && safari) {
    return (
      <InstallHintContext.Provider value={true}>
        {children}
        <SafariIOSBlocker />
      </InstallHintContext.Provider>
    );
  }

  // Non-iOS: full-screen blocker
  return (
    <InstallHintContext.Provider value={true}>
      {children}
      <NonIOSBlocker />
    </InstallHintContext.Provider>
  );
}
