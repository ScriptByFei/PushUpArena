import { Avatar } from '@/components/ui/Avatar';
import type { TopThreeEntry } from '@/hooks/useDailyRecap';

// Display order: 2nd (left) | 1st (center) | 3rd (right)
const PODEST_H    = ['h-[50px]', 'h-[74px]', 'h-[38px]'];
const MEDAL_EMOJI = ['🥈', '🥇', '🥉'];
const AVATAR_SIZE = [34, 44, 30];
const NAME_COL    = ['text-slate-400', 'text-amber-200', 'text-orange-300'];
const VAL_COL     = ['text-slate-300', 'text-amber-300', 'text-orange-400'];
const RANK_COL    = ['text-slate-400', 'text-amber-400', 'text-orange-400'];

const PODEST_STYLE = [
  'bg-gradient-to-b from-slate-500/20 to-slate-700/6 border border-slate-500/16',
  'bg-gradient-to-b from-amber-400/36 to-amber-700/10 border border-amber-500/28',
  'bg-gradient-to-b from-orange-600/16 to-orange-800/6 border border-orange-600/12',
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
              animation: 'podFadeUp 0.38s ease-out forwards',
              animationDelay: `${[90, 0, 180][i]}ms`,
              opacity: 0,
            }}
          >
            {entry ? (
              <>
                {/* Avatar — 1st place gets pulsing ring */}
                <div className={i === 1 ? 'pod-ring-wrap' : undefined}>
                  <Avatar
                    url={entry.avatar}
                    name={entry.name}
                    size={AVATAR_SIZE[i]}
                    className={
                      i === 1
                        ? 'ring-2 ring-amber-400/70 ring-offset-2 ring-offset-ink-800'
                        : 'ring-1 ring-ink-600/80'
                    }
                  />
                </div>
                <span className={`mt-1 max-w-[72px] truncate text-center text-[10px] font-medium ${NAME_COL[i]}`}>
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
              className={`mt-1.5 flex w-[72px] items-start justify-center rounded-t-lg pt-1.5 ${PODEST_H[i]} ${PODEST_STYLE[i]}`}
              style={
                i === 1
                  ? { boxShadow: '0 0 28px rgba(245,158,11,0.22), 0 -4px 20px rgba(245,158,11,0.12)' }
                  : undefined
              }
            >
              <span
                className={i === 1 ? 'text-xl gold-shimmer' : 'text-base'}
              >
                {MEDAL_EMOJI[i]}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Detailzeilen ──────────────────────── */}
      <div className="mt-3 space-y-1.5 border-t border-ink-700/40 pt-3">
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
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Gold medal subtle shimmer */
        @keyframes goldShimmer {
          0%,  80%, 100% { filter: brightness(1)   drop-shadow(0 0 0px rgba(251,191,36,0)); }
          40%             { filter: brightness(1.25) drop-shadow(0 0 6px rgba(251,191,36,0.7)); }
        }
        .gold-shimmer {
          display: inline-block;
          animation: goldShimmer 6s ease-in-out 1s infinite;
        }

        /* 1st-place avatar pulsing ring */
        @keyframes podRingPulse {
          0%,  100% { box-shadow: 0 0 0 0   rgba(245,158,11,0);    }
          50%        { box-shadow: 0 0 0 5px rgba(245,158,11,0.22); }
        }
        .pod-ring-wrap {
          border-radius: 9999px;
          animation: podRingPulse 3.5s ease-in-out 0.8s infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.01ms !important; animation-delay: 0ms !important; }
        }
      `}</style>
    </div>
  );
}
