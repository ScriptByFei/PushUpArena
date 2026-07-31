/**
 * Arena Live — Führungswechsel-Erkennung.
 *
 * Reine, von React/Supabase unabhängige Logik (leicht unit-testbar). Ersetzt
 * die frühere serverseitige "place1_new"-Erzeugung (DB-Trigger feuerte bei
 * JEDEM Satz, der den Nutzer auf Rang 1 brachte — auch beim allerersten Satz
 * des Tages, wenn es noch gar keinen Vorgänger gab).
 *
 * Referenzpunkt für "echter Führungswechsel" ist bewusst der bisherige
 * HÖCHSTSTAND (nicht zwingend eine einzelne Person) — ein Gleichstand an der
 * Spitze hat keinen eindeutigen Vorgänger, aber sehr wohl einen Höchststand,
 * den ein Dritter danach eindeutig übertreffen kann (z.B. A20/B20 Gleichstand
 * → B macht +10 → B30 ist ein echter Führungswechsel, obwohl es vorher keinen
 * eindeutigen Anführer gab, sondern zwei Gleichauf-Führende).
 */

export type TotalsMap = Map<string, number>;

/**
 * Eindeutiger Spitzenreiter einer Totals-Map, oder `null` bei Gleichstand
 * an der Spitze oder wenn noch niemand einen Wert > 0 hat.
 */
export function uniqueLeader(totals: TotalsMap): string | null {
  let leaderId: string | null = null;
  let leaderTotal = 0;
  let tie = false;

  for (const [userId, total] of totals) {
    if (total <= 0) continue;
    if (total > leaderTotal) {
      leaderId = userId;
      leaderTotal = total;
      tie = false;
    } else if (total === leaderTotal) {
      tie = true;
    }
  }

  return tie ? null : leaderId;
}

/** Höchster Wert in einer Totals-Map (0, wenn leer/niemand > 0). */
function topTotal(totals: TotalsMap): number {
  let max = 0;
  for (const total of totals.values()) {
    if (total > max) max = total;
  }
  return max;
}

/**
 * Entscheidet, ob ein einzelner Satz einen echten Führungswechsel darstellt.
 *
 * Echter Führungswechsel:
 *   - VOR dem Satz gab es bereits einen Höchststand > 0 (jemand war schon aktiv),
 *   - der handelnde Nutzer war VOR dem Satz nicht bereits alleiniger Halter
 *     dieses Höchststands (sonst: legt nur selbst nach),
 *   - NACH dem Satz ist der handelnde Nutzer eindeutig (ohne Gleichstand) vorn,
 *   - und sein neuer Gesamtstand übertrifft den bisherigen Höchststand.
 *
 * Deckt damit automatisch ab:
 *   - erster Nutzer des Tages        → bisheriger Höchststand 0        → false
 *   - Gleichstand NACH dem Satz      → nach dem Satz kein Alleinführer → false
 *   - Führender legt selbst nach     → war schon alleiniger Halter     → false
 *   - aus einem Gleichstand heraus eindeutig übernehmen → true (siehe oben)
 */
export function detectLeadChange(
  beforeTotals: TotalsMap,
  afterTotals: TotalsMap,
  actingUserId: string,
): boolean {
  const previousTop = topTotal(beforeTotals);
  if (previousTop <= 0) return false;

  const wasSoleLeader = uniqueLeader(beforeTotals) === actingUserId;
  if (wasSoleLeader) return false;

  const newLeader = uniqueLeader(afterTotals);
  if (newLeader !== actingUserId) return false;

  const actingUserTotal = afterTotals.get(actingUserId) ?? 0;
  return actingUserTotal > previousTop;
}

export interface LeadChangeSourceEntry {
  entryId: string;
  userId: string;
  /**
   * Kumulierter Tagesgesamtstand DES NUTZERS nach diesem Satz — bereits
   * serverseitig korrekt über den kompletten Tag berechnet (SQL-Window-
   * Function), unabhängig davon, wie viele Sätze der Client tatsächlich
   * geladen hat. NICHT aus `amount`-Deltas der geladenen Einträge neu
   * aufsummieren: Wird `activityList` serverseitig limitiert (z.B. LIMIT 40)
   * und fallen dadurch ältere Sätze eines Nutzers weg, ergibt eine
   * Neu-Aufsummierung einen zu niedrigen Stand für diesen Nutzer — mit der
   * Folge, dass ein anderer Nutzer beim bloßen Gleichziehen fälschlich als
   * "überholt" erkannt wird.
   */
  runningTotal: number;
  performedAt: string;
}

export interface LeadChangeResult {
  entryId: string;
  newLeaderId: string;
  /** Alleiniger Vorgänger, oder `null` wenn die Führung zuvor geteilt war (Gleichstand). */
  previousLeaderId: string | null;
}

/**
 * Rekonstruiert den Tagesverlauf chronologisch aus den einzelnen Sätzen und
 * markiert jeden Satz, der einen echten Führungswechsel auslöst. Rein
 * deterministisch aus den aktuell vorhandenen Einträgen berechnet — bei
 * Bearbeitung/Löschung eines Satzes ergibt ein erneuter Aufruf mit den dann
 * aktuellen Einträgen automatisch den korrigierten Verlauf.
 */
export function computeLeadChanges(
  entries: LeadChangeSourceEntry[],
): Map<string, LeadChangeResult> {
  const chronological = [...entries].sort((a, b) => {
    const diff = new Date(a.performedAt).getTime() - new Date(b.performedAt).getTime();
    return diff !== 0 ? diff : a.entryId.localeCompare(b.entryId);
  });

  const totals: TotalsMap = new Map();
  const result = new Map<string, LeadChangeResult>();

  for (const entry of chronological) {
    const before: TotalsMap = new Map(totals);
    // Bereits korrekt kumuliert (serverseitig über den ganzen Tag berechnet) —
    // NICHT aus Deltas der geladenen Einträge neu aufsummieren, siehe Hinweis
    // an LeadChangeSourceEntry.runningTotal.
    totals.set(entry.userId, entry.runningTotal);

    if (detectLeadChange(before, totals, entry.userId)) {
      result.set(entry.entryId, {
        entryId: entry.entryId,
        newLeaderId: entry.userId,
        previousLeaderId: uniqueLeader(before),
      });
    }
  }

  return result;
}
