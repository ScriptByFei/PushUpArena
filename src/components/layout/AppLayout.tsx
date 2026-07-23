import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { SettingsIcon, BellIcon, BellOffIcon, MenuIcon } from '@/components/ui/icons';
import { usePush } from '@/context/PushContext';
import { DailyRecapModal } from '@/components/DailyRecapModal';
import { useDailyRecap } from '@/hooks/useDailyRecap';
import { ExerciseChip } from '@/components/ExerciseChip';
import { useExercise } from '@/context/ExerciseContext';
import { ArenaFeed } from '@/components/ArenaFeed';
import { DailyChallengeModal } from '@/components/DailyChallengeModal';
import { NavDrawer, type NavDrawerHandle } from '@/components/navigation/NavDrawer';

/* ─── Page metadata ──────────────────────────────────────────────────────── */

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

/* ─── Constants ──────────────────────────────────────────────────────────── */

/** Re-navigate home after this long in the background. */
const BACKGROUND_THRESHOLD_MS = 5 * 60 * 1000;

/* ─── Component ──────────────────────────────────────────────────────────── */

export function AppLayout() {
  const { pathname } = useLocation();
  const title = titles[pathname] ?? 'PushupArena';
  const { pushPermission, busy, togglePush } = usePush();
  const pushActive = pushPermission === 'granted';
  const navigate = useNavigate();

  /* ── Permanent refs ──────────────────────────────────────────────────── */

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerNavRef  = useRef<NavDrawerHandle>(null);
  const drawerOpenRef = useRef(false);
  const hiddenAtRef   = useRef<number | null>(null);

  /* ── React state ─────────────────────────────────────────────────────── */

  const [drawerOpen, setDrawerOpen]                 = useState(false);
  const [recapManualOpen, setRecapManualOpen]       = useState(false);
  const [bellConfirmOpen, setBellConfirmOpen]       = useState(false);
  const [feedOpen, setFeedOpen]                     = useState(false);
  const [dailyChallengeOpen, setDailyChallengeOpen] = useState(false);

  // Keep ref in sync with state on every render
  drawerOpenRef.current = drawerOpen;

  /* ── Drawer helpers (icon-only — no swipe) ───────────────────────────── */

  const openDrawer = useCallback(() => {
    drawerNavRef.current?.snapOpen();
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    drawerNavRef.current?.snapClose();
    setDrawerOpen(false);
    menuButtonRef.current?.focus();
  }, []);

  const toggleDrawer = useCallback(() => {
    if (drawerOpenRef.current) closeDrawer();
    else openDrawer();
  }, [openDrawer, closeDrawer]);

  /* ── Other hooks ─────────────────────────────────────────────────────── */

  const {
    recap, open: recapOpen, dismiss: dismissRecap,
    forceLoad, navLoading, medalCounts, availableDates, currentDateIdx, goToDate,
  } = useDailyRecap();

  const { enrolledExercises } = useExercise();
  const showChip =
    enrolledExercises.length > 1 &&
    pathname !== '/' &&
    pathname !== '/global-stats' &&
    pathname !== '/achievements';

  const handleOpenRecap = useCallback(async () => {
    await forceLoad();
    setRecapManualOpen(true);
  }, [forceLoad]);

  /* ── Background return-home ──────────────────────────────────────────── */

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
      } else if (document.visibilityState === 'visible') {
        if (
          hiddenAtRef.current !== null &&
          Date.now() - hiddenAtRef.current > BACKGROUND_THRESHOLD_MS
        ) {
          navigate('/', { replace: true });
        }
        hiddenAtRef.current = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [navigate]);

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <div
      className="mx-auto flex min-h-screen max-w-md flex-col"
      style={{ touchAction: 'pan-y', overscrollBehaviorX: 'none' }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-30 border-b border-ink-800 bg-ink-950/80 backdrop-blur"
        style={{ paddingTop: 'max(4px, env(safe-area-inset-top))' }}
      >
        <div className="relative flex items-center" style={{ height: 48 }}>

          {/* Zone L — hamburger */}
          <div className="flex shrink-0 items-center pl-0">
            <button
              ref={menuButtonRef}
              id="nav-drawer-trigger"
              onClick={toggleDrawer}
              aria-label="Navigation öffnen"
              aria-expanded={drawerOpen}
              aria-controls="nav-drawer"
              className={
                'grid place-items-center rounded-lg text-slate-400 transition ' +
                'hover:bg-ink-800 active:bg-ink-700 ' +
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400'
              }
              style={{ width: 40, height: 48 }}
            >
              <MenuIcon className="h-[18px] w-[18px]" />
            </button>
          </div>

          {/* Zone C — title centred */}
          <span className="pointer-events-none absolute inset-x-0 text-center text-[15px] font-bold tracking-tight text-slate-100 whitespace-nowrap">
            {title}
          </span>

          {/* Zone R — ExerciseChip + Bell + Settings */}
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
              aria-label={
                pushActive
                  ? 'Benachrichtigungen deaktivieren'
                  : 'Benachrichtigungen aktivieren'
              }
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

      {/* ── Page content ────────────────────────────────────────────────── */}
      {/*
       * AnimatePresence with mode="wait" + fade-only transition.
       * No horizontal translateX → no risk of triggering horizontal overflow
       * or an accidental swipe sensation on page change.
       */}
      <main className="relative flex-1 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: 'easeInOut' }}
            className="absolute inset-0 overflow-x-hidden overflow-y-auto px-4 pb-32 pt-3"
            style={{ touchAction: 'pan-y', overscrollBehaviorX: 'none' }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <BottomNav />

      {/* ── Overlays / modals ─────────────────────────────────────────── */}

      {feedOpen && <ArenaFeed onClose={() => setFeedOpen(false)} />}

      {dailyChallengeOpen && (
        <DailyChallengeModal onClose={() => setDailyChallengeOpen(false)} />
      )}

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
              className="mt-6 w-full rounded-2xl border border-ink-600 py-3 text-sm font-semibold text-slate-300 transition hover:bg-ink-700"
            >
              OK
            </button>
          </div>
        </div>
      )}

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
            <p className="mb-1 text-center text-base font-bold text-slate-100">
              Benachrichtigungen deaktivieren?
            </p>
            <p className="mb-6 text-center text-sm text-slate-500">
              Du verpasst dann tägliche Erinnerungen und Ranglisten-Updates.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setBellConfirmOpen(false)}
                className="flex-1 rounded-2xl border border-ink-600 py-3 text-sm font-semibold text-slate-300 transition hover:bg-ink-700"
              >
                Abbrechen
              </button>
              <button
                onClick={() => { setBellConfirmOpen(false); void togglePush(); }}
                className="flex-1 rounded-2xl bg-red-500/20 py-3 text-sm font-semibold text-red-400 transition hover:bg-red-500/30"
              >
                Deaktivieren
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Drawer — opened/closed exclusively via the menu icon */}
      <NavDrawer
        ref={drawerNavRef}
        open={drawerOpen}
        onClose={closeDrawer}
        onOpenFeed={() => setFeedOpen(true)}
        onOpenRecap={handleOpenRecap}
        onOpenDailyChallenge={() => setDailyChallengeOpen(true)}
      />
    </div>
  );
}
