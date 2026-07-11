-- Migration: display_name_confirmed + fix handle_new_user trigger
-- Neue Spalte: false = Anzeigename noch nicht bewusst bestätigt

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name_confirmed boolean NOT NULL DEFAULT false;

-- Bestehende User als bestätigt markieren (kein Onboarding-Prompt für sie)
UPDATE public.profiles SET display_name_confirmed = true;

-- Trigger: liest first_name/last_name (manuelle Reg) und given_name/family_name (Google)
-- Setzt display_name_confirmed = false damit neuer User seinen Anzeigenamen wählen kann
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
declare
  base        text;
  candidate   text;
  suffix      int := 0;
  v_first     text;
  v_last      text;
  v_display   text;
begin
  base := lower(coalesce(
    new.raw_user_meta_data ->> 'user_name',
    new.raw_user_meta_data ->> 'preferred_username',
    split_part(coalesce(new.email, ''), '@', 1),
    'athlet'
  ));
  base := regexp_replace(base, '[^a-z0-9_]', '', 'g');
  if base is null or char_length(base) < 3 then
    base := 'athlet';
  end if;
  base := left(base, 16);

  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    suffix := suffix + 1;
    candidate := left(base, 14) || suffix::text;
    if suffix > 9999 then
      candidate := left(base, 10) || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
      exit;
    end if;
  end loop;

  v_first := coalesce(
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'given_name',
    ''
  );
  v_last := coalesce(
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'family_name',
    ''
  );

  if trim(v_first) <> '' and trim(v_last) <> '' then
    v_display := trim(v_first) || ' ' || trim(v_last);
  else
    v_display := coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      candidate
    );
  end if;

  insert into public.profiles (id, username, display_name, display_name_confirmed, avatar_url)
  values (
    new.id,
    candidate,
    left(v_display, 50),
    false,
    NULL
  )
  on conflict (id) do nothing;

  if trim(v_first) <> '' and trim(v_last) <> '' then
    insert into public.user_identities (user_id, first_name, last_name)
    values (new.id, trim(v_first), trim(v_last))
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;
