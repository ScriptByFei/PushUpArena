import { Avatar } from '@/components/ui/Avatar';
import type { TopThreeEntry } from '@/hooks/useDailyRecap';

const heights = ['h-20', 'h-14', 'h-10'];
const medals = ['🥈', '🥇', '🥉'];
const textColors = ['text-slate-300', 'text-amber-300', 'text-orange-400'];
const delays = ['delay-[200ms]', 'delay-[0ms]', 'delay-[400ms]'];

export function PodiumDisplay({ entries }: { entries: TopThreeEntry[] }) {
  // Sortiere nach Rang (Gleichstand → Pushups absteigend), nimm erste 3 positional
  const sorted = [...entries].sort((a, b) => a.rank - b.rank || b.pushups - a.pushups);
  const [first, second, third] = sorted;
  // Anzeigereihenfolge: 2. – 1. – 3.
  const display = [second, first, third];
  const displayHeights = [heights[1], heights[0], heights[2]];

  return (
    <div>
      {/* Podest */}
      <div className="flex items-end justify-center gap-3">
        {display.map((entry, i) => (
          <div
            key={i}
            className={`flex flex-col items-center gap-1 opacity-0 animate-[fadeUp_0.4s_ease-out_forwards] ${delays[i]}`}
          >
            {entry ? (
              <>
                <Avatar url={entry.avatar} name={entry.name} size={40} className="ring-2 ring-ink-700" />
                <span className="text-[10px] text-slate-400 text-center max-w-[64px] truncate">{entry.name}</span>
                <span className={`text-xs font-bold ${textColors[i]}`}>{entry.pushups}</span>
              </>
            ) : (
              <div className="h-10 w-10 rounded-full bg-ink-700/50" />
            )}
            <div className={`w-[72px] ${displayHeights[i]} rounded-t-xl flex items-start justify-center pt-1.5 ${
              i === 1
                ? 'bg-gradient-to-b from-amber-500/30 to-amber-700/10 border border-amber-500/20'
                : i === 0
                  ? 'bg-gradient-to-b from-slate-500/20 to-slate-700/10 border border-slate-600/20'
                  : 'bg-gradient-to-b from-orange-600/20 to-orange-800/10 border border-orange-600/20'
            }`}>
              <span className="text-base">{medals[i]}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Detailzeilen */}
      <div className="mt-4 space-y-2">
        {sorted.map((entry, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="w-5 shrink-0 text-center text-sm font-bold text-slate-500">
              {entry.rank}.
            </span>
            <Avatar url={entry.avatar} name={entry.name} size={28} />
            <span className="flex-1 truncate text-sm text-slate-200">{entry.name}</span>
            <span className="shrink-0 text-sm font-bold text-brand-300">{entry.pushups}</span>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
