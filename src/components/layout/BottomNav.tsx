import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import type { ComponentType, SVGProps } from 'react';
import { HomeIcon, PlusIcon, UsersIcon, TrophyIcon, UserIcon, CalendarIcon } from '@/components/ui/icons';
import { FABSheet } from '@/components/FABSheet';

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
      {/* FAB + Erfolge-Trophy — zusammen zentriert, über der Nav-Leiste */}
      <div className="absolute left-1/2 top-0 z-50 -translate-x-1/2 -translate-y-full flex items-end gap-2 pb-1">
        {/* FAB */}
        <button
          aria-label="Eintragen"
          onClick={() => setShowSheet(true)}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-glow ring-2 ring-ink-900 transition active:scale-95"
        >
          <PlusIcon className="h-5 w-5" />
        </button>

        {/* Erfolge-Trophy */}
        <NavLink to="/achievements" aria-label="Erfolge">
          {() => (
            <span className="mb-[1px] flex items-center justify-center opacity-100 transition active:scale-95">
              <img src="/medals.png" alt="Erfolge" className="h-9 w-9 object-contain" />
            </span>
          )}
        </NavLink>
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
