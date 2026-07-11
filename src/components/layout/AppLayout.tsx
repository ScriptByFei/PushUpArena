import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { SettingsIcon, BellIcon, BellOffIcon, RecapIcon } from '@/components/ui/icons';
import { usePush } from '@/context/PushContext';
import { DailyRecapModal } from '@/components/DailyRecapModal';
import { useDailyRecap } from '@/hooks/useDailyRecap';

const titles: Record<string, string> = {
  '/': 'Dashboard',
  '/track': 'Eintragen',
  '/friends': 'Freunde',
  '/activity': 'Aktivität',
  '/achievements': 'Erfolge · PushUp',
  '/leaderboard': 'Rangliste',
  '/profile': 'Profil',
  '/settings': 'Einstellungen',
};

// Nach 5 Minuten im Hintergrund → beim Öffnen zurück zum Dashboard
const BACKGROUND_THRESHOLD_MS = 5 * 60 * 1000;

export function AppLayout() {
  const { pathname } = useLocation();
  const title = titles[pathname] ?? 'PushupArena';
  const { pushPermission, busy, togglePush } = usePush();
  const pushActive = pushPermission === 'granted';
  const navigate = useNavigate();
  const hiddenAtRef = useRef<number | null>(null);
  const { recap, open: recapOpen, dismiss: dismissRecap, forceLoad, goToPrev, goToNext, hasPrev, hasNext, navLoading, medalCounts } = useDailyRecap();
  const [recapManualOpen, setRecapManualOpen] = useState(false);
  const [bellConfirmOpen, setBellConfirmOpen] = useState(false);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
      } else if (document.visibilityState === 'visible') {
        if (
          hiddenAtRef.current !== null &&
          Date.now() - hiddenAtRef.current > BACKGROUND_THRESHOLD_MS
        ) {
          navigate('/');
        }
        hiddenAtRef.current = null;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [navigate]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      <header className="sticky top-0 z-30 relative flex items-center border-b border-ink-800 bg-ink-950/80 px-4 py-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur">
        {/* Recap-Button links */}
        <button
          onClick={async () => { await forceLoad(); setRecapManualOpen(true); }}
          aria-label="Tages-Recap"
          className={`shrink-0 rounded-lg p-2 transition hover:bg-ink-800 ${pushActive ? 'text-brand-400' : 'text-slate-500'}`}
        >
          <RecapIcon className="h-5 w-5" />
        </button>
        {/* Titel absolut zentriert */}
        <span className="pointer-events-none absolute inset-x-0 text-center text-base font-bold tracking-tight">
          {title}
        </span>
        {/* Glocke + Settings rechts */}
        <div className="ml-auto flex items-center">
          <button
            onClick={() => {
              if (pushActive) {
                setBellConfirmOpen(true);
              } else {
                void togglePush();
              }
            }}
            disabled={busy}
            aria-label={pushActive ? 'Benachrichtigungen deaktivieren' : 'Benachrichtigungen aktivieren'}
            className={`shrink-0 rounded-lg p-2 transition hover:bg-ink-800 ${
              pushActive ? 'text-brand-400' : 'text-slate-500'
            }`}
          >
            {pushActive
              ? <BellIcon className="h-5 w-5" />
              : <BellOffIcon className="h-5 w-5" />
            }
          </button>
          <Link
            to="/settings"
            aria-label="Einstellungen"
            className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-ink-800 hover:text-slate-200"
          >
            <SettingsIcon className="h-5 w-5" />
          </Link>
        </div>
      </header>

      <main className="flex-1 px-4 pb-32 pt-4">
        <Outlet />
      </main>

      <BottomNav />

      {/* Daily Recap Modal — auto-show oder manuell */}
      {(recapOpen || recapManualOpen) && recap && (
        <DailyRecapModal
          recap={recap}
          onClose={() => { setRecapManualOpen(false); void dismissRecap(); }}
          onPrev={goToPrev}
          onNext={goToNext}
          hasPrev={hasPrev}
          hasNext={hasNext}
          navLoading={navLoading}
          medalCounts={medalCounts}
        />
      )}
      {/* Bestätigung: Benachrichtigungen deaktivieren */}
      {bellConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setBellConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl border-t border-ink-700 bg-ink-900 px-6 pb-10 pt-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink-600" />
            <p className="mb-1 text-center text-base font-bold text-slate-100">Benachrichtigungen deaktivieren?</p>
            <p className="mb-6 text-center text-sm text-slate-500">Du verpasst dann tägliche Erinnerungen und Ranglisten-Updates.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setBellConfirmOpen(false)}
                className="flex-1 rounded-2xl border border-ink-600 py-3 text-sm font-semibold text-slate-300 hover:bg-ink-700 transition"
              >
                Abbrechen
              </button>
              <button
                onClick={() => { setBellConfirmOpen(false); void togglePush(); }}
                className="flex-1 rounded-2xl bg-red-500/20 py-3 text-sm font-semibold text-red-400 hover:bg-red-500/30 transition"
              >
                Deaktivieren
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Kein Recap verfügbar (manuell geöffnet) */}
      {recapManualOpen && !recap && !navLoading && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setRecapManualOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl border-t border-ink-700 bg-ink-900 px-6 pb-10 pt-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink-600" />
            <p className="text-center text-base font-bold text-slate-100">Noch kein Recap</p>
            <p className="mt-2 text-center text-sm text-slate-500">
              Der erste Rückblick erscheint morgen früh nach Mitternacht.
            </p>
            <button
              onClick={() => setRecapManualOpen(false)}
              className="mt-6 w-full rounded-2xl border border-ink-600 py-3 text-sm font-semibold text-slate-300 hover:bg-ink-700 transition"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
