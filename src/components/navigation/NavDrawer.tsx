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
  /** Set panel position directly (no animation) — used while drag is in progress. */
  setDragX: (x: number) => void;
  /** Return current panel pixel width. */
  getWidth: () => number;
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
  /** Badge signals — all optional; default to falsy / 0 */
  challengeIsActive?: boolean;
  feedNewCount?: number;
  hasUnreadRecap?: boolean;
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
  trailing,
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
      onClick={() => {
        onClose();
        if (!active) navigate(to, { replace: true });
      }}
      className={
        'group flex w-full min-h-[48px] items-center gap-3 rounded-xl px-3 py-[9px] ' +
        'text-[13.5px] font-medium transition-colors duration-150 ' +
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400 ' +
        (active
          ? 'bg-brand-600/10 text-brand-300'
          : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-200')
      }
    >
      <span
        className={
          'shrink-0 transition-opacity duration-150 ' +
          (active ? 'opacity-100' : 'opacity-50 group-hover:opacity-80')
        }
      >
        {icon}
      </span>
      <span className="flex-1 truncate text-left">{label}</span>
      {trailing}
    </button>
  );
}

function DrawerActionItem({
  label,
  icon,
  onClick,
  trailing,
  highlight = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  trailing?: React.ReactNode;
  /** Slightly elevated visual weight — used for the Daily Live Challenge item. */
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'group flex w-full min-h-[48px] items-center gap-3 rounded-xl px-3 py-[9px] ' +
        'text-[13.5px] font-medium transition-colors duration-150 ' +
        (highlight
          ? 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200 '
          : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-200 ') +
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400'
      }
    >
      <span className={
        'shrink-0 transition-opacity duration-150 ' +
        (highlight ? 'opacity-[0.65] group-hover:opacity-90' : 'opacity-50 group-hover:opacity-80')
      }>
        {icon}
      </span>
      <span className="flex-1 truncate text-left">{label}</span>
      {trailing}
    </button>
  );
}

/* ---------- Badge helpers ---------- */

/** Small count pill — e.g. "3" or "9+" */
function NavBadge({ count }: { count: number }) {
  return (
    <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-500/15 px-1.5 text-[10px] font-semibold tabular-nums text-brand-400">
      {count > 9 ? '9+' : count}
    </span>
  );
}

/** Pulsing red dot — live challenge indicator */
function LiveDot() {
  return (
    <span className="relative flex h-[7px] w-[7px]">
      <span
        className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-50"
        style={{ animationDuration: '2.5s' }}
      />
      <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-red-400/80" />
    </span>
  );
}

/** Static dot — unread recap indicator */
function UnreadDot() {
  return <span className="h-[7px] w-[7px] rounded-full bg-brand-400/50" />;
}

/** Section label + children wrapper. `first` omits the extra top padding. */
function NavSection({ label, children, first = false }: {
  label: string;
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <section aria-label={label}>
      <p className={
        'px-3 pb-1 text-[9.5px] font-medium uppercase tracking-[0.13em] text-slate-600/80 ' +
        (first ? 'pt-4' : 'pt-5')
      }>
        {label}
      </p>
      {children}
    </section>
  );
}

/** Stagger + tap-scale wrapper for each nav row. Receives variants from the parent. */
function NavRow({ children, v }: { children: React.ReactNode; v: Variants }) {
  return (
    <motion.div variants={v} whileTap={{ scale: 0.97 }} className="rounded-xl">
      {children}
    </motion.div>
  );
}

function GlobalStatsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
  {
    open, onClose, onOpenFeed, onOpenRecap, onOpenDailyChallenge,
    challengeIsActive = false, feedNewCount = 0, hasUnreadRecap = false,
  },
  ref,
) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { profile } = useProfile();
  const { pathname } = useLocation();
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const prefersReduced = useReducedMotion();
  // Store in ref so stable callbacks can read the latest value
  const prefersReducedRef = useRef(prefersReduced);
  prefersReducedRef.current = prefersReduced;

  // ─── Nav stagger variants ────────────────────────────────────────────────────
  // Container orchestrates stagger; items slide in from x:-6 with fade.
  // On close the items snap back instantly (duration:0) — panel slides out anyway.
  const navContainerV = {
    open:   { transition: prefersReduced ? {} : { staggerChildren: 0.025, delayChildren: 0.07 } },
    closed: {},
  };
  const navItemV = {
    open:   { opacity: 1, x: 0,  transition: { duration: prefersReduced ? 0 : 0.2, ease: 'easeOut' as const } },
    closed: { opacity: 0, x: -6, transition: { duration: 0 } },
  };

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
  const getSpring = () =>
    prefersReducedRef.current
      ? { duration: 0 }
      : { type: 'spring' as const, stiffness: 350, damping: 35, mass: 0.8 };

  // Store the running animation so we can cancel it before a direct setDragX.
  const animCtrl = useRef<ReturnType<typeof animate> | null>(null);

  // ─── Imperative handle exposed to AppLayout ──────────────────────────────────
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
    /** Drive the panel with a finger — cancels any running spring first. */
    setDragX(x: number) {
      animCtrl.current?.stop();
      panelX.set(x);
    },
    getWidth() {
      return panelRef.current?.offsetWidth ?? 340;
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
    if (pathname !== '/profile') navigate('/profile', { replace: true });
  }, [onClose, navigate, pathname]);

  const displayName = profile?.display_name ?? profile?.username ?? 'Profil';
  const avatarUrl = profile?.avatar_url;

  // ─── Render ─────────────────────────────────────────────────────────────────
  //
  // Both backdrop and panel live inside a single `position:fixed; inset:0;
  // overflow:hidden` shell. Because the panel is `position:absolute` (not
  // fixed) inside this shell, the shell's `overflow:hidden` actually clips it —
  // so when the panel is at translateX(-340px) it is fully clipped and iOS
  // WebKit no longer sees any content to the left of the viewport.
  // Without this wrapper, `position:fixed` elements escape body `overflow:hidden`
  // and iOS allows horizontal rubber-band drag to reveal them.
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 45,
        overflow: 'hidden',
        pointerEvents: 'none', // children that need events override individually
      }}
    >
      {/* Backdrop */}
      <div
        ref={backdropRef}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
        }}
        onClick={onClose}
        aria-hidden="true"
      >
        <motion.div className="h-full w-full bg-black/60" style={{ opacity: overlayOpacity }} />
      </div>

      {/* Drawer panel — position:absolute so it is clipped by the wrapper above */}
      <motion.div
        ref={panelRef}
        id="nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          x: panelX,
          visibility: 'hidden',  // initial; motionValueEvent updates this
          pointerEvents: 'none', // initial; motionValueEvent updates this
          paddingTop: 'max(16px, env(safe-area-inset-top))',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        }}
        className={
          'z-[1] flex w-[84vw] max-w-[340px] flex-col ' +
          'rounded-r-2xl border-r border-ink-700 bg-ink-900 shadow-2xl'
        }
      >
        {/* ── Profile header — minimal ────────────────────────────────────────
             Avatar + username only. ~80px tall. No stats, no card.
             Entrance: avatar fades in, name slides from left (220ms).      */}
        <div
          className="flex items-center gap-3 px-4 pb-4 pt-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          {/* Avatar — fades in on open */}
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
              style={{ filter: 'drop-shadow(0 1px 8px rgba(0,0,0,0.45))' }}
            >
              <Avatar
                url={avatarUrl}
                name={displayName}
                size={56}
                className="ring-[1.5px] ring-brand-500/50"
              />
            </button>
          </motion.div>

          {/* Name + greeting — slides in from left */}
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
              'min-w-0 flex-1 text-left transition active:opacity-70 ' +
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400 ' +
              'rounded-lg'
            }
          >
            <p className="truncate text-[16px] font-semibold leading-tight text-slate-100">
              {displayName}
            </p>
            <p className="mt-0.5 text-[12px] leading-snug text-slate-500">
              Bereit für dein Training?
            </p>
          </motion.button>

          {/* Close button — circular, subtle */}
          <button
            onClick={onClose}
            aria-label="Navigation schließen"
            className={
              'shrink-0 grid place-items-center rounded-full transition ' +
              'bg-white/[0.06] text-slate-400 ' +
              'hover:bg-white/[0.11] hover:text-slate-200 ' +
              'active:bg-white/[0.15] ' +
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400'
            }
            style={{ width: 32, height: 32 }}
          >
            <XIcon className="h-[15px] w-[15px]" />
          </button>
        </div>

        {/* Scrollable nav — data-no-swipe prevents page-swipe detection inside list */}
        <div className="flex-1 overflow-y-auto px-2 pb-4" data-no-swipe>
          {/* Stagger container — propagates 'open'/'closed' variant to children */}
          <motion.div initial="closed" animate={open ? 'open' : 'closed'} variants={navContainerV}>

            {/* ── HEUTE ──────────────────────────────────────────────────────── */}
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
                  icon={<img src="/arena-feed-icon.webp" alt="" className="h-[18px] w-[18px] object-contain opacity-80" />}
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

            {/* Divider */}
            <div className="mx-3 my-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />

            {/* ── COMMUNITY ──────────────────────────────────────────────────── */}
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

            {/* Divider */}
            <div className="mx-3 my-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />

            {/* ── PERSÖNLICH ─────────────────────────────────────────────────── */}
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

        {/* Footer: sign out */}
        <div
          className="mx-4 mt-1 pt-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
          <button
            onClick={handleSignOut}
            className={
              'group flex w-full min-h-[48px] items-center gap-3 rounded-xl px-3 py-[9px] ' +
              'text-[13.5px] font-medium transition-colors duration-150 ' +
              'text-red-400/70 hover:bg-red-500/[0.08] hover:text-red-400 ' +
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400'
            }
          >
            <span className="shrink-0 opacity-60 transition-opacity duration-150 group-hover:opacity-90">
              <LogoutIcon className="h-[18px] w-[18px]" />
            </span>
            Abmelden
          </button>
        </div>
      </motion.div>
    </div>
  );
});
