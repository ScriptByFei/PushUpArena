import { NavLink } from 'react-router-dom';
import type { ComponentType, SVGProps } from 'react';
import { HomeIcon, PlusIcon, UsersIcon, TrophyIcon, UserIcon, MedalIcon } from '@/components/ui/icons';

interface NavItem {
  to: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const items: NavItem[] = [
  { to: '/', label: 'Start', Icon: HomeIcon },
  { to: '/friends', label: 'Freunde', Icon: UsersIcon },
  { to: '/achievements', label: 'Erfolge', Icon: MedalIcon },
  { to: '/leaderboard', label: 'Rangliste', Icon: TrophyIcon },
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
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-900"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* FAB — absolut zentriert, weiter nach oben versetzt */}
      <div className="absolute left-1/2 top-0 z-50 -translate-x-1/2 -translate-y-full">
        <NavLink to="/track" aria-label="Eintragen">
          {({ isActive }) => (
            <span
              className={`flex h-11 w-11 items-center justify-center rounded-full text-white shadow-glow ring-2 ring-ink-900 transition active:scale-95 ${
                isActive ? 'bg-brand-500' : 'bg-gradient-to-br from-brand-400 to-brand-600'
              }`}
            >
              <PlusIcon className="h-5 w-5" />
            </span>
          )}
        </NavLink>
      </div>

      {/* 5 Nav-Items gleichmäßig verteilt */}
      <div className="mx-auto grid max-w-md grid-cols-5 items-center px-2">
        {items.map((item) => (
          <SideItem key={item.to} {...item} />
        ))}
      </div>
    </nav>
  );
}
