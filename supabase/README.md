# Supabase-Setup für PushupArena

Diese Anleitung führt durch das Aufsetzen des Backends: Datenbank-Migrationen,
Row Level Security, Seed-Daten, Google-Login und die Account-Löschungs-Funktion.

---

## 1. Projekt anlegen

1. Auf [supabase.com](https://supabase.com) ein neues Projekt erstellen.
2. Unter **Project Settings → API** notieren:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon / public key** → `VITE_SUPABASE_ANON_KEY`
3. Diese Werte in die `.env` des Frontends eintragen (siehe `.env.example`).

> ⚠️ Den **service_role**-Key niemals ins Frontend kopieren. Er wird nur in der
> Edge Function `delete-account` serverseitig verwendet.

---

## 2. Datenbank-Migrationen einspielen

Die SQL-Dateien liegen in `supabase/migrations/` und müssen **in dieser Reihenfolge**
ausgeführt werden:

| Datei                          | Inhalt                                        |
| ------------------------------ | --------------------------------------------- |
| `0001_initial_schema.sql`      | Tabellen, Indizes, RLS aktivieren             |
| `0002_rls_policies.sql`        | Row-Level-Security-Policies + Grants          |
| `0003_functions_triggers.sql`  | Funktionen, Trigger, sicheres Leaderboard     |
| `0004_seed.sql`                | Übung „Pushups" + Badge-Katalog               |

### Variante A – SQL-Editor (am schnellsten)

1. Supabase-Dashboard → **SQL Editor → New query**.
2. Inhalt von `0001…` einfügen, **Run**. Anschließend `0002…`, `0003…`, `0004…`.

### Variante B – Supabase CLI

```bash
npm install -g supabase
supabase login
supabase link --project-ref <DEIN_PROJECT_REF>
supabase db push        # spielt supabase/migrations/* ein
```

> Die Migrationen sind idempotent (`if not exists`, `on conflict do nothing`) und
> können gefahrlos erneut ausgeführt werden.

---

## 3. Auth konfigurieren

**Authentication → Providers → Email**

- „Email" aktivieren.
- Für lokale Tests kann „Confirm email" deaktiviert werden, damit man sich sofort
  einloggen kann. Für Produktion **aktiviert lassen**.

**Authentication → URL Configuration**

- **Site URL**: `http://localhost:5173` (Dev) bzw. deine Produktions-URL.
- **Redirect URLs**: beide Umgebungen eintragen, jeweils mit `/reset-password`, z. B.:
  - `http://localhost:5173`
  - `http://localhost:5173/reset-password`
  - `https://deine-domain.tld`
  - `https://deine-domain.tld/reset-password`

---

## 4. Google-Login einrichten

### 4.1 Google Cloud Console

1. [console.cloud.google.com](https://console.cloud.google.com) → Projekt anlegen/wählen.
2. **APIs & Services → OAuth consent screen** konfigurieren (External, App-Name, Support-Mail).
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**.
   - **Authorized JavaScript origins**: `http://localhost:5173`, deine Produktions-URL.
   - **Authorized redirect URI** (wichtig – die Supabase-Callback-URL):
     ```
     https://<DEIN_PROJECT_REF>.supabase.co/auth/v1/callback
     ```
4. **Client ID** und **Client Secret** kopieren.

### 4.2 Supabase

1. Dashboard → **Authentication → Providers → Google** aktivieren.
2. **Client ID** und **Client Secret** aus Schritt 4.1 eintragen, speichern.

Die App nutzt `signInWithOAuth({ provider: 'google' })` mit Redirect zurück auf die
App-Root. Profile (inkl. Avatar/Name aus Google) werden automatisch per Trigger
`handle_new_user` angelegt.

---

## 5. Edge Function „delete-account" (DSGVO-Löschung)

Vollständige Konto-Löschung benötigt den service_role-Key und läuft daher serverseitig.

```bash
supabase functions deploy delete-account
```

Die Secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY` und `SUPABASE_SERVICE_ROLE_KEY` sind im
Supabase-Stack i. d. R. bereits gesetzt. Andernfalls:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
```

Beim Löschen wird der Auth-Nutzer entfernt; dank `ON DELETE CASCADE` verschwinden
automatisch Profil, Einträge, Ziele, Freundschaften und Badges.

> Ohne deployte Function löscht die App als Fallback die eigenen Profildaten
> (kaskadiert ebenfalls alle Nutzerdaten) und meldet sich ab.

---

## 6. Sicherheits-/RLS-Überblick

- **RLS ist auf allen Tabellen aktiv.** Ohne passende Policy ist jeder Zugriff verboten.
- `workout_entries`, `user_goals`: nur **eigene** Zeilen (Select/Insert/Update/Delete).
- `profiles`: sichtbar nur, wenn **eigenes**, **suchbar** oder **befreundet**. Keine E-Mail-Spalte.
- `friend_requests`: nur Beteiligte; Senden als Sender, Beantworten als Empfänger.
- `friendships`: nur lesbar; Schreiben ausschließlich über Trigger/RPC.
- **Vergleichsdaten** kommen nur über `get_friend_leaderboard()` (SECURITY DEFINER),
  das ausschließlich aggregierte Felder von dir + bestätigten Freunden zurückgibt.
- **Achievements** werden serverseitig per `evaluate_achievements()` geprüft.

Nach dem Einspielen empfiehlt sich der **Security Advisor** (Dashboard → Advisors),
um die Policies gegenzuchecken.
