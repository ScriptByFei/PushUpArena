-- Migration: feed_invalidation_also_on_insert
-- ─────────────────────────────────────────────────────────────────────────────
-- Problem: Der Trigger trg_workout_invalidate_feed feuert nur auf DELETE/UPDATE.
-- Wenn ein Nutzer Sätze löscht (vor Trigger-Deployment oder über den alten Pfad)
-- und danach neue Sätze hinzufügt, bereinigt der INSERT-Trigger
-- (maybe_create_workout_feed_events) NICHT die stale Milesteine.
--
-- Lösung: Trigger auch auf INSERT erweitern. Beim INSERT nur die stale-Event-
-- Bereinigung laufen lassen (live_activity wird vom anderen INSERT-Trigger
-- maybe_create_workout_feed_events aktualisiert, kein Doppelschreiben nötig).
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
  ELSE -- INSERT oder UPDATE
    v_user_id     := NEW.user_id;
    v_exercise_id := NEW.exercise_id;
    v_event_date  := (
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.performed_at ELSE NEW.performed_at END
      AT TIME ZONE 'Europe/Berlin'
    )::date;
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

  -- ── Neue Tagessumme nach der Änderung ─────────────────────────────────────
  -- AFTER-Trigger: Zeile ist bereits im Endzustand (weg bei DELETE, neu bei INSERT/UPDATE)
  SELECT COALESCE(SUM(amount), 0)::int INTO v_daily_total
  FROM workout_entries
  WHERE user_id     = v_user_id
    AND exercise_id = v_exercise_id
    AND (performed_at AT TIME ZONE 'Europe/Berlin')::date = v_today;

  -- ── 1. live_activity aktualisieren (nur bei DELETE/UPDATE) ────────────────
  -- Beim INSERT macht das bereits maybe_create_workout_feed_events.
  -- Kein Doppelschreiben um Realtime-Spam zu vermeiden.
  IF TG_OP != 'INSERT' THEN
    UPDATE live_activity
    SET today_total  = v_daily_total,
        last_delta   = 0,
        last_updated = now()
    WHERE user_id = v_user_id;
  END IF;

  -- ── 2. Meilenstein-Events verfallen lassen ────────────────────────────────
  -- Feuert bei INSERT, UPDATE und DELETE:
  -- Auch ein nachträglicher INSERT (nach einem Löschvorgang vor Trigger-Deployment)
  -- bereinigt so stale Meilensteine aus dem Feed.
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

  -- ── 3–6. Tagesrekord / Platz-1 / Rang-Events (nur bei DELETE/UPDATE) ──────
  -- Beim INSERT ist der Datenbankstand bereits korrekt (neue Events wurden
  -- vorher von maybe_create_workout_feed_events angelegt). Nur bei Rückgang
  -- (DELETE/UPDATE) müssen diese Events geprüft werden.
  IF TG_OP != 'INSERT' THEN

    -- 3. Tagesrekord
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
      UPDATE feed_events
      SET expires_at = now() - INTERVAL '1 second'
      WHERE user_id    = v_user_id
        AND exercise_id = v_exercise_id
        AND event_date  = v_today
        AND event_type  = 'daily_record'
        AND (expires_at IS NULL OR expires_at > now());
    ELSE
      UPDATE feed_events
      SET metadata = jsonb_set(metadata, '{reps}', to_jsonb(v_daily_total))
      WHERE user_id    = v_user_id
        AND exercise_id = v_exercise_id
        AND event_date  = v_today
        AND event_type  = 'daily_record'
        AND (expires_at IS NULL OR expires_at > now());
    END IF;

    -- 4. Aktuellen Rang ermitteln
    IF v_daily_total = 0 THEN
      v_rank := NULL;
    ELSE
      SELECT rnk INTO v_rank
      FROM (
        SELECT user_id,
               ROW_NUMBER() OVER (ORDER BY day_total DESC, max_ts ASC)::int AS rnk
        FROM (
          SELECT user_id, SUM(amount) AS day_total, MAX(performed_at) AS max_ts
          FROM workout_entries
          WHERE exercise_id = v_exercise_id
            AND (performed_at AT TIME ZONE 'Europe/Berlin')::date = v_today
          GROUP BY user_id
        ) totals
      ) ranked
      WHERE ranked.user_id = v_user_id;
    END IF;

    -- 5. Platz-1-Event verfallen lassen falls nicht mehr Rang 1
    IF v_rank IS NULL OR v_rank > 1 THEN
      UPDATE feed_events
      SET expires_at = now() - INTERVAL '1 second'
      WHERE user_id    = v_user_id
        AND exercise_id = v_exercise_id
        AND event_date  = v_today
        AND event_type  = 'place1_new'
        AND (expires_at IS NULL OR expires_at > now());
    END IF;

    -- 6. Transiente Rang-Events verfallen lassen
    UPDATE feed_events
    SET expires_at = now() - INTERVAL '1 second'
    WHERE user_id    = v_user_id
      AND exercise_id = v_exercise_id
      AND event_date  = v_today
      AND event_type  IN ('rank_improved', 'quick_starter')
      AND (expires_at IS NULL OR expires_at > now());

  END IF; -- END IF TG_OP != 'INSERT'

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- Trigger erweitern: jetzt auch auf INSERT
DROP TRIGGER IF EXISTS trg_workout_invalidate_feed ON public.workout_entries;

CREATE TRIGGER trg_workout_invalidate_feed
  AFTER INSERT OR DELETE OR UPDATE ON public.workout_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.invalidate_workout_feed_events();
