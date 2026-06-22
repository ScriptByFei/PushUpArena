# 💪 PushupArena

Eine moderne, gamifizierte **Fitness-PWA** zum Tracken von Liegestützen. Nutzer setzen
Tages- und Wochenziele, sammeln XP/Level/Badges, halten Streaks und vergleichen sich
**ausschließlich mit Freunden** – datenschutzfreundlich und mobile-first.

> Das Datenmodell ist generisch (`exercises`) und **nicht** auf Pushups hart verdrahtet –
> weitere Übungen lassen sich später ohne Schemaänderung ergänzen.

---

## Features

- 🔐 **Auth**: Registrierung, E-Mail/Passwort-Login, **Google-Login**, Passwort-Reset,
  Logout, Session-Handling, geschützte Routen.
- 📊 **Dashboard**: Heute / Gesamt / Streak, Tages- & Wochenziel mit Fortschritt, Level & XP.
- 📝 **Tracking**: Einträge mit Anzahl, Datum/Zeit & Notiz – anlegen, bearbeiten, löschen.
- 🤝 **Freunde**: Suche per Username, Anfragen senden/annehmen/ablehnen, entfernen.
- 🏆 **Freundes-Leaderboard**: Anzeigename, Avatar, Heute, Gesamt, Level, Streak –
  sortierbar. **Keine** öffentliche globale Rangliste, **keine** E-Mail-Adressen.
- 🎮 **Gamification**: XP- & Level-System, Streaks, Badges/Achievements.
- 📱 **PWA**: installierbar, Service Worker, Offline-Fallback, Dark Mode.
- 🛡️ **Datenschutz/Sicherheit**: RLS auf allen Tabellen, Datenminimierung, Account-Löschung.

---

## Tech-Stack

| Bereich   | Technologie                                  |
| --------- | -------------------------------------------- |
| Frontend  | React 18, TypeScript, Vite                   |
| Styling   | Tailwind CSS (Dark Mode)                     |
| Routing   | React Router                                 |
| Backend   | Supabase (Auth, Postgres, RLS, Edge Function)|
| PWA       | vite-plugin-pwa (Workbox)                    |

---

## Schnellstart

### Voraussetzungen

- Node.js ≥ 18
- Ein Supabase-Projekt (siehe [`supabase/README.md`](supabase/README.md))

### 1. Installieren

```bash
npm install
```

### 2. Environment einrichten

```bash
cp .env.example .env
```

`.env` ausfüllen:

```
VITE_SUPABASE_URL=https://<dein-projekt>.supabase.co
VITE_SUPABASE_ANON_KEY=<dein-anon-key>
```

### 3. Backend einrichten

Migrationen `0001`–`0004` aus `supabase/migrations/` einspielen und (optional) Google-Login
sowie die Edge Function aktivieren. **Komplette Anleitung:** [`supabase/README.md`](supabase/README.md).

### 4. Starten

```bash
npm run dev      # Entwicklungsserver (http://localhost:5173)
npm run build    # Produktions-Build (inkl. PWA)
npm run preview  # Build lokal testen
```

> Ist `.env` nicht gesetzt, zeigt die App einen freundlichen Konfigurations-Hinweis
> statt zu crashen.

---

## Projektstruktur

```
PushupArena/
├── ARCHITECTURE.md            # Architektur-Überblick & Designentscheidungen
├── public/                    # Manifest, Icons (Platzhalter), Offline-Seite
├── scripts/gen-icons.mjs      # Erzeugt Platzhalter-PNG-Icons (npm run gen:icons)
├── src/
│   ├── lib/                   # supabase-Client, DB-Typen, Gamification, Datums-Helfer
│   ├── context/               # Auth, Toasts, aktive Übung
│   ├── hooks/                 # useProfile, useStats, useGoals, useWorkouts, useFriends, …
│   ├── components/            # ui/ (Button, Card, …), layout/, ProtectedRoute, QuickAdd
│   └── pages/                 # auth/, Dashboard, Track, Friends, Leaderboard, Profile, …
└── supabase/
    ├── migrations/            # 0001 Schema · 0002 RLS · 0003 Funktionen · 0004 Seed
    ├── functions/             # Edge Function: delete-account (DSGVO)
    └── README.md              # Supabase-Setup + Google-Login + Edge Function
```

---

## Gamification

- **XP** = Summe aller Wiederholungen (1 Rep = 1 XP).
- **Level**: `level = floor((1 + sqrt(1 + xp/12.5)) / 2)` – identisch in SQL (`compute_level`)
  und TS (`src/lib/gamification.ts`).
- **Streak**: aufeinanderfolgende Tage (UTC) mit Eintrag, endend heute/gestern.
- **Badges** (Seed): Erste 10 · 100 Gesamt · 7-Tage-Streak · Tagesziel · Wochenziel ·
  Persönlicher Rekord. Freischaltung erfolgt **serverseitig** (manipulationssicher).

---

## Datenschutz / DSGVO

- **Datenminimierung**: Profile enthalten keine E-Mail-Spalte; E-Mails sind nie für andere sichtbar.
- **Eigene Daten**: Trainings-Einträge & Ziele sind ausschließlich für dich sichtbar (RLS).
- **Vergleichsdaten**: nur zwischen bestätigten Freunden, nur aggregiert (Leaderboard-RPC).
- **Account-Löschung**: in den Einstellungen; entfernt alle Daten unwiderruflich (Edge Function).
- **Kein Tracking**: keine Marketing-/Tracking-Cookies; nur technisch nötiger Auth-Speicher.
- **Platzhalterseiten**: `/privacy` und `/imprint` – vor Veröffentlichung rechtssicher befüllen.

---

## Sicherheit

- **RLS auf allen Tabellen** – Default „deny", explizite Policies (siehe `0002_rls_policies.sql`).
- Nutzer dürfen nur **eigene** Einträge erstellen/ändern/löschen.
- Profile nur eingeschränkt sichtbar (eigenes/suchbar/befreundet).
- Freundschaftsdaten nur für Beteiligte; Vergleichsdaten nur zwischen Freunden.
- **Kein Secret im Frontend** – nur der öffentliche anon-Key; service_role bleibt serverseitig.
- Env-Variablen über `.env` (per `.gitignore` ausgeschlossen).

---

## Skripte

| Befehl              | Beschreibung                               |
| ------------------- | ------------------------------------------ |
| `npm run dev`       | Dev-Server                                 |
| `npm run build`     | Typecheck + Produktions-Build (inkl. PWA)  |
| `npm run preview`   | Build lokal servieren                      |
| `npm run typecheck` | Nur TypeScript prüfen                       |
| `npm run lint`      | ESLint                                     |
| `npm run gen:icons` | Platzhalter-App-Icons neu erzeugen         |

---

## Erweiterbarkeit: weitere Übungen

Das Modell ist generisch. Eine neue Übung hinzufügen:

```sql
insert into public.exercises (name, slug, unit)
values ('Kniebeugen', 'squats', 'reps');
```

Im Frontend steuert `ACTIVE_EXERCISE_SLUG` in `src/context/ExerciseContext.tsx`, welche
Übung aktiv ist. Hier ließe sich später ein Übungs-Umschalter ergänzen – alle Statistiken,
Ziele, Badges und das Leaderboard arbeiten bereits pro `exercise_id`.

---

## App-Icons

`public/icons/` enthält generierte **Platzhalter**-Icons (Indigo-Verlauf + Hantel).
Für die Produktion durch echte Markenicons ersetzen (gleiche Dateinamen/Größen) oder
`npm run gen:icons` anpassen.
