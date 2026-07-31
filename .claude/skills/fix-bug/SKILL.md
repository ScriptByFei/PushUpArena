---
name: fix-bug
description: Strukturierter Ablauf für Bugfixes in PushUpArena — Root Cause zuerst, kleinster robuster Fix, Verifikation danach. Nutzen bei jedem gemeldeten Bug/Fehlverhalten.
---

# fix-bug

Ziel: den tatsächlichen Fehler beheben, nicht das erstbeste Symptom
verstecken. Siehe auch die allgemeinen Regeln in `CLAUDE.md`.

## Ablauf

1. **Nicht sofort editieren.** Erst das gemeldete Verhalten genau verstehen:
   was passiert, was wird erwartet, unter welchen Bedingungen (Gerät,
   Route, Timing, Nutzerinteraktion).
2. **Problemfluss untersuchen.** Den relevanten Daten-, State- und
   Event-Flow nachvollziehen: beteiligte Components, Hooks (`src/hooks/`),
   Context (`src/context/`), Utilities (`src/lib/`), ggf. Supabase-RPCs/
   -Tabellen (dann zusätzlich `supabase/CLAUDE.md` beachten).
3. **Root Cause identifizieren**, bevor irgendein Fix geschrieben wird.
   Bei Unsicherheit: mit Logs/Reads weiter eingrenzen statt zu raten.
4. **Betroffene Codepfade prüfen** — welche Komponenten/Hooks/State/
   Event-Handler/RPCs hängen an derselben Ursache oder demselben Zustand.
5. **Kleinsten robusten Fix umsetzen.** Nur die Ursache adressieren, keine
   begleitenden Refactorings oder Aufräumarbeiten.
6. **Ähnliche Codepfade auf Regressionen prüfen** — gibt es weitere Stellen
   mit demselben Muster, die vom Fix betroffen sind oder denselben Bug
   ebenfalls haben?
7. **Relevante Checks ausführen** (`npm run typecheck`, `npm run lint`, ggf.
   `npm run build`).
8. **Tatsächliches Verhalten nach dem Fix verifizieren.** Bei UI-/
   Interaktions-Bugs den Skill `verify-ui` verwenden — reines Kompilieren
   reicht nicht.
9. **Finalen Diff kontrollieren** (`git diff`) — nur die beabsichtigte,
   minimale Änderung sollte enthalten sein.

## Explizit vermeiden

- künstliche Timeouts/Delays als Fix
- unnötige Page Reloads
- duplizierten State (zweite Source of Truth)
- großflächige Refactorings ohne Notwendigkeit
- Fixes, die nur das sichtbare Symptom verstecken, statt die Ursache zu
  beheben
