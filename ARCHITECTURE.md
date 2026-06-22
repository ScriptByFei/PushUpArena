# PushupArena – Architektur

Gamifizierte, mobile-first Fitness-PWA zum Tracken von Liegestützen (erweiterbar auf
beliebige Übungen). Frontend: React + TypeScript + Vite + Tailwind. Backend: Supabase
(Auth, Postgres, Row Level Security).

## Leitprinzipien

1. **Erweiterbares Datenmodell** – Nichts ist auf „Pushups" hart verdrahtet. Alles läuft
   über eine generische `exercises`-Tabelle. Pushups sind nur der erste Seed-Eintrag.
2. **Sicherheit & Datenschutz zuerst** – RLS auf _allen_ Tabellen. Nutzer sehen ausschließlich
   eigene Rohdaten. Vergleichsdaten sind nur zwischen bestätigten Freunden sichtbar und werden
   über eine `SECURITY DEFINER`-Funktion aggregiert ausgeliefert (keine Rohdaten, keine E-Mails).
3. **Kein Secret im Frontend** – Es wird ausschließlich der öffentliche `anon`/publishable Key
   verwendet. Service-Role-Key wird nie im Client benutzt.
4. **Mobile-first PWA** – Installierbar, Offline-Fallback, Bottom-Navigation, Dark Mode.

## Datenfluss

```
React (Vite, TS, Tailwind)
  └── AuthContext  ──────────────►  supabase-js (anon key, .env)
        │                                  │
        ├── Hooks (useWorkouts, ...)       ▼
        │                            Supabase Postgres
        └── Pages / Components            ├── Tabellen (RLS aktiv)
                                          ├── Views  (eigene Statistiken)
                                          └── RPC-Funktionen (Freundes-Leaderboard)
```

## Datenmodell (Übersicht)

| Tabelle             | Zweck                                                            |
| ------------------- | ---------------------------------------------------------------- |
| `profiles`          | Öffentliches Profil (username, display_name, avatar, bio)        |
| `exercises`         | Übungs-Katalog (pushups, später mehr)                            |
| `workout_entries`   | Einzelne Trainings-Einträge (amount, note, performed_at)         |
| `user_goals`        | Tages-/Wochenziel pro Nutzer + Übung                             |
| `friend_requests`   | Freundschaftsanfragen (pending/accepted/declined)                |
| `friendships`       | Bestätigte Freundschaften (bidirektional, per Trigger gepflegt)  |
| `achievements`      | Badge-Katalog (Seed)                                             |
| `user_achievements` | Freigeschaltete Badges pro Nutzer                                |

Aggregationen für das Dashboard kommen aus der View `user_exercise_stats` bzw. den
SQL-Funktionen `compute_streak()` und `compute_level()`. Das Freundes-Leaderboard liefert
`get_friend_leaderboard(exercise)` (SECURITY DEFINER) – nur erlaubte, aggregierte Felder.

## Verzeichnisstruktur

```
PushupArena/
├── public/                     # Statische Assets (Manifest, Icons, Offline-Seite)
├── scripts/gen-icons.mjs       # Erzeugt Platzhalter-PNG-Icons
├── src/
│   ├── main.tsx                # Einstiegspunkt, Router, Provider
│   ├── App.tsx                 # Routen-Definition
│   ├── index.css               # Tailwind + Basis-Styles
│   ├── lib/
│   │   ├── supabase.ts         # Supabase-Client (anon key aus .env)
│   │   ├── database.types.ts   # TypeScript-Typen zum Schema
│   │   ├── gamification.ts     # XP/Level-Formeln, Badge-Definitionen
│   │   └── date.ts             # Datums-Helfer (Woche, heute)
│   ├── context/AuthContext.tsx # Session-Handling, Login/Logout/SignUp
│   ├── hooks/                  # useProfile, useWorkouts, useGoals, useFriends, useStats
│   ├── components/
│   │   ├── ui/                 # Button, Card, Input, Spinner, ProgressBar, ...
│   │   ├── layout/             # AppLayout, BottomNav, TopBar
│   │   └── ProtectedRoute.tsx  # Geschützte Routen
│   └── pages/
│       ├── auth/               # Login, Register, ForgotPassword, ResetPassword
│       ├── Dashboard, Track, Friends, Leaderboard, Profile, Settings
│       └── Privacy, Imprint, Offline, NotFound
├── supabase/
│   ├── migrations/             # 0001 Schema, 0002 RLS, 0003 Funktionen/Trigger, 0004 Seed
│   └── README.md               # Supabase-Setup + Google-Login-Anleitung
├── .env.example
└── README.md
```

## Gamification-Logik

- **XP** = Summe aller absolvierten Wiederholungen (1 Rep = 1 XP).
- **Level**: `level = floor((1 + sqrt(1 + xp/12.5)) / 2)`; benötigtes Gesamt-XP für Level `L`
  = `50 · L · (L-1)`. Identisch in SQL (`compute_level`) und TS (`gamification.ts`).
- **Streak**: aufeinanderfolgende Tage (UTC) mit mindestens einem Eintrag bis heute/gestern.
- **Badges**: Katalog in `achievements`, Freischaltung clientseitig nach jedem Eintrag
  (RLS erlaubt nur das Einfügen eigener `user_achievements`).
