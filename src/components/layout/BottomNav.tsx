import { NavLink } from 'react-router-dom';
import type { ComponentType, SVGProps } from 'react';
import { HomeIcon, PlusIcon, UsersIcon, TrophyIcon, UserIcon } from '@/components/ui/icons';

interface NavItem {
  to: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  center?: boolean;
}

const items: NavItem[] = [
  { to: '/', label: 'Start', Icon: HomeIcon },
  { to: '/friends', label: 'Freunde', Icon: UsersIcon },
  { to: '/track', label: 'Eintragen', Icon: PlusIcon, center: true },
  { to: '/leaderboard', label: 'Rangliste', Icon: TrophyIcon },
  { to: '/profile', label: 'Profil', Icon: UserIcon },
];

export function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-900/90 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-md items-center justify-around px-2">
        {items.map(({ to, label, Icon, center }) =>
          center ? (
            <NavLink
              key={to}
              to={to}
              aria-label={label}
              className="-mt-6 flex flex-col items-center"
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`flex h-14 w-14 items-center justify-center rounded-full shadow-glow transition ${
                      isActive ? 'bg-brand-500' : 'bg-brand-600'
                    }`}
                  >
                    <Icon className="h-7 w-7 text-white" />
                  </span>
                  <span className="mt-0.5 text-[10px] font-medium text-slate-400">{label}</span>
                </>
              )}
            </NavLink>
          ) : (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              aria-label={label}
              className="flex flex-1 flex-col items-center gap-1 py-2.5"
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={`h-6 w-6 transition ${
                      isActive ? 'text-brand-400' : 'text-slate-500'
                    }`}
                  />
                  <span
                    className={`text-[10px] font-medium ${
                      isActive ? 'text-brand-300' : 'text-slate-500'
                    }`}
                  >
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ),
        )}
      </div>
    </nav>
  );
}
