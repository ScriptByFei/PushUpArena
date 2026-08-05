/**
 * StatisticsCharts — Platzhalter für zukünftige Diagramme.
 *
 * Geplant (noch nicht implementiert): Push-ups pro Tag/Woche/Monat,
 * durchschnittlicher Satz, Anzahl Sätze, Trainingsentwicklung, Heatmap,
 * Wochen-/Monatsvergleich. Jedes Diagramm wird als eigene Komponente in
 * diesem Ordner ergänzt und hier eingehängt — kein Umbau der Seite nötig.
 */

const PLANNED_CHARTS = [
  'Push-ups pro Tag',
  'Push-ups pro Woche',
  'Push-ups pro Monat',
  'Durchschnittlicher Satz',
  'Anzahl Sätze',
  'Trainingsentwicklung',
];

export function StatisticsCharts() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-ink-600 px-6 py-14 text-center">
      <div className="text-4xl">📈</div>
      <h3 className="text-base font-semibold text-slate-200">Diagramme folgen bald</h3>
      <p className="max-w-xs text-sm text-slate-400">
        Hier erscheinen künftig visuelle Auswertungen deines Trainings.
      </p>
      <ul className="mt-1 flex flex-wrap justify-center gap-1.5">
        {PLANNED_CHARTS.map((c) => (
          <li
            key={c}
            className="rounded-full border border-ink-700 bg-ink-900/60 px-2.5 py-1 text-[10px] text-slate-500"
          >
            {c}
          </li>
        ))}
      </ul>
    </div>
  );
}
