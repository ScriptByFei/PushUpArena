import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import type { ComponentType, SVGProps } from 'react';
import { HomeIcon, PlusIcon, UsersIcon, TrophyIcon, UserIcon, CalendarIcon } from '@/components/ui/icons';
import { FABSheet } from '@/components/FABSheet';

// Badge-Slot: number = Zahl anzeigen, true = nur Punkt
function GlobalStatsFab({ badge }: { badge?: number | boolean }) {
  return (
    <NavLink to="/global-stats" aria-label="Globale Statistik" className="relative flex items-center justify-center transition active:scale-95">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Globus (Hintergrund) */}
        <g opacity="0.65" stroke="white" fill="none">
          <circle cx="12" cy="11" r="9" strokeWidth="1.2"/>
          <line x1="3" y1="11" x2="21" y2="11" strokeWidth="1.0"/>
          <line x1="12" y1="2" x2="12" y2="20" strokeWidth="1.0"/>
          <path d="M12 2 Q8 6 8 11 Q8 16 12 20" strokeWidth="1.0"/>
          <path d="M12 2 Q16 6 16 11 Q16 16 12 20" strokeWidth="1.0"/>
          <path d="M5 7 Q12 9 19 7" strokeWidth="0.8"/>
          <path d="M5 15 Q12 13 19 15" strokeWidth="0.8"/>
        </g>
        {/* Baseline */}
        <line x1="3" y1="21" x2="21" y2="21" stroke="white" strokeOpacity="0.65" strokeWidth="1.0" strokeLinecap="round"/>
        {/* Balken (Vordergrund) — aufsteigend von links nach rechts */}
        <rect x="4"  y="18" width="3" height="3"  rx="0.75" fill="#4f46e5"/>
        <rect x="8"  y="15" width="3" height="6"  rx="0.75" fill="#4f46e5"/>
        <rect x="12" y="12" width="3" height="9"  rx="0.75" fill="#4f46e5"/>
        <rect x="16" y="9"  width="3" height="12" rx="0.75" fill="#4f46e5"/>
      </svg>
      {/* Badge-Slot */}
      {badge && (
        <span className="absolute right-1.5 top-1.5 flex min-w-[14px] items-center justify-center rounded-full bg-brand-500 px-0.5 text-[9px] font-bold leading-[14px] text-white ring-1 ring-ink-900">
          {typeof badge === 'number' ? (badge > 9 ? '9+' : String(badge)) : ''}
        </span>
      )}
    </NavLink>
  );
}

interface NavItem {
  to: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const items: NavItem[] = [
  { to: '/', label: 'Start', Icon: HomeIcon },
  { to: '/friends', label: 'Freunde', Icon: UsersIcon },
  { to: '/leaderboard', label: 'Rangliste', Icon: TrophyIcon },
  { to: '/activity', label: 'Aktivität', Icon: CalendarIcon },
  { to: '/profile', label: 'Profil', Icon: UserIcon },
];

function SideItem({ to, label, Icon }: NavItem) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      aria-label={label}
      className="flex h-16 flex-col items-center justify-center gap-1"
    >
      {({ isActive }) => (
        <>
          <Icon className={`h-6 w-6 transition ${isActive ? 'text-brand-400' : 'text-slate-500'}`} />
          <span className={`text-[10px] font-medium ${isActive ? 'text-brand-300' : 'text-slate-500'}`}>
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}

export function BottomNav() {
  const [showSheet, setShowSheet] = useState(false);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-900"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* GlobalStats + FAB + Erfolge — kohärente schwebende Leiste */}
      <div className="absolute left-1/2 top-0 z-50 -translate-x-1/2 -translate-y-full pb-1.5">
        <div className="flex items-center gap-2 rounded-2xl border border-ink-700/30 bg-ink-900/20 px-2.5 py-1.5 shadow-lg backdrop-blur-sm">
          {/* Globale Statistik */}
          <GlobalStatsFab />

          {/* FAB */}
          <button
            aria-label="Eintragen"
            onClick={() => setShowSheet(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-glow ring-2 ring-ink-900 transition active:scale-95"
          >
            <PlusIcon className="h-4 w-4" />
          </button>

          {/* Erfolge-Trophy */}
          <NavLink to="/achievements" aria-label="Erfolge">
            {() => (
              <span className="flex items-center justify-center transition active:scale-95">
                <img src="/medals.png" alt="Erfolge" style={{ width: 52, height: 52 }} className="object-contain" />
              </span>
            )}
          </NavLink>
        </div>
      </div>

      {/* 4 Nav-Items gleichmäßig verteilt */}
      <div className="mx-auto grid max-w-md grid-cols-5 items-center px-2">
        {items.map((item) => (
          <SideItem key={item.to} {...item} />
        ))}
      </div>

      {/* Trainings-Auswahl Bottom Sheet */}
      {showSheet && <FABSheet onClose={() => setShowSheet(false)} />}
    </nav>
  );
}
