import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  type Variants,
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
import { Avatar } from '@/components/ui/Avatar';
import {
  BoltIcon,
  HomeIcon,
  LogoutIcon,
  PlusIcon,
  RecapIcon,
  SettingsIcon,
  TrophyIcon,
  XIcon,
} from '@/components/ui/icons';

/* ---------- Public imperative API ---------- */

export interface NavDrawerHandle {
  /** Spring-animate panel to fully-open position (x = 0). */
  snapOpen: () => void;
  /** Spring-animate panel to fully-closed position (x = −width). */
  snapClose: () => void;
  /** Set panel position directly — used while drag is in progress. */
  setDragX: (x: number) => void;
  /** Return current panel pixel width. */
  getWidth: () => number;
}

/* ---------- Props ---------- */

export interface NavDrawerProps {
  open: boolean;
  onClose: () => void;
  onOpenFeed: () => void;
  onOpenRecap: () => void;
  onOpenDailyChallenge: () => void;
  /** Badge signals — all optional; default to falsy / 0 */
  challengeIsActive?: boolean;
  feedNewCount?: number;
  hasUnreadRecap?: boolean;
  /** Quick Actions */
  onOpenTraining: () => void;
  onOpenRestDay: () => void;
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
  to, label, icon, pathname, onClose, trailing,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
  pathname: string;
  onClose: () => void;
  trailing?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const active = isRouteActive(pathname, to);
  return (
    <button
      onClick={() => { onClose(); if (!active) navigate(to, { replace: true }); }}
      className={
        'group relative flex w-full min-h-[48px] items-center gap-3 rounded-xl px-3 py-[10px] ' +
        'text-[13px] font-medium transition-colors duration-150 ' +
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400 ' +
        (active
          ? 'bg-brand-600/[0.09] text-brand-300'
          : 'text-slate-500 hover:bg-white/[0.05] hover:text-slate-200')
      }
    >
      {/* Thin left accent bar — marks the active route */}
      {active && (
        <span className="absolute left-0 top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded-r-full bg-brand-400/60" />
      )}
      <span className={
        'shrink-0 transition-opacity duration-150 ' +
        (active ? 'opacity-100' : 'opacity-[0.45] group-hover:opacity-75')
      }>
        {icon}
      </span>
      <span className="flex-1 truncate text-left">{label}</span>
      {trailing}
    </button>
  );
}

function DrawerActionItem({
  label, icon, onClick, trailing, highlight = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  trailing?: React.ReactNode;
  /** Slightly elevated visual weight — used for Daily Live Challenge. */
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'group flex w-full min-h-[48px] items-center gap-3 rounded-xl px-3 py-[10px] ' +
        'text-[13px] font-medium transition-colors duration-150 ' +
        (highlight
          ? 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200 '
          : 'text-slate-500 hover:bg-white/[0.05] hover:text-slate-200 ') +
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400'
      }
    >
      <span className={
        'shrink-0 transition-opacity duration-150 ' +
        (highlight
          ? 'opacity-[0.60] group-hover:opacity-85'
          : 'opacity-[0.45] group-hover:opacity-75')
      }>
        {icon}
      </span>
      <span className="flex-1 truncate text-left">{label}</span>
      {trailing}
    </button>
  );
}

/* ---------- Badge helpers ---------- */

function NavBadge({ count }: { count: number }) {
  return (
    <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-500/[0.14] px-1.5 text-[10px] font-semibold tabular-nums text-brand-400/80">
      {count > 9 ? '9+' : count}
    </span>
  );
}

function LiveDot() {
  return (
    <span className="relative flex h-[7px] w-[7px]">
      <span
        className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-40"
        style={{ animationDuration: '2.5s' }}
      />
      <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-red-400/70" />
    </span>
  );
}

function UnreadDot() {
  return <span className="h-[7px] w-[7px] rounded-full bg-brand-400/40" />;
}

/** Group header — section label + children. `first` reduces top padding. */
function NavSection({ label, children, first = false }: {
  label: string;
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <section aria-label={label}>
      <p className={
        'px-3 pb-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500/70 ' +
        (first ? 'pt-3' : 'pt-5')
      }>
        {label}
      </p>
      {children}
    </section>
  );
}

/** Stagger + tap-scale wrapper. Receives variant from the parent container. */
function NavRow({ children, v }: { children: React.ReactNode; v: Variants }) {
  return (
    <motion.div variants={v} whileTap={{ scale: 0.975 }} className="rounded-xl">
      {children}
    </motion.div>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function GlobalStatsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g opacity="0.65" stroke="currentColor" strokeWidth="1.25">
        <circle cx="12" cy="11" r="8.5" />
        <line x1="3.5" y1="11" x2="20.5" y2="11" />
        <path d="M12 2.5 Q8.5 6 8.5 11 Q8.5 16 12 19.5" />
        <path d="M12 2.5 Q15.5 6 15.5 11 Q15.5 16 12 19.5" />
      </g>
      <rect x="4.5"  y="17.5" width="2" height="3"  rx="0.5" fill="#818cf8" opacity="0.7" />
      <rect x="8"    y="14.5" width="2" height="6"  rx="0.5" fill="#818cf8" opacity="0.7" />
      <rect x="11.5" y="11.5" width="2" height="9"  rx="0.5" fill="#818cf8" opacity="0.7" />
      <rect x="15"   y="8.5"  width="2" height="12" rx="0.5" fill="#818cf8" opacity="0.7" />
    </svg>
  );
}

/* ---------- Main component ---------- */

export const NavDrawer = forwardRef<NavDrawerHandle, NavDrawerProps>(function NavDrawer(
  {
    open, onClose, onOpenFeed, onOpenRecap, onOpenDailyChallenge,
    challengeIsActive = false, feedNewCount = 0, hasUnreadRecap = false,
    onOpenTraining, onOpenRestDay,
  },
  ref,
) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { profile } = useProfile();
  const { pathname } = useLocation();
  const panelRef    = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const prefersReduced = useReducedMotion();
  const prefersReducedRef = useRef(prefersReduced);
  prefersReducedRef.current = prefersReduced;

  // ── Animation variants ───────────────────────────────────────────────────────

  // Nav list — items slide from x:−5 and fade in with a gentle stagger
  const navContainerV = {
    open:   { transition: prefersReduced ? {} : { staggerChildren: 0.03, delayChildren: 0.08 } },
    closed: {},
  };
  const navItemV = {
    open:   { opacity: 1, x: 0,  transition: { duration: prefersReduced ? 0 : 0.18, ease: 'easeOut' as const } },
    closed: { opacity: 0, x: -5, transition: { duration: 0 } },
  };

  // Quick Actions — fade up very subtly, slightly before nav
  const qaContainerV = {
    open:   { transition: prefersReduced ? {} : { staggerChildren: 0.05, delayChildren: 0.04 } },
    closed: {},
  };
  const qaItemV = {
    open:   { opacity: 1, y: 0,  transition: { duration: prefersReduced ? 0 : 0.16, ease: 'easeOut' as const } },
    closed: { opacity: 0, y: 6,  transition: { duration: 0 } },
  };

  // ── MotionValues ─────────────────────────────────────────────────────────────

  // panelX: 0 = fully open, −width = fully closed. Starts far off-screen.
  const panelX         = useMotionValue(-400);
  const overlayOpacity = useMotionValue(0);

  // Keep overlay opacity and DOM pointer-events in sync with panelX — no React re-renders.
  useMotionValueEvent(panelX, 'change', (x) => {
    const width   = panelRef.current?.offsetWidth ?? 340;
    const opacity = Math.max(0, Math.min(1, (x + width) / width));
    overlayOpacity.set(opacity);

    if (backdropRef.current) {
      backdropRef.current.style.pointerEvents = opacity > 0.01 ? 'auto' : 'none';
    }
    if (panelRef.current) {
      const active = x > -width + 0.5;
      panelRef.current.style.visibility   = active ? 'visible' : 'hidden';
      panelRef.current.style.pointerEvents = active ? 'auto'    : 'none';
    }
  });

  // ── Spring config ────────────────────────────────────────────────────────────

  const getSpring = () =>
    prefersReducedRef.current
      ? { duration: 0 }
      : { type: 'spring' as const, stiffness: 340, damping: 36, mass: 0.8 };

  const animCtrl = useRef<ReturnType<typeof animate> | null>(null);

  useImperativeHandle(ref, () => ({
    snapOpen() {
      animCtrl.current?.stop();
      animCtrl.current = animate(panelX, 0, getSpring());
    },
    snapClose() {
      animCtrl.current?.stop();
      const width = panelRef.current?.offsetWidth ?? 340;
      animCtrl.current = animate(panelX, -width, getSpring());
    },
    setDragX(x: number) {
      animCtrl.current?.stop();
      panelX.set(x);
    },
    getWidth() {
      return panelRef.current?.offsetWidth ?? 340;
    },
  }));

  // ── Focus trap (active when open prop is true) ────────────────────────────────

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    panel.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const all   = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (all.length === 0) return;
      const first = all[0];
      const last  = all[all.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // ── Callbacks ────────────────────────────────────────────────────────────────

  const handleSignOut = useCallback(async () => {
    onClose();
    await signOut();
  }, [onClose, signOut]);

  const handleProfileClick = useCallback(() => {
    onClose();
    if (pathname !== '/profile') navigate('/profile', { replace: true });
  }, [onClose, navigate, pathname]);

  const displayName = profile?.display_name ?? profile?.username ?? 'Profil';
  const avatarUrl   = profile?.avatar_url;

  // ── Render ───────────────────────────────────────────────────────────────────
  //
  // Shell: position:fixed inset:0 overflow:hidden
  //   ↳ Backdrop (absolute, frosted glass)
  //   ↳ Panel (absolute, clipped by overflow:hidden so iOS can't swipe it into view)
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 45,
        overflow: 'hidden', pointerEvents: 'none',
      }}
    >
      {/* ── Backdrop — frosted glass over the page content ─────────────────── */}
      <div
        ref={backdropRef}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        onClick={onClose}
        aria-hidden="true"
      >
        <motion.div
          className="h-full w-full"
          style={{
            opacity: overlayOpacity,
            backgroundColor: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}
        />
      </div>

      {/* ── Drawer panel ───────────────────────────────────────────────────── */}
      <motion.div
        ref={panelRef}
        id="nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        style={{
          position: 'absolute', top: 0, bottom: 0, left: 0,
          x: panelX,
          visibility:   'hidden',   // motionValueEvent manages this
          pointerEvents: 'none',    // motionValueEvent manages this
          paddingTop:    'max(16px, env(safe-area-inset-top))',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        }}
        className={
          'z-[1] flex w-[84vw] max-w-[340px] flex-col ' +
          'rounded-r-[20px] border-r border-white/[0.07] ' +
          'bg-ink-900 shadow-[4px_0_40px_rgba(0,0,0,0.65)]'
        }
      >

        {/* ── Profile header ─────────────────────────────────────────────── */}
        <div
          className="flex items-center gap-3 px-4 pb-4 pt-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
        >
          {/* Avatar fades in */}
          <motion.div
            initial={false}
            animate={open ? { opacity: 1 } : { opacity: 0 }}
            transition={prefersReduced ? { duration: 0 } : { duration: 0.22, ease: 'easeOut' }}
            className="shrink-0"
          >
            <button
              onClick={handleProfileClick}
              aria-label="Profil öffnen"
              className="rounded-full transition active:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400"
              style={{ filter: 'drop-shadow(0 1px 8px rgba(0,0,0,0.5))' }}
            >
              <Avatar
                url={avatarUrl}
                name={displayName}
                size={56}
                className="ring-[1.5px] ring-brand-400/40"
              />
            </button>
          </motion.div>

          {/* Name + greeting slide from left */}
          <motion.button
            initial={false}
            animate={open ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }}
            transition={
              prefersReduced
                ? { duration: 0 }
                : { duration: 0.22, delay: 0.05, ease: 'easeOut' }
            }
            onClick={handleProfileClick}
            aria-label="Profil öffnen"
            className={
              'min-w-0 flex-1 rounded-lg text-left transition active:opacity-70 ' +
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400'
            }
          >
            <p className="truncate text-[15px] font-semibold leading-tight text-slate-100">
              {displayName}
            </p>
            <p className="mt-0.5 text-[11.5px] leading-snug text-slate-600">
              Bereit für dein Training?
            </p>
          </motion.button>

          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Navigation schließen"
            className={
              'shrink-0 grid h-8 w-8 place-items-center rounded-full transition ' +
              'bg-white/[0.06] text-slate-400 ' +
              'hover:bg-white/[0.10] hover:text-slate-200 ' +
              'active:bg-white/[0.14] ' +
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400'
            }
          >
            <XIcon className="h-[14px] w-[14px]" />
          </button>
        </div>

        {/* ── Quick Actions — 2-up row ────────────────────────────────────── */}
        <motion.div
          initial="closed"
          animate={open ? 'open' : 'closed'}
          variants={qaContainerV}
          className="grid grid-cols-2 gap-2 px-3 pb-1 pt-3"
        >
          {/* Training eintragen */}
          <motion.button
            variants={qaItemV}
            whileTap={{ scale: 0.95 }}
            onClick={() => { onClose(); onOpenTraining(); }}
            aria-label="Training eintragen"
            className={
              'flex min-h-[62px] flex-col items-center justify-center gap-2 rounded-2xl px-2 py-2.5 ' +
              'bg-brand-500/[0.08] text-brand-300 transition-colors duration-150 ' +
              'hover:bg-brand-500/[0.12] ' +
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400'
            }
          >
            <PlusIcon className="h-[18px] w-[18px] text-brand-400/90" />
            <span className="text-[10.5px] font-medium leading-none tracking-[0.01em]">Training</span>
          </motion.button>

          {/* Ruhetag eintragen */}
          <motion.button
            variants={qaItemV}
            whileTap={{ scale: 0.95 }}
            onClick={() => { onClose(); onOpenRestDay(); }}
            aria-label="Ruhetag eintragen"
            className={
              'flex min-h-[62px] flex-col items-center justify-center gap-2 rounded-2xl px-2 py-2.5 ' +
              'bg-white/[0.05] text-slate-400 transition-colors duration-150 ' +
              'hover:bg-white/[0.08] hover:text-slate-200 ' +
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400'
            }
          >
            <MoonIcon className="h-[18px] w-[18px]" />
            <span className="text-[10.5px] font-medium leading-none tracking-[0.01em]">Ruhetag</span>
          </motion.button>
        </motion.div>

        {/* ── Scrollable nav ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-2 pb-4" data-no-swipe>
          <motion.div initial="closed" animate={open ? 'open' : 'closed'} variants={navContainerV}>

            {/* HEUTE */}
            <NavSection label="Heute" first>
              <NavRow v={navItemV}>
                <DrawerNavItem
                  to="/"
                  label="Dashboard"
                  icon={<HomeIcon className="h-[18px] w-[18px]" />}
                  pathname={pathname}
                  onClose={onClose}
                />
              </NavRow>
              <NavRow v={navItemV}>
                <DrawerActionItem
                  label="Daily Live Challenge"
                  icon={<BoltIcon className="h-[18px] w-[18px]" />}
                  onClick={() => { onClose(); onOpenDailyChallenge(); }}
                  highlight
                  trailing={
                    challengeIsActive ? (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.25 }}
                      >
                        <LiveDot />
                      </motion.span>
                    ) : undefined
                  }
                />
              </NavRow>
              <NavRow v={navItemV}>
                <DrawerActionItem
                  label="Arena Feed"
                  icon={<img src="/arena-feed-icon.webp" alt="" className="h-[18px] w-[18px] object-contain opacity-75" />}
                  onClick={() => { onClose(); onOpenFeed(); }}
                  trailing={
                    <AnimatePresence>
                      {feedNewCount > 0 && (
                        <motion.span
                          key="feed-badge"
                          initial={{ opacity: 0, scale: 0.6 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.6 }}
                          transition={{ duration: 0.18 }}
                        >
                          <NavBadge count={feedNewCount} />
                        </motion.span>
                      )}
                    </AnimatePresence>
                  }
                />
              </NavRow>
            </NavSection>

            {/* COMMUNITY */}
            <NavSection label="Community">
              <NavRow v={navItemV}>
                <DrawerActionItem
                  label="Arena Rückblick"
                  icon={<RecapIcon className="h-[18px] w-[18px]" />}
                  onClick={() => { onClose(); onOpenRecap(); }}
                  trailing={
                    hasUnreadRecap ? (
                      <motion.span
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.18 }}
                      >
                        <UnreadDot />
                      </motion.span>
                    ) : undefined
                  }
                />
              </NavRow>
              <NavRow v={navItemV}>
                <DrawerNavItem
                  to="/global-stats"
                  label="Globale Statistiken"
                  icon={<GlobalStatsIcon />}
                  pathname={pathname}
                  onClose={onClose}
                />
              </NavRow>
            </NavSection>

            {/* PERSÖNLICH */}
            <NavSection label="Persönlich">
              <NavRow v={navItemV}>
                <DrawerNavItem
                  to="/achievements"
                  label="Erfolge"
                  icon={<TrophyIcon className="h-[18px] w-[18px]" />}
                  pathname={pathname}
                  onClose={onClose}
                />
              </NavRow>
              <NavRow v={navItemV}>
                <DrawerNavItem
                  to="/settings"
                  label="Einstellungen"
                  icon={<SettingsIcon className="h-[18px] w-[18px]" />}
                  pathname={pathname}
                  onClose={onClose}
                />
              </NavRow>
            </NavSection>

          </motion.div>
        </div>

        {/* ── Footer: sign out ────────────────────────────────────────────── */}
        <div
          className="mx-3 mt-2 pt-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
        >
          {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
          <button
            onClick={handleSignOut}
            className={
              'group flex w-full min-h-[48px] items-center gap-3 rounded-xl px-3 py-[10px] ' +
              'text-[13px] font-medium transition-colors duration-150 ' +
              'text-red-400/60 hover:bg-red-500/[0.07] hover:text-red-400/90 ' +
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400'
            }
          >
            <span className="shrink-0 opacity-50 transition-opacity duration-150 group-hover:opacity-85">
              <LogoutIcon className="h-[18px] w-[18px]" />
            </span>
            Abmelden
          </button>
        </div>

      </motion.div>
    </div>
  );
});
