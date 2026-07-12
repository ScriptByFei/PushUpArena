import { Avatar } from '@/components/ui/Avatar';
import type { TopThreeEntry } from '@/hooks/useDailyRecap';

// Display order: 2nd (left) | 1st (center) | 3rd (right)
const PODEST_H    = ['h-[50px]', 'h-[70px]', 'h-[38px]'];
const MEDAL_EMOJI = ['🥈', '🥇', '🥉'];
const AVATAR_SIZE = [34, 42, 30];
const NAME_COL    = ['text-slate-400', 'text-amber-200', 'text-orange-300'];
const VAL_COL     = ['text-slate-300', 'text-amber-300', 'text-orange-400'];
const RANK_COL    = ['text-amber-400', 'text-slate-400', 'text-orange-400'];

const PODEST_STYLE = [
  'bg-gradient-to-b from-slate-500/22 to-slate-700/8 border border-slate-500/18',
  'bg-gradient-to-b from-amber-400/32 to-amber-700/8 border border-amber-500/22',
  'bg-gradient-to-b from-orange-600/18 to-orange-800/8 border border-orange-600/14',
];

export function PodiumDisplay({ entries }: { entries: TopThreeEntry[] }) {
  const sorted = [...entries].sort((a, b) => a.rank - b.rank || b.pushups - a.pushups);
  const [first, second, third] = sorted;
  const display = [second, first, third];

  return (
    <div>
      {/* ── Podestbereich ─────────────────────── */}
      <div className="flex items-end justify-center gap-2">
        {display.map((entry, i) => (
          <div
            key={i}
            className="flex flex-col items-center gap-0.5"
            style={{
              animation: 'podFadeUp 0.35s ease-out forwards',
              animationDelay: `${[80, 0, 160][i]}ms`,
              opacity: 0,
            }}
          >
            {entry ? (
              <>
                <Avatar
                  url={entry.avatar}
                  name={entry.name}
                  size={AVATAR_SIZE[i]}
                  className={
                    i === 1
                      ? 'ring-2 ring-amber-400/55 ring-offset-1 ring-offset-ink-800'
                      : 'ring-1 ring-ink-600'
                  }
                />
                <span className={`mt-0.5 max-w-[68px] truncate text-center text-[10px] font-medium ${NAME_COL[i]}`}>
                  {entry.name}
                </span>
                <span className={`tabular-nums text-[11px] font-extrabold ${VAL_COL[i]}`}>
                  {entry.pushups}
                </span>
              </>
            ) : (
              <div className="h-9 w-9 rounded-full bg-ink-700/40" />
            )}

            {/* Podestblock */}
            <div
              className={`mt-1 flex w-[70px] items-start justify-center rounded-t-lg pt-1.5 ${PODEST_H[i]} ${PODEST_STYLE[i]} ${
                i === 1 ? 'shadow-[0_0_18px_rgba(245,158,11,0.14)]' : ''
              }`}
            >
              <span className={i === 1 ? 'text-xl' : 'text-base'}>{MEDAL_EMOJI[i]}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Detailzeilen ──────────────────────── */}
      <div className="mt-2.5 space-y-1 border-t border-ink-700/50 pt-2.5">
        {sorted.map((entry, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={`w-4 shrink-0 text-center text-[10px] font-bold ${RANK_COL[i]}`}>
              {i + 1}.
            </span>
            <Avatar url={entry.avatar} name={entry.name} size={22} />
            <span className="min-w-0 flex-1 truncate text-xs text-slate-300">{entry.name}</span>
            <span className="shrink-0 tabular-nums text-xs font-bold text-brand-300">
              {entry.pushups}
            </span>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes podFadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.01ms !important; animation-delay: 0ms !important; }
        }
      `}</style>
    </div>
  );
}
