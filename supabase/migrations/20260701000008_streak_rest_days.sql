-- Neue compute_streak Funktion mit Ruhetag-Regeln:
--   1. Max. 2 Ruhetage pro ISO-Woche (Mo–So) in Europe/Berlin
--   2. 2 aufeinanderfolgende Ruhetage brechen die Streak
--   3. Erlaubte Ruhetage zählen als Streak-erhaltend
--   4. Streak = 0 wenn kein Trainingstag im gültigen Chain

create or replace function public.compute_streak(p_user uuid, p_exercise uuid)
returns integer
language plpgsql stable
set search_path = public
as $$
declare
  v_today      date := (now() at time zone 'Europe/Berlin')::date;
  v_streak     int  := 0;
  v_consec     int  := 0;
  v_has_train  bool := false;
  v_day        date;
  v_amount     bigint;
  v_wk         date;   -- ISO-Montag der Woche
  v_wk_rest    int;
  i            int;
begin
  -- Tägliche Summen (Europe/Berlin) der letzten 366 Tage vorberechnen in temporärer Tabelle
  create temp table _streak_days on commit drop as
    select
      (performed_at at time zone 'Europe/Berlin')::date as d,
      sum(amount)                                        as total
    from public.workout_entries
    where user_id     = p_user
      and exercise_id = p_exercise
      and (performed_at at time zone 'Europe/Berlin')::date
          between v_today - 366 and v_today
    group by 1;

  -- Ruhetage je ISO-Woche vorberechnen (nur Tage bis heute)
  create temp table _week_rests on commit drop as
    select
      date_trunc('week', s.d::timestamp)::date as wk,
      count(*)::int                             as rest_count
    from (
      select generate_series(v_today - 366, v_today, '1 day'::interval)::date as d
    ) s
    left join _streak_days sd on sd.d = s.d
    where coalesce(sd.total, 0) = 0   -- Ruhetag = kein Eintrag oder Summe 0
    group by 1;

  -- Rückwärts von heute
  for i in 0..365 loop
    v_day := v_today - i;

    -- Menge für diesen Tag
    select coalesce(total, 0) into v_amount
    from _streak_days
    where d = v_day;

    if v_amount > 0 then
      -- Trainingstag
      v_consec    := 0;
      v_streak    := v_streak + 1;
      v_has_train := true;
    else
      -- Ruhetag
      v_consec := v_consec + 1;

      -- Regel: 2 aufeinanderfolgende Ruhetage
      if v_consec >= 2 then exit; end if;

      -- Regel: >2 Ruhetage in dieser ISO-Woche
      v_wk := date_trunc('week', v_day::timestamp)::date;
      select coalesce(rest_count, 0) into v_wk_rest
      from _week_rests where wk = v_wk;

      if v_wk_rest > 2 then exit; end if;

      v_streak := v_streak + 1;
    end if;
  end loop;

  if not v_has_train then return 0; end if;
  return v_streak;
end;
$$;

grant execute on function public.compute_streak(uuid, uuid) to authenticated;
