-- Migration: 30min_edit_window
-- ─────────────────────────────────────────────────────────────────────────────
-- Workout-Einträge dürfen nur innerhalb von 30 Minuten nach Erstellung
-- bearbeitet oder gelöscht werden. Danach sind sie unveränderlich.
-- Diese Regel gilt global: Dashboard, Aktivität, alle Erfassungswege.

CREATE OR REPLACE FUNCTION enforce_workout_entry_edit_window()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (now() - OLD.created_at) > INTERVAL '30 minutes' THEN
    RAISE EXCEPTION 'EDIT_WINDOW_EXPIRED';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_workout_edit_window ON workout_entries;
CREATE TRIGGER trg_enforce_workout_edit_window
  BEFORE UPDATE OR DELETE ON workout_entries
  FOR EACH ROW EXECUTE FUNCTION enforce_workout_entry_edit_window();
