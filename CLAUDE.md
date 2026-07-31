# PushUpArena

Mobile-first Fitness-PWA (React + TypeScript + Vite + Tailwind, Supabase-Backend
mit Auth/Postgres/RLS). Details zu Architektur und Datenmodell: `ARCHITECTURE.md`.
Details zu Supabase-Arbeiten: `supabase/CLAUDE.md`.

## Allgemeine Entwicklungsregeln

- Bestehendes Verhalten bewahren, sofern eine Aufgabe nicht ausdrücklich eine
  Änderung verlangt.
- Kleinste robuste Änderung bevorzugen, keine unnötigen Refactorings.
- Bestehende Komponenten, Hooks, Utilities, RPCs und Architekturmuster
  wiederverwenden statt eine zweite Source of Truth zu erzeugen.
- Keine unrelated changes.
- Mobile/iPhone/PWA-Verhalten ist wichtig (Touch, Scroll, Viewport, Safe Areas).
- Root Cause statt Symptombehandlung.

## Bugfix-Regeln

Siehe Skill `fix-bug`. Kurzfassung: Ursache zuerst nachvollziehen (Daten-,
State- und Event-Flow), keine künstlichen Delays/Reloads/Workarounds, verwandte
Codepfade auf Regressionen prüfen, Patch klein halten.

## Verification

Eine Aufgabe gilt NICHT allein deshalb als erledigt, weil TypeScript kompiliert.

Vorhandene Scripts (aus `package.json`):

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint .
npm run build        # gen-version + vite build
npm run dev          # Dev-Server (Port 5173, siehe .claude/launch.json)
```

Es gibt aktuell **keine** automatisierten Tests (kein vitest/jest/playwright im
Repo) — das ist eine bekannte Lücke, keine erfundene Infrastruktur annehmen.

Claude muss, soweit für die jeweilige Aufgabe relevant:

- `npm run typecheck` ausführen
- `npm run lint` ausführen
- `npm run build` ausführen, wenn sinnvoll (z. B. bei Config-/Build-Änderungen)
- finalen Diff kontrollieren (`git diff`)

Bei UI-/Interaktionsänderungen zusätzlich echte Browser-Verifikation, siehe
Skill `verify-ui`. „TypeScript und ESLint sind sauber" reicht bei einem UI-Bug
NICHT als erfolgreiche Verifikation.

Wenn Browser-Verifikation technisch nicht möglich ist: nicht einfach „fertig"
melden, sondern den konkreten Blocker benennen und soweit möglich eine
alternative Verifikation durchführen.

## Abschlussbericht

Nach jeder Aufgabe kurz berichten:

1. Ursache bzw. gewählter Ansatz
2. geänderte Dateien
3. durchgeführte Verifikation
4. verbleibende Risiken
