import { useEffect, useState, type ReactNode } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { LoadingState, ErrorState } from '@/components/ui/States';
import { useCalorieProfile } from '@/hooks/useCalorieProfile';
import { useTodayPushups } from '@/hooks/useTodayPushups';
import { useToast } from '@/context/ToastContext';
import { DEFICIT_KCAL, calculateCalorieResult, type DeficitLevel } from '@/lib/calorieCalculator';
import { validateCalorieForm, isCalorieFormValid, type CalorieFormValues } from '@/lib/calorieValidation';

const DEFICIT_OPTIONS: { level: DeficitLevel; label: string }[] = [
  { level: 'leicht', label: 'Leicht' },
  { level: 'moderat', label: 'Moderat' },
  { level: 'hoeher', label: 'Höher' },
];

function toInputValue(n: number | null): string {
  return n === null ? '' : String(n);
}

function parseField(raw: string): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function formatKcal(n: number): string {
  return Math.round(n).toLocaleString('de-DE');
}

function ResultTile({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="flex flex-col rounded-2xl border border-ink-700 bg-ink-800/70 p-3">
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-xl font-bold leading-tight text-slate-100">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export default function CalorieCalculator() {
  const { profile, loading, error, saveCalorieProfile } = useCalorieProfile();
  const { todayAmount: pushupsToday, loading: pushupsLoading } = useTodayPushups();
  const toast = useToast();

  const [age, setAge] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [averageDailySteps, setAverageDailySteps] = useState('');
  const [deficitLevel, setDeficitLevel] = useState<DeficitLevel>('moderat');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setAge(toInputValue(profile.age));
    setHeightCm(toInputValue(profile.height_cm));
    setWeightKg(toInputValue(profile.weight_kg));
    setAverageDailySteps(toInputValue(profile.average_daily_steps));
    setDeficitLevel(profile.calorie_deficit_target);
  }, [profile]);

  if (loading) return <LoadingState label="Lade deine Daten …" />;
  if (error) return <ErrorState message={error} />;

  const values: CalorieFormValues = {
    age: parseField(age),
    heightCm: parseField(heightCm),
    weightKg: parseField(weightKg),
    averageDailySteps: parseField(averageDailySteps),
  };
  const errors = touched ? validateCalorieForm(values) : {};
  const resultReady = isCalorieFormValid(values) && !pushupsLoading;

  const result = resultReady
    ? calculateCalorieResult({
        age: values.age!,
        heightCm: values.heightCm!,
        weightKg: values.weightKg!,
        averageDailySteps: values.averageDailySteps!,
        pushupsToday,
        deficitLevel,
      })
    : null;

  async function handleSave() {
    setTouched(true);
    const formErrors = validateCalorieForm(values);
    if (Object.keys(formErrors).length > 0) {
      toast.error('Bitte prüfe deine Eingaben.');
      return;
    }
    setSaving(true);
    const { error: saveError } = await saveCalorieProfile({
      age: values.age,
      height_cm: values.heightCm,
      weight_kg: values.weightKg,
      average_daily_steps: values.averageDailySteps,
      calorie_deficit_target: deficitLevel,
    });
    setSaving(false);
    if (saveError) toast.error(saveError);
    else toast.success('Daten gespeichert.');
  }

  return (
    <div className="space-y-3 pb-4">
      <Card>
        <CardTitle>Kaloriendefizit</CardTitle>
        <p className="mt-2 text-sm text-slate-400">
          Berechne deinen geschätzten täglichen Kalorienbedarf und dein Defizitziel.
        </p>
      </Card>

      <Card>
        <CardTitle>Persönliche Daten</CardTitle>
        <div className="mt-3 space-y-3">
          <Field label="Alter" error={errors.age}>
            <Input
              type="number"
              inputMode="numeric"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="z. B. 37"
            />
          </Field>
          <Field label="Größe (cm)" error={errors.heightCm}>
            <Input
              type="number"
              inputMode="numeric"
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              placeholder="z. B. 170"
            />
          </Field>
          <Field label="Gewicht (kg)" error={errors.weightKg}>
            <Input
              type="number"
              inputMode="decimal"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              placeholder="z. B. 75,0"
            />
          </Field>
          <Field label="Ø Schritte pro Tag" error={errors.averageDailySteps}>
            <Input
              type="number"
              inputMode="numeric"
              value={averageDailySteps}
              onChange={(e) => setAverageDailySteps(e.target.value)}
              placeholder="z. B. 10000"
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle>Defizit</CardTitle>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {DEFICIT_OPTIONS.map((opt) => (
            <button
              key={opt.level}
              type="button"
              onClick={() => setDeficitLevel(opt.level)}
              className={`rounded-xl border px-2 py-3 text-center transition ${
                deficitLevel === opt.level
                  ? 'border-brand-500 bg-brand-500/15 text-brand-200'
                  : 'border-ink-600 bg-ink-900/60 text-slate-300 hover:bg-ink-800'
              }`}
            >
              <div className="text-sm font-semibold">{opt.label}</div>
              <div className="mt-0.5 text-xs text-slate-400">{DEFICIT_KCAL[opt.level]} kcal</div>
            </button>
          ))}
        </div>
      </Card>

      {result && (
        <>
          {/* Wichtigstes Ergebnis — deutlich größer als der Rest */}
          <div className="rounded-3xl border border-brand-500/40 bg-gradient-to-b from-brand-500/15 to-ink-800/70 p-5 text-center shadow-lg">
            <div className="text-xs font-semibold uppercase tracking-wide text-brand-300">Kalorienziel</div>
            <div className="mt-1 flex items-baseline justify-center gap-1.5">
              <span className="text-5xl font-extrabold text-slate-50">{formatKcal(result.calorieTarget)}</span>
              <span className="text-base font-semibold text-slate-400">kcal</span>
            </div>
            <div className="mt-1 text-xs text-slate-400">pro Tag</div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <ResultTile label="Geschätzter Tagesverbrauch" value={`${formatKcal(result.totalDailyBurn)} kcal`} />
            <ResultTile label="Grundumsatz" value={`${formatKcal(result.bmr)} kcal`} />
            <ResultTile label="Aktivitätsniveau" value={result.activityLabel} />
            <ResultTile label="Erwartete Abnahme" value={`ca. ${result.weeklyWeightLossKg.toLocaleString('de-DE', { maximumFractionDigits: 2 })} kg`} sub="pro Woche" />
            <ResultTile label="Push-ups heute" value={pushupsToday} />
            <ResultTile label="Push-up-Verbrauch" value={`≈ ${result.pushupCalories} kcal`} sub="geschätzter Verbrauch" />
          </div>
        </>
      )}

      <Button fullWidth loading={saving} onClick={() => void handleSave()}>
        Daten speichern
      </Button>
    </div>
  );
}
