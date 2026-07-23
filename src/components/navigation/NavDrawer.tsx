import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
} from 'framer-motion';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { useDrawerStats } from '@/context/DrawerStatsContext';
import { Avatar } from '@/components/ui/Avatar';
import {
  BoltIcon,
  HomeIcon,
  LogoutIcon,
  RecapIcon,
  SettingsIcon,
  TrophyIcon,
  XIcon,
} from '@/components/ui/icons';

/* ---------- Public imperative API ---------- */

export interface NavDrawerHandle {
  /** Spring-animate panel to fully-open position (x = 0). */
  snapOpen: () => void;
  /** Spring-animate panel to fully-closed position (x = -width). */
  snapClose: () => void;
}

/* ---------- Props ---------- */

export interface NavDrawerProps {
  /** Logical open state — used ONLY for focus-trap activation and aria-expanded. */
  open: boolean;
  /** Called by keyboard (Escape), backdrop click, close button, nav-item selection. */
  onClose: () => void;
  onOpenFeed: () => void;
  onOpenRecap: () => void;
  onOpenDailyChallenge: () => void;
}

/* ---------- Constants ---------- */

const FOCUSABLE =
  'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])';

/* ---------- Helpers ---------- */

function isRouteActive(pathname: string, to: string): boolean {
  if (to === '/') return pathname === '/';
  return pathname === to || pathname.startsWith(to + '/');
}

/* ---------- Sub-components ---------- */

function DrawerNavItem({
  to,
  label,
  icon,
  pathname,
  onClose,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
  pathname: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const active = isRouteActive(pathname, to);
  return (
    <button
      onClick={() => {
        onClose();
        if (!active) navigate(to);
      }}
      className={
        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ' +
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400 ' +
        (active
          ? 'bg-brand-600/20 text-brand-300'
          : 'text-slate-400 hover:bg-ink-800 hover:text-slate-100')
      }
    >
      {icon}
      {label}
    </button>
  );
}

function DrawerActionItem({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 transition ' +
        'hover:bg-ink-800 hover:text-slate-100 ' +
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400'
      }
    >
      {icon}
      {label}
    </button>
  );
}

function GlobalStatsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g opacity="0.7" stroke="currentColor" strokeWidth="1.25">
        <circle cx="12" cy="11" r="8.5" />
        <line x1="3.5" y1="11" x2="20.5" y2="11" />
        <path d="M12 2.5 Q8.5 6 8.5 11 Q8.5 16 12 19.5" />
        <path d="M12 2.5 Q15.5 6 15.5 11 Q15.5 16 12 19.5" />
      </g>
      <rect x="4.5"  y="17.5" width="2" height="3"  rx="0.5" fill="#818cf8" />
      <rect x="8"    y="14.5" width="2" height="6"  rx="0.5" fill="#818cf8" />
      <rect x="11.5" y="11.5" width="2" height="9"  rx="0.5" fill="#818cf8" />
      <rect x="15"   y="8.5"  width="2" height="12" rx="0.5" fill="#818cf8" />
    </svg>
  );
}

/* ---------- Main component ---------- */

export const NavDrawer = forwardRef<NavDrawerHandle, NavDrawerProps>(function NavDrawer(
  { open, onClose, onOpenFeed, onOpenRecap, onOpenDailyChallenge },
  ref,
) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { profile } = useProfile();
  const { stats, statsLoading, dailyRank, rankLoading } = useDrawerStats();
  const { pathname } = useLocation();
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const prefersReduced = useReducedMotion();
  // Store in ref so stable callbacks can read the latest value
  const prefersReducedRef = useRef(prefersReduced);
  prefersReducedRef.current = prefersReduced;

  // ─── MotionValues ───────────────────────────────────────────────────────────
  // panelX: 0 = fully open, -width = fully closed. Starts far off-screen.
  const panelX = useMotionValue(-400);
  // overlayOpacity: 0 = invisible, 1 = fully opaque. Derived from panelX.
  const overlayOpacity = useMotionValue(0);

  // Keep backdrop opacity and DOM pointer-events in sync with panelX on every frame.
  // We mutate the DOM directly to avoid per-frame React re-renders.
  useMotionValueEvent(panelX, 'change', (x) => {
    const width = panelRef.current?.offsetWidth ?? 340;
    const opacity = Math.max(0, Math.min(1, (x + width) / width));
    overlayOpacity.set(opacity);

    if (backdropRef.current) {
      backdropRef.current.style.pointerEvents = opacity > 0.01 ? 'auto' : 'none';
    }
    if (panelRef.current) {
      const active = x > -width + 0.5;
      panelRef.current.style.visibility = active ? 'visible' : 'hidden';
      panelRef.current.style.pointerEvents = active ? 'auto' : 'none';
    }
  });

  // ─── Spring config ──────────────────────────────────────────────────────────
  // Same parameters as page transitions for visual consistency.
  const getSpring = () =>
    prefersReducedRef.current
      ? { duration: 0 }
      : { type: 'spring' as const, stiffness: 350, damping: 35, mass: 0.8 };

  // ─── Imperative handle exposed to AppLayout ──────────────────────────────────
  useImperativeHandle(ref, () => ({
    snapOpen() {
      animate(panelX, 0, getSpring());
    },
    snapClose() {
      const width = panelRef.current?.offsetWidth ?? 340;
      animate(panelX, -width, getSpring());
    },
  }));

  // ─── Focus trap (active when open prop is true) ──────────────────────────────
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    panel.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const all = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (all.length === 0) return;
      const first = all[0];
      const last = all[all.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // ─── Sign-out ────────────────────────────────────────────────────────────────
  const handleSignOut = useCallback(async () => {
    onClose();
    await signOut();
  }, [onClose, signOut]);

  const handleProfileClick = useCallback(() => {
    onClose();
    if (pathname !== '/profile') navigate('/profile');
  }, [onClose, navigate, pathname]);

  const displayName = profile?.display_name ?? profile?.username ?? 'Profil';
  const avatarUrl = profile?.avatar_url;

  /** Formats streak as "1 Tag Streak" / "37 Tage Streak" / "Keine aktive Streak" */
  function streakLabel(n: number): string {
    if (n === 0) return 'Keine aktive Streak';
    return `${n} ${n === 1 ? 'Tag' : 'Tage'} Streak`;
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop — always in DOM; pointer-events managed imperatively above. */}
      <div
        ref={backdropRef}
        className="fixed inset-0 z-[45]"
        style={{ pointerEvents: 'none' }}
        onClick={onClose}
        aria-hidden="true"
      >
        <motion.div className="h-full w-full bg-black/60" style={{ opacity: overlayOpacity }} />
      </div>

      {/* Drawer panel — always in DOM; x position driven by MotionValue */}
      <motion.div
        ref={panelRef}
        id="nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        style={{
          x: panelX,
          visibility: 'hidden',  // initial; motionValueEvent updates this
          pointerEvents: 'none', // initial; motionValueEvent updates this
          paddingTop: 'max(16px, env(safe-area-inset-top))',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        }}
        className={
          'fixed left-0 top-0 z-[46] flex h-full w-[84vw] max-w-[340px] flex-col ' +
          'rounded-r-2xl border-r border-ink-700 bg-ink-900 shadow-2xl'
        }
      >
        {/* ── Profile header ──────────────────────────────────────────────────
             Clickable area (avatar + name + stats) navigates to /profile.
             Close button is a separate tap target.                           */}
        <div className="flex items-start justify-between gap-2 px-3 pb-3">
          <button
            onClick={handleProfileClick}
            aria-label="Profil öffnen"
            className={
              'flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1 text-left transition ' +
              'hover:bg-ink-800 active:bg-ink-700 ' +
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400'
            }
            style={{ minHeight: 44 }}
          >
            {/* Avatar — 52 px, falls back to /default-avatar.webp via Avatar component */}
            <Avatar
              url={avatarUrl}
              name={displayName}
              size={52}
              className="ring-2 ring-brand-500/30"
            />

            {/* Text column */}
            <div className="min-w-0 flex-1">
              {/* Display name */}
              <p className="truncate text-sm font-bold text-slate-100 leading-snug">
                {displayName}
              </p>

              {/* Rank · Score */}
              <p className="mt-0.5 truncate text-[11px] text-slate-400 leading-snug">
                {rankLoading || statsLoading ? (
                  <span className="inline-block h-3 w-28 animate-pulse rounded bg-ink-700" />
                ) : (
                  <>
                    {dailyRank !== null
                      ? `Platz ${dailyRank}`
                      : 'Noch nicht platziert'}
                    {' · '}
                    {stats.total_amount.toLocaleString('de-DE')} Punkte
                  </>
                )}
              </p>

              {/* Streak */}
              <p className="mt-0.5 truncate text-[11px] leading-snug text-slate-500">
                {statsLoading ? (
                  <span className="inline-block h-3 w-20 animate-pulse rounded bg-ink-700" />
                ) : (
                  streakLabel(stats.current_streak)
                )}
              </p>
            </div>
          </button>

          {/* Close button — independent from profile click */}
          <button
            onClick={onClose}
            aria-label="Navigation schließen"
            className={
              'mt-1 grid shrink-0 place-items-center rounded-lg text-slate-400 transition ' +
              'hover:bg-ink-800 hover:text-slate-200 ' +
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400'
            }
            style={{ width: 36, height: 36 }}
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="mx-4 mb-2 h-px bg-ink-700" />

        {/* Scrollable nav — data-no-swipe prevents page-swipe detection inside list */}
        <div className="flex-1 overflow-y-auto px-2" data-no-swipe>
          <section aria-label="Hauptmenü">
            <p className="px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
              Navigation
            </p>

            <DrawerNavItem
              to="/"
              label="Dashboard"
              icon={<HomeIcon className="h-5 w-5" />}
              pathname={pathname}
              onClose={onClose}
            />
            <DrawerActionItem
              label="Arena Feed"
              icon={
                <img src="/arena-feed-icon.webp" alt="" className="h-5 w-5 object-contain" />
              }
              onClick={() => { onClose(); onOpenFeed(); }}
            />
            <DrawerActionItem
              label="Arena Rückblick"
              icon={<RecapIcon className="h-5 w-5" />}
              onClick={() => { onClose(); onOpenRecap(); }}
            />
            <DrawerActionItem
              label="Daily Live Challenge"
              icon={<BoltIcon className="h-5 w-5" />}
              onClick={() => { onClose(); onOpenDailyChallenge(); }}
            />
            <DrawerNavItem
              to="/achievements"
              label="Erfolge"
              icon={<TrophyIcon className="h-5 w-5" />}
              pathname={pathname}
              onClose={onClose}
            />
            <DrawerNavItem
              to="/global-stats"
              label="Globale Statistiken"
              icon={<GlobalStatsIcon />}
              pathname={pathname}
              onClose={onClose}
            />
          </section>

          <div className="mx-2 my-3 h-px bg-ink-800" />

          <section aria-label="Konto">
            <p className="px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
              Konto
            </p>
            <DrawerNavItem
              to="/settings"
              label="Einstellungen"
              icon={<SettingsIcon className="h-5 w-5" />}
              pathname={pathname}
              onClose={onClose}
            />
          </section>
        </div>

        {/* Footer: sign out */}
        <div className="mx-4 mt-2 border-t border-ink-700 pt-3">
          {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
          <button
            onClick={handleSignOut}
            className={
              'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-400 transition ' +
              'hover:bg-red-500/10 ' +
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400'
            }
          >
            <LogoutIcon className="h-5 w-5" />
            Abmelden
          </button>
        </div>
      </motion.div>
    </>
  );
});
