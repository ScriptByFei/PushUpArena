/**
 * Streak-Berechnung mit Ruhetag-Regeln.
 *
 * Regeln:
 *  1. Pro Woche: max. 2 Ruhetage (ISO-Woche Mo–So)
 *  2. Zwei aufeinanderfolgende Ruhetage brechen die Streak
 *  3. Erlaubte Ruhetage zählen als Streak-erhaltend (werden mitgezählt)
 *  4. Streak = 0 wenn kein Trainingstag im gültigen Chain
 *
 * Alle Datumsoperationen rein kalendarisch (YYYY-MM-DD strings).
 */

export type DayType = 'training' | 'rest';

/** Verschiebt YYYY-MM-DD um n Tage */
export function shiftDate(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d + n).toLocaleDateString('sv-SE');
}

/** Wochenschlüssel = ISO-Montag des Datums als YYYY-MM-DD */
export function getWeekKey(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // 0=So
  const daysSinceMon = dow === 0 ? 6 : dow - 1;
  return new Date(y, m - 1, d - daysSinceMon).toLocaleDateString('sv-SE');
}

export function getDayType(amount: number): DayType {
  return amount > 0 ? 'training' : 'rest';
}

export interface RestDayInfo {
  restDaysThisWeek: number;       // Ruhetage in akt. ISO-Woche (bis heute)
  isRestDayToday: boolean;
  isRestDayYesterday: boolean;
  consecutiveRestToday: number;   // 0 = Training heute; 1 = 1 Ruhetag; 2+ = 2 aufeinanderfolgend
}

export interface StreakResult {
  currentStreak: number;
  longestStreak: number;
  restDayInfo: RestDayInfo;
}

/** Baut Map: weekKey → Anzahl Ruhetage (rückwärts von today, maximal 365 Tage) */
function buildWeekRestCounts(byDay: Map<string, number>, today: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 365; i >= 0; i--) {
    const d = shiftDate(today, -i);
    if (getDayType(byDay.get(d) ?? 0) === 'rest') {
      const wk = getWeekKey(d);
      counts.set(wk, (counts.get(wk) ?? 0) + 1);
    }
  }
  return counts;
}

/** Aktuelle Streak, rückwärts von today */
export function calculateCurrentStreak(
  byDay: Map<string, number>,
  today: string,
  weekRestCounts: Map<string, number>,
): number {
  let streak = 0;
  let consecutiveRest = 0;
  let hasTraining = false;

  for (let i = 0; i <= 365; i++) {
    const d = shiftDate(today, -i);
    const amount = byDay.get(d) ?? 0;

    if (getDayType(amount) === 'training') {
      consecutiveRest = 0;
      streak++;
      hasTraining = true;
    } else {
      consecutiveRest++;
      // Regel: 2 aufeinanderfolgende Ruhetage
      if (consecutiveRest >= 2) break;
      // Regel: >2 Ruhetage in dieser Woche
      if ((weekRestCounts.get(getWeekKey(d)) ?? 0) > 2) break;
      streak++;
    }
  }
  return hasTraining ? streak : 0;
}

/** Längste Streak über den gesamten Verlauf, vorwärts scannen */
export function calculateLongestStreak(
  byDay: Map<string, number>,
  today: string,
  weekRestCounts: Map<string, number>,
): number {
  const allDates = Array.from(byDay.keys()).sort();
  if (allDates.length === 0) return 0;

  const startFrom = shiftDate(allDates[0], -7);
  const [sy, sm, sd] = startFrom.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  const totalDays =
    Math.round(
      (new Date(ty, tm - 1, td).getTime() - new Date(sy, sm - 1, sd).getTime()) / 86_400_000,
    ) + 1;

  let longest = 0;
  let current = 0;
  let consecutiveRest = 0;
  let hasTraining = false;
  let chainActive = false;

  for (let i = 0; i < totalDays; i++) {
    const d = shiftDate(startFrom, i);
    const amount = byDay.get(d) ?? 0;

    if (getDayType(amount) === 'training') {
      consecutiveRest = 0;
      chainActive = true;
      current++;
      hasTraining = true;
    } else {
      consecutiveRest++;
      const wkRest = weekRestCounts.get(getWeekKey(d)) ?? 0;
      if (consecutiveRest >= 2 || wkRest > 2) {
        if (hasTraining) longest = Math.max(longest, current);
        current = 0;
        consecutiveRest = 0;
        hasTraining = false;
        chainActive = false;
      }
      // Ruhetag innerhalb der Grenzen: Chain bleibt, aber current nicht erhöhen
    }
  }
  if (hasTraining) longest = Math.max(longest, current);
  return longest;
}

/** Hauptfunktion: berechnet alles auf einmal */
export function calculateStreakWithRestDays(
  byDay: Map<string, number>,
  today: string,
): StreakResult {
  const weekRestCounts = buildWeekRestCounts(byDay, today);
  const currentStreak = calculateCurrentStreak(byDay, today, weekRestCounts);
  const longestStreak = calculateLongestStreak(byDay, today, weekRestCounts);

  const todayAmt = byDay.get(today) ?? 0;
  const yesterday = shiftDate(today, -1);
  const yesterdayAmt = byDay.get(yesterday) ?? 0;
  const isRestDayToday = getDayType(todayAmt) === 'rest';
  const isRestDayYesterday = getDayType(yesterdayAmt) === 'rest';
  const consecutiveRestToday = isRestDayToday ? (isRestDayYesterday ? 2 : 1) : 0;
  const restDaysThisWeek = weekRestCounts.get(getWeekKey(today)) ?? 0;

  return {
    currentStreak,
    longestStreak,
    restDayInfo: { restDaysThisWeek, isRestDayToday, isRestDayYesterday, consecutiveRestToday },
  };
}
