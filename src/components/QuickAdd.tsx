import { useState } from 'react';
import { useWorkoutLogger } from '@/hooks/useWorkoutLogger';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const PRESETS = [5, 10, 20, 25];

export function QuickAdd({
  exerciseId,
  unit = 'Wdh.',
  onLogged,
}: {
  exerciseId?: string;
  unit?: string;
  onLogged?: () => void;
}) {
  const { submit, submitting } = useWorkoutLogger(exerciseId, unit);
  const [custom, setCustom] = useState('');

  async function log(amount: number) {
    if (amount <= 0) return;
    const { error } = await submit({ amount });
    if (!error) {
      setCustom('');
      onLogged?.();
    }
  }

  return (
    <div>
      <div className="grid grid-cols-4 gap-2">
        {PRESETS.map((n) => (
          <Button
            key={n}
            variant="secondary"
            size="lg"
            disabled={submitting}
            onClick={() => log(n)}
            className="flex-col !py-4 text-lg"
          >
            +{n}
          </Button>
        ))}
      </div>
      <form
        className="mt-3 flex gap-2"
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
          className="text-center"
        />
        <Button type="submit" size="lg" loading={submitting} disabled={!custom}>
          Los
        </Button>
      </form>
    </div>
  );
}
