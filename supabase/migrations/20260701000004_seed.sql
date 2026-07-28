-- =============================================================================
-- PushupArena · 0004 · Seed-Daten
-- -----------------------------------------------------------------------------
-- Initiale Übung (Pushups) + Badge-Katalog. Idempotent (on conflict do nothing).
-- =============================================================================

-- Initiale Übung: Liegestütze ------------------------------------------------
insert into public.exercises (name, slug, unit)
values ('Liegestütze', 'pushups', 'reps')
on conflict (slug) do nothing;

-- Weitere Übungen lassen sich später einfach ergänzen, z. B.:
-- insert into public.exercises (name, slug, unit) values
--   ('Kniebeugen', 'squats',  'reps'),
--   ('Klimmzüge',  'pullups', 'reps'),
--   ('Plank',      'plank',   'seconds')
-- on conflict (slug) do nothing;

-- Badge-Katalog ---------------------------------------------------------------
insert into public.achievements (slug, name, description, icon, sort_order) values
  ('first-10',        'Erste Schritte',     'Erste 10 Wiederholungen geschafft.',           '🏁', 10),
  ('century',         'Century Club',       '100 Wiederholungen insgesamt erreicht.',        '💯', 20),
  ('streak-7',        '7-Tage-Streak',      '7 Tage in Folge trainiert.',                    '🔥', 30),
  ('daily-goal',      'Tagesziel-Held',     'Dein Tagesziel erreicht.',                      '⭐', 40),
  ('weekly-goal',     'Wochenziel-Held',    'Dein Wochenziel erreicht.',                     '🎯', 50),
  ('personal-record', 'Persönlicher Rekord','Neuen Rekord für einen einzelnen Satz aufgestellt.', '🚀', 60)
on conflict (slug) do nothing;
