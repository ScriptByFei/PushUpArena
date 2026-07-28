-- Migration: feed_invalidation_on_delete_update
-- ─────────────────────────────────────────────────────────────────────────────
-- Problem: Der Trigger maybe_create_workout_feed_events feuert nur auf INSERT
-- in workout_entries. Wenn ein Satz gelöscht oder bearbeitet wird:
--   - Bleibt live_activity.today_total auf dem alten Wert
--   - Bleiben feed_events (Meilensteine, Platz-1, Tagesrekord usw.) erhalten,
--     auch wenn sie nicht mehr der Realität entsprechen
--
-- Lösung: Neuer Trigger auf workout_entries AFTER DELETE OR UPDATE
--   1. Berechnet den neuen Tagessummen des Nutzers neu
--   2. Aktualisiert live_activity.today_total (→ Realtime sendet UPDATE-Event)
--   3. Setzt expires_at = now()-1s auf feed_events, die nicht mehr gültig sind:
--      - Meilensteine: Schwellwert > neue Tagessumme
--      - daily_record:  neue Tagessumme ≤ bisheriges Tages-Best aus Vorperioden
--      - place1_new:    Nutzer ist nicht mehr auf Rang 1
--      - rank_improved: transient, wird beim nächsten INSERT neu erzeugt
--
-- Scope: nur heutige Einträge (Berliner Zeitzone).
--        Vergangene Tage sind durch finalize_challenge_day eingefroren.
--
-- Sicherheit: SECURITY DEFINER, kein GRANT an PUBLIC/anon/authenticated
--              (läuft nur als DB-Trigger, nie als direkt aufrufbare Funktion)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.invalidate_workout_feed_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug        text;
  v_event_date  date;
  v_today       date;
  v_user_id     uuid;
  v_exercise_id uuid;
  v_daily_total int;
  v_prev_best   int;
  v_rank        int;
BEGIN
  -- ── Zeile identifizieren ─────────────────────────────────────────────────
  IF TG_OP = 'DELETE' THEN
    v_user_id     := OLD.user_id;
    v_exercise_id := OLD.exercise_id;
    v_event_date  := (OLD.performed_at AT TIME ZONE 'Europe/Berlin')::date;
  ELSE -- UPDATE
    v_user_id     := NEW.user_id;
    v_exercise_id := NEW.exercise_id;
    -- Beim Update immer altes Datum verwenden (performed_at ändert sich nicht)
    v_event_date  := (OLD.performed_at AT TIME ZONE 'Europe/Berlin')::date;
  END IF;

  -- ── Nur bekannte Übungen ─────────────────────────────────────────────────
  SELECT slug INTO v_slug FROM exercises WHERE id = v_exercise_id;
  IF v_slug IS NULL OR v_slug NOT IN ('pushups') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- ── Nur heutige Einträge (vergangene Tage sind eingefroren) ──────────────
  v_today := (now() AT TIME ZONE 'Europe/Berlin')::date;
  IF v_event_date != v_today THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- ── Neue Tagessumme nach der Änderung berechnen ──────────────────────────
  -- AFTER-Trigger: beim DELETE ist die Zeile bereits weg, beim UPDATE ist sie
  -- bereits auf den neuen Wert gesetzt → SUM() liefert immer den korrekten
  -- Nachher-Wert.
  SELECT COALESCE(SUM(amount), 0)::int INTO v_daily_total
  FROM workout_entries
  WHERE user_id     = v_user_id
    AND exercise_id = v_exercise_id
    AND (performed_at AT TIME ZONE 'Europe/Berlin')::date = v_today;

  -- ── 1. live_activity aktualisieren ───────────────────────────────────────
  -- UPDATE statt DELETE: ein UPDATE-Realtime-Event gelangt zuverlässig zum
  -- Frontend; ein DELETE-Event hätte payload.new = null und würde den
  -- liveActivity-State nicht korrekt leeren.
  UPDATE live_activity
  SET today_total  = v_daily_total,
      last_delta   = 0,           -- nicht sinnvoll bei Delete/Edit
      last_updated = now()
  WHERE user_id = v_user_id;
  -- Falls noch kein live_activity-Eintrag existiert: kein INSERT nötig
  -- (wird erst beim nächsten Workout-INSERT angelegt).

  -- ── 2. Meilenstein-Events verfallen lassen ────────────────────────────────
  -- Nur Events, bei denen der Schwellwert die neue Tagessumme überschreitet.
  UPDATE feed_events
  SET expires_at = now() - INTERVAL '1 second'
  WHERE user_id    = v_user_id
    AND exercise_id = v_exercise_id
    AND event_date  = v_today
    AND (expires_at IS NULL OR expires_at > now())
    AND event_type IN (
      'milestone_20', 'milestone_50', 'milestone_100',
      'milestone_250', 'milestone_500', 'milestone_1000'
    )
    AND CASE event_type
          WHEN 'milestone_20'   THEN v_daily_total < 20
          WHEN 'milestone_50'   THEN v_daily_total < 50
          WHEN 'milestone_100'  THEN v_daily_total < 100
          WHEN 'milestone_250'  THEN v_daily_total < 250
          WHEN 'milestone_500'  THEN v_daily_total < 500
          WHEN 'milestone_1000' THEN v_daily_total < 1000
          ELSE false
        END;

  -- ── 3. Tagesrekord-Event prüfen ───────────────────────────────────────────
  SELECT COALESCE(MAX(day_total), 0)::int INTO v_prev_best
  FROM (
    SELECT SUM(amount) AS day_total
    FROM workout_entries
    WHERE user_id     = v_user_id
      AND exercise_id = v_exercise_id
      AND (performed_at AT TIME ZONE 'Europe/Berlin')::date < v_today
    GROUP BY (performed_at AT TIME ZONE 'Europe/Berlin')::date
  ) sub;

  IF v_daily_total <= v_prev_best THEN
    -- Kein Rekord mehr → Event verfallen lassen
    UPDATE feed_events
    SET expires_at = now() - INTERVAL '1 second'
    WHERE user_id    = v_user_id
      AND exercise_id = v_exercise_id
      AND event_date  = v_today
      AND event_type  = 'daily_record'
      AND (expires_at IS NULL OR expires_at > now());
  ELSE
    -- Noch ein Rekord, aber mit neuer (niedrigerer) Summe → Metadata aktualisieren
    UPDATE feed_events
    SET metadata = jsonb_set(
          metadata,
          '{reps}',
          to_jsonb(v_daily_total)
        )
    WHERE user_id    = v_user_id
      AND exercise_id = v_exercise_id
      AND event_date  = v_today
      AND event_type  = 'daily_record'
      AND (expires_at IS NULL OR expires_at > now());
  END IF;

  -- ── 4. Aktuellen Rang ermitteln ───────────────────────────────────────────
  IF v_daily_total = 0 THEN
    v_rank := NULL; -- keine Einträge → kein Rang
  ELSE
    SELECT rnk INTO v_rank
    FROM (
      SELECT
        user_id,
        ROW_NUMBER() OVER (
          ORDER BY day_total DESC, max_ts ASC
        )::int AS rnk
      FROM (
        SELECT
          user_id,
          SUM(amount)       AS day_total,
          MAX(performed_at) AS max_ts
        FROM workout_entries
        WHERE exercise_id = v_exercise_id
          AND (performed_at AT TIME ZONE 'Europe/Berlin')::date = v_today
        GROUP BY user_id
      ) totals
    ) ranked
    WHERE ranked.user_id = v_user_id;
  END IF;

  -- ── 5. Platz-1-Event prüfen ───────────────────────────────────────────────
  -- Falls der Nutzer nicht mehr auf Rang 1 ist, Platz-1-Event verfallen lassen.
  IF v_rank IS NULL OR v_rank > 1 THEN
    UPDATE feed_events
    SET expires_at = now() - INTERVAL '1 second'
    WHERE user_id    = v_user_id
      AND exercise_id = v_exercise_id
      AND event_date  = v_today
      AND event_type  = 'place1_new'
      AND (expires_at IS NULL OR expires_at > now());
  END IF;

  -- ── 6. Rang-verbessert-Events verfallen lassen ────────────────────────────
  -- rank_improved und quick_starter sind transient: Sie beziehen sich auf den
  -- Rang-Snapshot zum Zeitpunkt des jeweiligen Satzes. Nach einer Bearbeitung
  -- ist der Snapshot veraltet. Beim nächsten gültigen INSERT werden sie ggf.
  -- neu erzeugt.
  UPDATE feed_events
  SET expires_at = now() - INTERVAL '1 second'
  WHERE user_id    = v_user_id
    AND exercise_id = v_exercise_id
    AND event_date  = v_today
    AND event_type  IN ('rank_improved', 'quick_starter')
    AND (expires_at IS NULL OR expires_at > now());

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- Kein GRANT: Funktion wird nur als DB-Trigger aufgerufen.
REVOKE ALL ON FUNCTION public.invalidate_workout_feed_events() FROM PUBLIC, anon, authenticated;

-- ── Trigger anlegen ───────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_workout_invalidate_feed ON public.workout_entries;

CREATE TRIGGER trg_workout_invalidate_feed
  AFTER DELETE OR UPDATE ON public.workout_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.invalidate_workout_feed_events();
