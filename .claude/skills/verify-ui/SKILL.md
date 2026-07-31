---
name: verify-ui
description: Verpflichtende echte Browser-Verifikation für UI-/Interaktionsänderungen in PushUpArena. Nutzen nach jeder Änderung an Components, Pages, Hooks mit UI-Auswirkung oder Styling/Touch-Verhalten — TypeScript/Lint allein reicht nicht.
---

# verify-ui

Ziel: belegen, dass eine UI-Änderung tatsächlich im Browser funktioniert —
nicht nur, dass sie kompiliert. „TypeScript und ESLint sind sauber" ist bei
einem UI-Bug KEINE erfolgreiche Verifikation.

## Vorhandene Infrastruktur

- Dev-Server: `npm run dev` (Port 5173), bereits als Launch-Config
  `.claude/launch.json` → `preview_start({name: "dev"})` nutzen.
- Kein Playwright/Cypress/vitest im Repo — Browser-Verifikation läuft über die
  interaktiven Browser-Pane-Tools (preview_start, navigate, computer,
  read_page, read_console_messages, resize_window, …), nicht über ein
  eigenes Test-Framework.

## Ablauf

1. Dev-Server starten bzw. wiederverwenden (`preview_start` mit `name: "dev"`).
2. Betroffene Route/Ansicht öffnen (`navigate`).
3. Konkrete, im Task beschriebene User-Interaktion tatsächlich durchführen
   (klicken, tippen, scrollen — nicht nur visuell inspizieren).
4. Mobile-Viewport verwenden (`resize_window`, Preset `mobile` bzw. Ziel-
   Auflösung), da die App mobile-first/PWA ist.
5. Wenn relevant: Touch-/Pointer-/Scroll-Verhalten gezielt prüfen (z. B.
   Tab-Wechsel, Sticky-Header, iOS-Scroll-Restore — Themen, die in diesem
   Repo bereits mehrfach Bugs waren).
6. Browser-Konsole auf Fehler prüfen (`read_console_messages`,
   `onlyErrors: true`).
7. Wenn betroffen: Loading-, Empty- und Error-States der Ansicht explizit
   prüfen, nicht nur den Happy Path.
8. Bei gefundenem Problem: selbst korrigieren, danach erneut ab Schritt 2
   testen.
9. Ergebnis dem Nutzer als Beleg zeigen (Screenshot bei visuellen
   Änderungen, Konsolen-/Netzwerk-Auszug bei funktionalen Änderungen).

## Wenn Browser-Verifikation technisch nicht möglich ist

Nicht einfach „fertig" melden. Stattdessen:

- den konkreten Blocker benennen (z. B. Dev-Server startet nicht, Route
  braucht Auth-State, das hier nicht herstellbar ist)
- soweit möglich eine alternative Verifikation durchführen (z. B. gezielter
  Unit-Check der Logik, sorgfältige Diff-Lektüre, manuelle Trace der
  betroffenen Renderpfade)
- das dem Nutzer explizit mitteilen statt Erfolg zu unterstellen
