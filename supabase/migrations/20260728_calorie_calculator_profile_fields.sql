-- Migration: Kaloriendefizit-Rechner — persönliche Eingaben am Profil
-- Neue, optionale Spalten für profiles. Alle nullable (kein Zwang, vor dem
-- ersten Nutzen des Rechners Werte zu haben). Bestehende RLS-Policies
-- (profiles_update_self / profiles_select_all_authenticated) decken diese
-- Spalten bereits ab — keine Policy-Änderung nötig.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS age integer
    CHECK (age IS NULL OR (age BETWEEN 16 AND 100)),
  ADD COLUMN IF NOT EXISTS height_cm integer
    CHECK (height_cm IS NULL OR (height_cm BETWEEN 120 AND 230)),
  ADD COLUMN IF NOT EXISTS weight_kg numeric(5,1)
    CHECK (weight_kg IS NULL OR (weight_kg BETWEEN 35 AND 250)),
  ADD COLUMN IF NOT EXISTS average_daily_steps integer
    CHECK (average_daily_steps IS NULL OR (average_daily_steps BETWEEN 0 AND 100000)),
  ADD COLUMN IF NOT EXISTS calorie_deficit_target text NOT NULL DEFAULT 'moderat'
    CHECK (calorie_deficit_target IN ('leicht', 'moderat', 'hoeher'));
