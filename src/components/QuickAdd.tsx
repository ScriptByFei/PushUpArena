import { useState } from 'react';
import { useWorkoutLogger } from '@/hooks/useWorkoutLogger';
import { useQuickAmounts } from '@/hooks/useQuickAmounts';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function QuickAdd({
  exerciseId,
  unit = 'Wdh.',
  onLogged,
}: {
  exerciseId?: string;
  unit?: string;
  onLogged?: (info: { amount: number; entryId: string }) => void;
}) {
  const { submit, submitting } = useWorkoutLogger(exerciseId, unit);
  const { amounts: presets } = useQuickAmounts();
  const [custom, setCustom] = useState('');
  const [active, setActive] = useState<number | null>(null);

  async function log(amount: number) {
    if (amount <= 0) return;
    setActive(amount);
    const { error, entry } = await submit({ amount });
    setActive(null);
    if (!error && entry) {
      setCustom('');
      onLogged?.({ amount, entryId: entry.id });
    }
  }

  return (
    <div>
      <div className="grid grid-cols-4 gap-2">
        {presets.filter(n => n > 0).map((n) => {
          const isActive = active === n;
          return (
            <button
              key={n}
              type="button"
              disabled={submitting}
              onClick={() => log(n)}
              className={`rounded-xl py-4 text-lg font-semibold transition active:scale-95 disabled:opacity-60 ${
                isActive
                  ? 'bg-brand-600 text-white shadow-glow ring-2 ring-brand-400'
                  : 'bg-ink-700 text-slate-100 hover:bg-ink-600'
              }`}
            >
              +{n}
            </button>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {/* Platzhalter – exakt 1 Spalte wie Preset-Buttons */}
        <div className="rounded-xl bg-ink-700" />
        {/* form mit contents: Kinder nehmen direkt am Grid teil */}
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            log(parseInt(custom, 10) || 0);
          }}
        >
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={100000}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Eigene Anzahl"
            className="col-span-2 text-center"
          />
          <Button type="submit" size="lg" loading={submitting && active === null} disabled={!custom}>
            Los
          </Button>
        </form>
      </div>
    </div>
  );
}
