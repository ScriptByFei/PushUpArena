# Supabase — Sicherheitsregeln

Gilt zusätzlich zur Root-`CLAUDE.md` für alles unter `supabase/` (Migrationen,
Edge Functions) und für Frontend-Code, der Supabase-RPCs/Tabellen aufruft.

Hintergrund: RLS ist auf allen Tabellen aktiv, Nutzer sehen nur eigene
Rohdaten, Vergleichsdaten laufen über `SECURITY DEFINER`-Funktionen wie
`get_friend_leaderboard()`. Details: `../ARCHITECTURE.md`, `README.md`.

Ausführlicher Ablauf für Änderungen: Skill `safe-supabase`.

## Regeln

- Bestehende Migrationen, RPCs und Policies zuerst untersuchen
  (`supabase/migrations/`, chronologisch benannt `YYYYMMDDHHMMSS_*.sql`).
- RLS niemals deaktivieren, um ein Problem zu lösen.
- Keine Berechtigungen pauschal erweitern (kein blankes `GRANT ALL`, kein
  pauschales Öffnen für `anon`).
- `SECURITY DEFINER`-Funktionen sorgfältig behandeln — sie umgehen RLS
  absichtlich für einen engen, aggregierten Zweck. Scope nicht erweitern,
  ohne die Sicherheitsauswirkung explizit zu prüfen.
- Sicheren, expliziten `search_path` in `SECURITY DEFINER`-Funktionen
  berücksichtigen (im Repo bereits durchgängige Praxis).
- Bestehende Authorization-Grenzen bewahren (wer darf was mit wessen Daten).
- Bestehende RPCs bevorzugen, wenn sie die Aufgabe bereits sinnvoll abdecken,
  statt eine neue, überlappende Funktion zu schreiben.
- Migrationen möglichst idempotent und nachvollziehbar halten (`CREATE OR
  REPLACE`, `IF NOT EXISTS` wo passend), neue Migration statt bestehende
  angewendete Migration nachträglich umschreiben.
- Realtime-Auswirkungen berücksichtigen (mehrere Migrationen betreffen
  `daily_live`/Realtime-Publications — Änderungen an Tabellen/Views können
  Realtime-Subscriptions im Frontend brechen).
- Frontend-Caller einer geänderten RPC/Tabelle prüfen (`src/hooks/`,
  `src/lib/`) — Signatur- oder Rückgabeänderungen dort nachziehen.
- Keine destruktiven Produktionsänderungen automatisch ausführen (kein Ausführen
  von Migrationen gegen ein verlinktes/produktives Projekt ohne ausdrückliche
  Bestätigung durch den Nutzer).
- Produktionsmigrationen (neue Datei in `supabase/migrations/`, wirkt auf
  echtes Schema/Daten) klar von reinem Code unterscheiden — letzteres kann frei
  bearbeitet werden, ersteres braucht die obige Sorgfalt plus Nutzerfreigabe
  vor Anwendung.
