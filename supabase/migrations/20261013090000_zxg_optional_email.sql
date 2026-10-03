-- ZXG accounts with an optional email.
--
-- No email: the account signs in as the hidden `name@zxg-acc.invalid`, as before. With one: Auth stores the real
-- address (so "forgot password" can reach it) and the account name stays the player name. Either way the account
-- is created confirmed and nothing is mailed. The account name always works for signing in: zxg_login_email
-- hands back an email account's address only to someone who already has its password.

create or replace function public.zxg_create_account(p_name text, p_password text, p_email text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  nm text := trim(coalesce(p_name, ''));
  mail text := lower(trim(coalesce(p_email, '')));
  em text;
  uid uuid := gen_random_uuid();
begin
  if nm !~ '^[A-Za-z0-9_]{3,20}$' then
    raise exception 'Use 3 to 20 letters, numbers and underscores.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_password, '')) < 8 or char_length(p_password) > 72 then
    raise exception 'Passwords need 8 to 72 characters.' using errcode = '22023';
  end if;
  if mail <> '' and (mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(mail) > 254 or mail like '%@zxg-acc.invalid') then
    raise exception 'That email address doesn''t look right.' using errcode = '22023';
  end if;
  em := case when mail = '' then lower(nm) || '@zxg-acc.invalid' else mail end;
  if (select count(*) from auth.users where created_at > now() - interval '1 minute') >= 30 then
    raise exception 'rate limit: too many new accounts, try again in a minute' using errcode = '54000';
  end if;
  if exists (select 1 from public.profiles where lower(username::text) = lower(nm))
     or exists (select 1 from auth.users where lower(email) = lower(nm) || '@zxg-acc.invalid') then
    raise exception 'User already registered' using errcode = '23505';
  end if;
  if mail <> '' and exists (select 1 from auth.users where lower(email) = mail) then
    raise exception 'That email is already on another account.' using errcode = '22023';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token, is_sso_user, is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', em,
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb, jsonb_build_object('username', nm), now(), now(),
    '', '', '', '', '', '', '', '', false, false
  );
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (uid::text, uid, jsonb_build_object('sub', uid::text, 'email', em, 'email_verified', true, 'phone_verified', false), 'email', now(), now(), now());
end;
$$;

-- The original no-email sign-up, now a front for the above (older clients still call it).
create or replace function public.zxg_sign_up(p_name text, p_password text)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.zxg_create_account(p_name, p_password, null);
$$;

-- Signing in by account name to an account that has an email: the address, if (and only if) the password is right.
create or replace function public.zxg_login_email(p_name text, p_password text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  u record;
begin
  select a.email, a.encrypted_password into u
    from public.profiles p join auth.users a on a.id = p.id
   where lower(p.username::text) = lower(trim(coalesce(p_name, '')))
   limit 1;
  if u.email is null or u.encrypted_password is null then
    return null;
  end if;
  if u.encrypted_password = extensions.crypt(coalesce(p_password, ''), u.encrypted_password) then
    return u.email;
  end if;
  return null;
end;
$$;

-- Add (or change) the email on your own account. Your account name keeps working for signing in.
create or replace function public.zxg_set_email(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  mail text := lower(trim(coalesce(p_email, '')));
  nm text;
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = '22023';
  end if;
  if mail = '' then
    -- Back to no email: the hidden address from the account name.
    select lower(username::text) into nm from public.profiles where id = uid;
    mail := nm || '@zxg-acc.invalid';
  elsif mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(mail) > 254 or mail like '%@zxg-acc.invalid' then
    raise exception 'That email address doesn''t look right.' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users where lower(email) = mail and id <> uid) then
    raise exception 'That email is already on another account.' using errcode = '22023';
  end if;
  update auth.users set email = mail, email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now() where id = uid;
  update auth.identities set identity_data = identity_data || jsonb_build_object('email', mail, 'email_verified', true), updated_at = now() where user_id = uid and provider = 'email';
end;
$$;

revoke execute on function public.zxg_create_account(text, text, text), public.zxg_sign_up(text, text), public.zxg_login_email(text, text), public.zxg_set_email(text) from public;
grant execute on function public.zxg_create_account(text, text, text), public.zxg_sign_up(text, text), public.zxg_login_email(text, text) to anon, authenticated;
grant execute on function public.zxg_set_email(text) to authenticated;
