-- handle_new_user() runs with search_path = '', where citext's case-insensitive "=" is not
-- resolvable, so the availability check compared case-sensitively and a signup could hit the
-- unique index ("NeonVandal" vs "neonvandal"). Compare lower()-ed text instead, and retry on
-- unique_violation so two concurrent signups can't collide either.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  base text;
  candidate text;
  attempts integer := 0;
begin
  base := regexp_replace(
    coalesce(
      meta ->> 'username',
      meta ->> 'preferred_username',
      meta ->> 'user_name',
      meta ->> 'full_name',
      meta ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    '[^A-Za-z0-9_]', '', 'g'
  );
  base := left(coalesce(base, ''), 14);
  if char_length(base) < 3 then
    base := 'player';
  end if;

  candidate := base;
  loop
    attempts := attempts + 1;
    if not exists (select 1 from public.profiles p where lower(p.username::text) = lower(candidate)) then
      begin
        insert into public.profiles (id, username, avatar_url)
        values (
          new.id,
          candidate,
          case when meta ->> 'avatar_url' ~ '^https://' then meta ->> 'avatar_url' end
        );
        exit;
      exception when unique_violation then
        null; -- lost a race for this name; try another
      end;
    end if;
    if attempts >= 20 then
      raise exception 'could not allocate a username' using errcode = '23505';
    end if;
    candidate := base || '_' || floor(random() * 100000)::int::text;
  end loop;

  insert into public.daily_streaks (user_id) values (new.id);
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
