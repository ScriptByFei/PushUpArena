// Gamification-Logik (XP/Level). Muss zur SQL-Funktion compute_level() passen!
//
//   XP            = Summe aller Wiederholungen (1 Rep = 1 XP)
//   xpForLevel(L) = 50 * L * (L-1)            (Gesamt-XP, um Level L zu erreichen)
//   levelFromXp   = floor((1 + sqrt(1 + xp/12.5)) / 2)

export const XP_PER_REP = 1;

export function levelFromXp(xp: number): number {
  const safe = Math.max(0, xp);
  return Math.max(1, Math.floor((1 + Math.sqrt(1 + safe / 12.5)) / 2));
}

export function xpForLevel(level: number): number {
  const l = Math.max(1, level);
  return 50 * l * (l - 1);
}

export interface LevelProgress {
  level: number;
  /** XP innerhalb des aktuellen Levels */
  xpIntoLevel: number;
  /** XP-Spanne des aktuellen Levels */
  xpForThisLevel: number;
  /** Verbleibende XP bis zum nächsten Level */
  xpToNext: number;
  /** Fortschritt 0..1 im aktuellen Level */
  ratio: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelFromXp(xp);
  const floorXp = xpForLevel(level);
  const nextXp = xpForLevel(level + 1);
  const span = nextXp - floorXp;
  const into = Math.max(0, xp - floorXp);
  return {
    level,
    xpIntoLevel: into,
    xpForThisLevel: span,
    xpToNext: Math.max(0, nextXp - xp),
    ratio: span > 0 ? Math.min(1, into / span) : 0,
  };
}

/** Fallback-Icon, falls ein Badge-Slug nicht im Katalog gefunden wird. */
export const DEFAULT_BADGE_ICON = '🏅';
