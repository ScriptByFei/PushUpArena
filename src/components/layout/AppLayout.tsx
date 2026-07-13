import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { SettingsIcon, BellIcon, BellOffIcon } from '@/components/ui/icons';
import { usePush } from '@/context/PushContext';
import { DailyRecapModal } from '@/components/DailyRecapModal';
import { useDailyRecap } from '@/hooks/useDailyRecap';
import { ExerciseChip } from '@/components/ExerciseChip';
import { useExercise } from '@/context/ExerciseContext';
import { ArenaFeed } from '@/components/ArenaFeed';

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
  const { recap, open: recapOpen, dismiss: dismissRecap, forceLoad, navLoading, medalCounts, availableDates, currentDateIdx, goToDate } = useDailyRecap();
  const { enrolledExercises } = useExercise();
  const showChip = enrolledExercises.length > 1 && pathname !== '/' && pathname !== '/global-stats' && pathname !== '/achievements';
  const centerTitle = !showChip;
  const [recapManualOpen, setRecapManualOpen] = useState(false);
  const [bellConfirmOpen, setBellConfirmOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);

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
      {/* 3-Zonen-Grid: [Feed+Recap] [Titel] [Chip+Glocke+Settings] */}
      <header className="sticky top-0 z-30 grid grid-cols-[auto_1fr_auto] items-center gap-0 border-b border-ink-800 bg-ink-950/80 px-2.5 py-1.5 pt-[max(6px,env(safe-area-inset-top))] backdrop-blur">

        {/* Zone 1 — Feed + Recap als zusammengehöriges Icon-Paar.
             Beide Buttons: 48×48 px feste Fläche, zentriert via grid.
             Feed-Icon 42 px, Recap-Icon 40 px → gleicher wahrgenommener Kreisdurchmesser. */}
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            onClick={() => setFeedOpen(true)}
            aria-label="Arena-Feed"
            className="grid place-items-center rounded-lg transition hover:bg-ink-800 active:bg-ink-700"
            style={{ width: 48, height: 48, padding: 0, flex: '0 0 48px' }}
          >
            <img src="/arena-feed-icon.webp" alt="" style={{ width: 48, height: 48, display: 'block', objectFit: 'contain' }} />
          </button>
          <button
            onClick={async () => { await forceLoad(); setRecapManualOpen(true); }}
            aria-label="Tages-Recap"
            className="grid place-items-center rounded-lg transition hover:bg-ink-800 active:bg-ink-700"
            style={{ width: 48, height: 48, padding: 0, flex: '0 0 48px' }}
          >
            <img src="/recap-icon.webp" alt="" style={{ width: 44, height: 44, display: 'block', objectFit: 'contain' }} />
          </button>
        </div>

        {/* Zone 2 — Seitentitel: nie abschneiden, Schrift skaliert bei Platzmangel */}
        <span
          className="min-w-0 px-1 text-center font-bold tracking-tight text-slate-100 whitespace-nowrap"
          style={{ fontSize: 'clamp(11px, 3.8vw, 15px)' }}
        >
          {title}
        </span>

        {/* Zone 3 — Chip + Glocke + Settings rechts */}
        <div className="flex shrink-0 items-center gap-0.5">
          {showChip && (
            <div className="mr-0.5 max-w-[110px] min-w-0">
              <ExerciseChip />
            </div>
          )}
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
            className={`shrink-0 rounded-lg p-1.5 transition hover:bg-ink-800 ${
              pushActive ? 'text-brand-400' : 'text-slate-500'
            }`}
          >
            {pushActive
              ? <BellIcon className="h-[18px] w-[18px]" />
              : <BellOffIcon className="h-[18px] w-[18px]" />
            }
          </button>
          <Link
            to="/settings"
            aria-label="Einstellungen"
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-ink-800 hover:text-slate-200"
          >
            <SettingsIcon className="h-[18px] w-[18px]" />
          </Link>
        </div>
      </header>

      <main className="flex-1 px-4 pb-32 pt-3">
        <Outlet />
      </main>

      <BottomNav />

      {/* Arena Feed */}
      {feedOpen && <ArenaFeed onClose={() => setFeedOpen(false)} />}

      {/* Daily Recap Modal — auto-show oder manuell */}
      {(recapOpen || recapManualOpen) && recap && (
        <DailyRecapModal
          recap={recap}
          onClose={() => { setRecapManualOpen(false); void dismissRecap(); }}
          availableDates={availableDates}
          currentDateIdx={currentDateIdx}
          onDateSelect={goToDate}
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
