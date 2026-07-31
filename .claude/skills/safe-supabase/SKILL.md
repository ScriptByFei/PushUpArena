---
name: safe-supabase
description: Sicherer Analyse-Ablauf vor jeder Änderung an Supabase-Migrationen, RPCs, RLS oder Edge Functions in PushUpArena. Nutzen bevor Code unter supabase/ geändert wird oder eine neue Migration/RPC geschrieben wird.
---

# safe-supabase

Ziel: die kleinste sichere Änderung wählen, ohne RLS, Authorization-Grenzen
oder Realtime-Verhalten zu beschädigen. Siehe zuerst `supabase/CLAUDE.md`.

## Analyse vor jeder Änderung

1. **Relevantes Schema** — betroffene Tabellen/Views in
   `supabase/migrations/` suchen (chronologisch benannt).
2. **Migrationen** — Historie der betroffenen Tabelle lesen, nicht nur die
   letzte Migration; mehrere Migrationen ändern denselben Bereich
   nachträglich (z. B. `daily_live`-Serie).
3. **RPCs** — existierende `SECURITY DEFINER`-Funktionen für den
   Anwendungsfall prüfen (`grep -r "SECURITY DEFINER" supabase/migrations`).
4. **RLS** — aktuelle Policies der betroffenen Tabelle(n) nachvollziehen: wer
   darf lesen/schreiben, worüber wird das durchgesetzt.
5. **Grants** — welche Rolle (`anon`, `authenticated`) aktuell welche Rechte
   hat.
6. **SECURITY DEFINER** — bei neuen/geänderten Funktionen: expliziten
   `search_path`, minimalen Rückgabe-Scope (keine Rohdaten, keine E-Mails),
   und ob der Aufrufer wirklich berechtigt sein soll.
7. **Frontend-Aufrufer** — `src/hooks/`, `src/lib/` nach Aufrufern der
   betroffenen Tabelle/RPC durchsuchen, damit keine stillen Breaking Changes
   entstehen.
8. **Realtime-Abhängigkeiten** — prüfen, ob die Tabelle/View Teil einer
   Realtime-Publication ist (mehrere `daily_live_*`-Migrationen betreffen
   das); Schemaänderungen können Subscriptions im Frontend brechen.
9. **Mögliche Security-Auswirkungen** — würde die Änderung einem Nutzer
   Zugriff auf fremde Daten geben, und sei es indirekt über eine Aggregation?
10. **Mögliche Datenmigrationen** — bestehende Zeilen betroffen? Braucht es
    einen Backfill? Wenn ja, das explizit benennen statt stillschweigend
    anzunehmen, dass Defaults reichen.

## Danach

Kleinste sichere Änderung umsetzen: neue, fokussierte Migration statt
bestehende angewendete Migration umzuschreiben; bestehende RPC erweitern
statt duplizieren, wenn sie den Fall schon abdeckt.

## Nicht erlaubt

- RLS deaktivieren
- Auth-Prüfungen entfernen
- privilegierte Funktionen unnötig öffentlich machen
- `anon` pauschal Rechte geben
- bestehende, bereits angewendete Migrationen unnötig umschreiben
- destruktive Produktionsänderungen automatisch durchführen (z. B. Migration
  gegen ein verlinktes Projekt anwenden) ohne ausdrückliche Nutzerfreigabe
