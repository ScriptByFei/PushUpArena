import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { SettingsIcon, BellIcon, BellOffIcon } from '@/components/ui/icons';
import { usePush } from '@/context/PushContext';
import { DailyRecapModal } from '@/components/DailyRecapModal';
import { useDailyRecap } from '@/hooks/useDailyRecap';
import { ExerciseChip } from '@/components/ExerciseChip';
import { useExercise } from '@/context/ExerciseContext';
import { ArenaFeed } from '@/components/ArenaFeed';
import { DailyChallengeModal } from '@/components/DailyChallengeModal';

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

// Swipe-Reihenfolge = Bottom-Nav-Reihenfolge
const SWIPE_ROUTES = ['/', '/friends', '/leaderboard', '/activity', '/profile'];

const pageVariants = {
  enter: (dir: number) => ({ x: dir >= 0 ? '100%' : '-100%' }),
  center: { x: 0 },
  exit: (dir: number) => ({ x: dir >= 0 ? '-100%' : '100%' }),
};

export function AppLayout() {
  const { pathname } = useLocation();
  const title = titles[pathname] ?? 'PushupArena';
  const { pushPermission, busy, togglePush } = usePush();
  const pushActive = pushPermission === 'granted';
  const navigate = useNavigate();
  const hiddenAtRef = useRef<number | null>(null);
  const swipeStartX = useRef<number | null>(null);
  const swipeStartY = useRef<number | null>(null);
  const swipeDirection = useRef<number>(1);
  const prevPathname = useRef(pathname);

  useEffect(() => {
    const prevIdx = SWIPE_ROUTES.indexOf(prevPathname.current);
    const currIdx = SWIPE_ROUTES.indexOf(pathname);
    if (prevIdx !== -1 && currIdx !== -1) {
      swipeDirection.current = currIdx >= prevIdx ? 1 : -1;
    }
    prevPathname.current = pathname;
  }, [pathname]);
  const { recap, open: recapOpen, dismiss: dismissRecap, forceLoad, navLoading, medalCounts, availableDates, currentDateIdx, goToDate } = useDailyRecap();
  const { enrolledExercises } = useExercise();
  const showChip = enrolledExercises.length > 1 && pathname !== '/' && pathname !== '/global-stats' && pathname !== '/achievements';
  const [recapManualOpen, setRecapManualOpen] = useState(false);
  const [bellConfirmOpen, setBellConfirmOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const [dailyChallengeOpen, setDailyChallengeOpen] = useState(false);

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

  const handleSwipeStart = (e: React.TouchEvent) => {
    const noSwipe = (e.target as Element).closest('[data-no-swipe]');
    if (noSwipe) return;
    swipeStartX.current = e.touches[0].clientX;
    swipeStartY.current = e.touches[0].clientY;
  };

  const handleSwipeEnd = (e: React.TouchEvent) => {
    if (swipeStartX.current === null || swipeStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - swipeStartX.current;
    const dy = e.changedTouches[0].clientY - swipeStartY.current;
    swipeStartX.current = null;
    swipeStartY.current = null;
    if (Math.abs(dx) < 60 || Math.abs(dy) > 80) return;
    const idx = SWIPE_ROUTES.indexOf(pathname);
    if (idx === -1) return;
    const next = dx < 0 ? idx + 1 : idx - 1;
    if (next >= 0 && next < SWIPE_ROUTES.length) navigate(SWIPE_ROUTES[next]);
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      {/* Header:
           Zeile 1: [Feed+Recap] ── [Titel absolut zentriert] ── [Glocke+Settings]
           Zeile 2 (optional): [ExerciseChip zentriert] — nur wenn mehrere Übungen */}
      <header
        className="sticky top-0 z-30 border-b border-ink-800 bg-ink-950/80 backdrop-blur"
        style={{ paddingTop: 'max(4px, env(safe-area-inset-top))' }}
      >
        {/* Hauptzeile — symmetrisch: linke und rechte Zone je 96 px */}
        <div className="relative flex items-center" style={{ height: 48 }}>

          {/* Zone L — Feed + Recap + Daily Challenge */}
          <div className="flex shrink-0 items-center gap-0 pl-0">
            <button
              onClick={() => setFeedOpen(true)}
              aria-label="Arena-Feed"
              className="grid place-items-center rounded-lg transition hover:bg-ink-800 active:bg-ink-700"
              style={{ width: 40, height: 48 }}
            >
              <img src="/arena-feed-icon.webp" alt="" style={{ width: 36, height: 36, display: 'block', objectFit: 'contain' }} />
            </button>
            <button
              onClick={async () => { await forceLoad(); setRecapManualOpen(true); }}
              aria-label="Tages-Recap"
              className="grid place-items-center rounded-lg transition hover:bg-ink-800 active:bg-ink-700"
              style={{ width: 40, height: 48 }}
            >
              <img src="/recap-icon.webp" alt="" style={{ width: 36, height: 36, display: 'block', objectFit: 'contain' }} />
            </button>
            <button
              onClick={() => setDailyChallengeOpen(true)}
              aria-label="Daily Challenge"
              className="grid place-items-center rounded-lg transition hover:bg-ink-800 active:bg-ink-700"
              style={{ width: 40, height: 48 }}
            >
              <img src="/daily-challenge-icon.webp" alt="" style={{ width: 36, height: 36, display: 'block', objectFit: 'contain' }} />
            </button>
          </div>

          {/* Zone C — Titel immer exakt zentriert */}
          <span className="pointer-events-none absolute inset-x-0 text-center text-[15px] font-bold tracking-tight text-slate-100 whitespace-nowrap">
            {title}
          </span>

          {/* Zone R — Chip (kompakt) + Glocke + Settings, rechtsbündig */}
          <div className="ml-auto flex shrink-0 items-center pr-0">
            {showChip && (
              <div className="mr-1">
                <ExerciseChip compact />
              </div>
            )}
            <button
              onClick={() => {
                if (pushActive) setBellConfirmOpen(true);
                else void togglePush();
              }}
              disabled={busy}
              aria-label={pushActive ? 'Benachrichtigungen deaktivieren' : 'Benachrichtigungen aktivieren'}
              className={`grid place-items-center rounded-lg transition hover:bg-ink-800 ${
                pushActive ? 'text-brand-400' : 'text-slate-500'
              }`}
              style={{ width: 48, height: 48 }}
            >
              {pushActive
                ? <BellIcon className="h-[18px] w-[18px]" />
                : <BellOffIcon className="h-[18px] w-[18px]" />
              }
            </button>
            <Link
              to="/settings"
              aria-label="Einstellungen"
              className="grid place-items-center rounded-lg text-slate-400 transition hover:bg-ink-800 hover:text-slate-200"
              style={{ width: 48, height: 48 }}
            >
              <SettingsIcon className="h-[18px] w-[18px]" />
            </Link>
          </div>
        </div>

      </header>

      <main
        className="relative flex-1 overflow-hidden"
        onTouchStart={handleSwipeStart}
        onTouchEnd={handleSwipeEnd}
      >
        <AnimatePresence initial={false} custom={swipeDirection.current} mode="popLayout">
          <motion.div
            key={pathname}
            custom={swipeDirection.current}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 350, damping: 35, mass: 0.8 }}
            className="absolute inset-0 overflow-y-auto px-4 pb-32 pt-3"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <BottomNav />

      {/* Arena Feed */}
      {feedOpen && <ArenaFeed onClose={() => setFeedOpen(false)} />}

      {/* Daily Challenge Modal */}
      {dailyChallengeOpen && (
        <DailyChallengeModal onClose={() => setDailyChallengeOpen(false)} />
      )}

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
