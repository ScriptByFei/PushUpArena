import { useEffect, useState } from 'react';

interface ProgressBarProps {
  value: number;
  max: number;
  label?: string;
  /** Tailwind-Gradient-Klassen für den Balken */
  colorClass?: string;
  showValues?: boolean;
}

export function ProgressBar({
  value,
  max,
  label,
  colorClass = 'from-brand-500 to-brand-400',
  showValues = true,
}: ProgressBarProps) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  const pct = Math.round(ratio * 100);
  const done = max > 0 && value >= max;

  // Animate bar from 0 on mount / whenever value changes
  const [displayPct, setDisplayPct] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDisplayPct(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  return (
    <div>
      {(label || showValues) && (
        <div className="mb-1.5 flex items-baseline justify-between text-sm">
          {label && <span className="text-slate-300">{label}</span>}
          {showValues && (
            <span className={`tabular-nums ${done ? 'font-semibold text-emerald-400' : 'text-slate-400'}`}>
              {value} / {max}
              {done && <span className="ml-1.5 text-emerald-400 font-bold">✓</span>}
            </span>
          )}
        </div>
      )}
      <div className="h-3.5 w-full overflow-hidden rounded-full bg-ink-700">
        <div
          role="progressbar"
          aria-valuenow={value}
          aria-valuemax={max}
          className={`h-full rounded-full bg-gradient-to-r transition-all duration-700 ${
            done ? 'from-emerald-500 to-emerald-400' : colorClass
          }`}
          style={{ width: `${displayPct}%` }}
        />
      </div>
    </div>
  );
}
