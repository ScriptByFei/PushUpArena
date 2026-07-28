/** Eingabe-Limits für den Kaloriendefizit-Rechner. */
export const CALORIE_LIMITS = {
  age: { min: 16, max: 100 },
  heightCm: { min: 120, max: 230 },
  weightKg: { min: 35, max: 250 },
  averageDailySteps: { min: 0, max: 100000 },
} as const;

export interface CalorieFormValues {
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  averageDailySteps: number | null;
}

export type CalorieFormErrors = Partial<Record<keyof CalorieFormValues, string>>;

function isValidNumber(n: number | null): n is number {
  return n !== null && Number.isFinite(n) && n >= 0;
}

/** Validiert die persönlichen Eingaben. Gibt Fehlermeldungen pro Feld zurück. */
export function validateCalorieForm(values: CalorieFormValues): CalorieFormErrors {
  const errors: CalorieFormErrors = {};

  if (!isValidNumber(values.age) || values.age < CALORIE_LIMITS.age.min || values.age > CALORIE_LIMITS.age.max) {
    errors.age = `Alter zwischen ${CALORIE_LIMITS.age.min} und ${CALORIE_LIMITS.age.max}.`;
  }
  if (
    !isValidNumber(values.heightCm) ||
    values.heightCm < CALORIE_LIMITS.heightCm.min ||
    values.heightCm > CALORIE_LIMITS.heightCm.max
  ) {
    errors.heightCm = `Größe zwischen ${CALORIE_LIMITS.heightCm.min} und ${CALORIE_LIMITS.heightCm.max} cm.`;
  }
  if (
    !isValidNumber(values.weightKg) ||
    values.weightKg < CALORIE_LIMITS.weightKg.min ||
    values.weightKg > CALORIE_LIMITS.weightKg.max
  ) {
    errors.weightKg = `Gewicht zwischen ${CALORIE_LIMITS.weightKg.min} und ${CALORIE_LIMITS.weightKg.max} kg.`;
  }
  if (
    !isValidNumber(values.averageDailySteps) ||
    values.averageDailySteps < CALORIE_LIMITS.averageDailySteps.min ||
    values.averageDailySteps > CALORIE_LIMITS.averageDailySteps.max
  ) {
    errors.averageDailySteps = `Schritte zwischen ${CALORIE_LIMITS.averageDailySteps.min} und ${CALORIE_LIMITS.averageDailySteps.max}.`;
  }

  return errors;
}

export function isCalorieFormValid(values: CalorieFormValues): boolean {
  return Object.keys(validateCalorieForm(values)).length === 0;
}
