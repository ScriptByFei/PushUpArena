/**
 * Kaloriendefizit-Rechner — reine Berechnungsfunktionen.
 *
 * Annahme: Die App wird aktuell ausschließlich von Männern genutzt, daher wird
 * intern fest die männliche Mifflin-St-Jeor-Formel verwendet (kein Geschlecht-Input).
 *
 * Schritte bestimmen automatisch den Aktivitätsfaktor — es gibt bewusst KEIN
 * separates Aktivitätslevel-Feld, sonst würden Schritte doppelt berücksichtigt.
 */

export type DeficitLevel = 'leicht' | 'moderat' | 'hoeher';

export const DEFICIT_KCAL: Record<DeficitLevel, number> = {
  leicht: 250,
  moderat: 500,
  hoeher: 750,
};

export const DEFAULT_DEFICIT_LEVEL: DeficitLevel = 'moderat';

/** kcal, um ca. 1 kg Körperfett zu verlieren (grobe Schätzung). */
const KCAL_PER_KG_FAT = 7700;

/** kcal pro kg Körpergewicht pro Push-up (sehr konservative Schätzung). */
const PUSHUP_KCAL_FACTOR = 0.0038;

export interface ActivityBracket {
  label: string;
  minSteps: number;
  factor: number;
}

// Aufsteigend sortiert — Version 1 laut Produktvorgabe.
const ACTIVITY_BRACKETS: ActivityBracket[] = [
  { label: 'Sitzend', minSteps: 0, factor: 1.2 },
  { label: 'Leicht aktiv', minSteps: 4000, factor: 1.3 },
  { label: 'Aktiv', minSteps: 7000, factor: 1.4 },
  { label: 'Sehr aktiv', minSteps: 10000, factor: 1.5 },
  { label: 'Hoch aktiv', minSteps: 13000, factor: 1.6 },
  { label: 'Extrem aktiv', minSteps: 16000, factor: 1.7 },
];

/** Grundumsatz (BMR) nach Mifflin-St-Jeor, männliche Formel. */
export function calculateBMR(weightKg: number, heightCm: number, age: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
}

/** Aktivitätsstufe (Label + Faktor) anhand der durchschnittlichen Tagesschritte. */
export function getActivityBracket(averageDailySteps: number): ActivityBracket {
  let bracket = ACTIVITY_BRACKETS[0];
  for (const b of ACTIVITY_BRACKETS) {
    if (averageDailySteps >= b.minSteps) bracket = b;
  }
  return bracket;
}

/** TDEE-Basis = BMR × Aktivitätsfaktor (noch ohne Push-up-Anteil). */
export function calculateTDEEBase(bmr: number, activityFactor: number): number {
  return bmr * activityFactor;
}

/**
 * Geschätzter Kalorienverbrauch der heutigen Push-ups.
 * Bewusst konservativ, nur als kleiner zusätzlicher Aktivitätsanteil gedacht.
 */
export function calculatePushupCalories(weightKg: number, pushupsToday: number): number {
  return Math.round(weightKg * pushupsToday * PUSHUP_KCAL_FACTOR);
}

/** Gesamter geschätzter Tagesverbrauch = TDEE-Basis + geschätzte Push-up-Kalorien. */
export function calculateTotalDailyBurn(tdeeBase: number, pushupCalories: number): number {
  return tdeeBase + pushupCalories;
}

/** Kalorienziel = Tagesverbrauch − gewähltes Defizit. */
export function calculateCalorieTarget(totalDailyBurn: number, deficitLevel: DeficitLevel): number {
  return totalDailyBurn - DEFICIT_KCAL[deficitLevel];
}

/** Geschätzte Gewichtsabnahme pro Woche in kg, basierend auf 7.700 kcal ≈ 1 kg Körperfett. */
export function estimateWeeklyWeightLossKg(deficitLevel: DeficitLevel): number {
  return (DEFICIT_KCAL[deficitLevel] * 7) / KCAL_PER_KG_FAT;
}

export interface CalorieCalculatorInput {
  age: number;
  heightCm: number;
  weightKg: number;
  averageDailySteps: number;
  pushupsToday: number;
  deficitLevel: DeficitLevel;
}

export interface CalorieCalculatorResult {
  bmr: number;
  activityLabel: string;
  activityFactor: number;
  tdeeBase: number;
  pushupCalories: number;
  totalDailyBurn: number;
  calorieTarget: number;
  weeklyWeightLossKg: number;
}

/** Führt die komplette Berechnungskette in einem Schritt aus. */
export function calculateCalorieResult(input: CalorieCalculatorInput): CalorieCalculatorResult {
  const bmr = calculateBMR(input.weightKg, input.heightCm, input.age);
  const { label: activityLabel, factor: activityFactor } = getActivityBracket(input.averageDailySteps);
  const tdeeBase = calculateTDEEBase(bmr, activityFactor);
  const pushupCalories = calculatePushupCalories(input.weightKg, input.pushupsToday);
  const totalDailyBurn = calculateTotalDailyBurn(tdeeBase, pushupCalories);
  const calorieTarget = calculateCalorieTarget(totalDailyBurn, input.deficitLevel);
  const weeklyWeightLossKg = estimateWeeklyWeightLossKg(input.deficitLevel);

  return {
    bmr,
    activityLabel,
    activityFactor,
    tdeeBase,
    pushupCalories,
    totalDailyBurn,
    calorieTarget,
    weeklyWeightLossKg,
  };
}
