-- Migration: Stable ranking with tiebreaker for daily recaps
-- Rule: On equal pushup count, whoever reached that count first keeps their rank.
-- To overtake someone, you need at least +1 pushup.
-- Implementation: RANK() → ROW_NUMBER() ordered by (total DESC, MAX(performed_at) ASC)
-- Also: ON CONFLICT DO NOTHING → DO UPDATE so regeneration works

CREATE OR REPLACE FUNCTION public.generate_daily_recaps(
  p_date date DEFAULT (now() AT TIME ZONE 'Europe/Berlin')::date
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ex_id uuid;
  v_top3  jsonb;
BEGIN
  FOR v_ex_id IN SELECT id FROM exercises LOOP

    -- Top-3 JSON (ROW_NUMBER with tiebreaker: same count → earlier entry wins)
    SELECT jsonb_agg(sub.entry ORDER BY (sub.entry->>'rank')::int)
    INTO v_top3
    FROM (
      SELECT jsonb_build_object(
        'rank',    rn,
        'name',    COALESCE(p.display_name, p.username),
        'avatar',  p.avatar_url,
        'pushups', daily_total
      ) AS entry
      FROM (
        SELECT
          we.user_id,
          SUM(we.amount)::int AS daily_total,
          ROW_NUMBER() OVER (
            ORDER BY SUM(we.amount) DESC, MAX(we.performed_at) ASC
          )::int AS rn
        FROM workout_entries we
        WHERE we.exercise_id = v_ex_id
          AND (we.performed_at AT TIME ZONE 'Europe/Berlin')::date = p_date
        GROUP BY we.user_id
      ) ranked
      JOIN profiles p ON p.id = ranked.user_id
      WHERE rn <= 3
    ) sub;

    -- Upsert recap per enrolled user
    INSERT INTO daily_recaps (
      user_id, exercise_id, recap_date,
      yesterday_pushups, prev_day_pushups,
      yesterday_rank, yesterday_medal, top_three
    )
    SELECT
      ee.user_id,
      v_ex_id,
      p_date,
      COALESCE(ut.daily_total, 0)::int,
      COALESCE(prev.daily_total, 0)::int,
      ut.rn,
      CASE ut.rn
        WHEN 1 THEN 'gold'
        WHEN 2 THEN 'silver'
        WHEN 3 THEN 'bronze'
        ELSE NULL
      END,
      v_top3
    FROM exercise_enrollments ee
    LEFT JOIN (
      SELECT
        we.user_id,
        SUM(we.amount)::int AS daily_total,
        ROW_NUMBER() OVER (
          ORDER BY SUM(we.amount) DESC, MAX(we.performed_at) ASC
        )::int AS rn
      FROM workout_entries we
      WHERE we.exercise_id = v_ex_id
        AND (we.performed_at AT TIME ZONE 'Europe/Berlin')::date = p_date
      GROUP BY we.user_id
    ) ut ON ut.user_id = ee.user_id
    LEFT JOIN (
      SELECT user_id, SUM(amount)::int AS daily_total
      FROM workout_entries
      WHERE exercise_id = v_ex_id
        AND (performed_at AT TIME ZONE 'Europe/Berlin')::date = p_date - 1
      GROUP BY user_id
    ) prev ON prev.user_id = ee.user_id
    WHERE ee.exercise_id = v_ex_id
      AND ee.status = 'enrolled'
    ON CONFLICT (user_id, exercise_id, recap_date) DO UPDATE SET
      yesterday_pushups = EXCLUDED.yesterday_pushups,
      prev_day_pushups  = EXCLUDED.prev_day_pushups,
      yesterday_rank    = EXCLUDED.yesterday_rank,
      yesterday_medal   = EXCLUDED.yesterday_medal,
      top_three         = EXCLUDED.top_three;

  END LOOP;
END;
$$;
