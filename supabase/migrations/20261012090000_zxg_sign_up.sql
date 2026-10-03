-- ZXG accounts are made here, not by Auth's /signup.
--
-- Auth's sign-up rejects the hidden `name@zxg-acc.invalid` addresses (".invalid" is a reserved TLD) and,
-- with "Confirm email" on, would wait for a confirmation mail that can never be delivered. This function
-- creates the user already confirmed, exactly as Auth stores one (bcrypt password, an email identity), so
-- the normal password sign-in works straight away and no email is ever sent. The handle_new_user trigger
-- still makes the profile from the username in the metadata.

create or replace function public.zxg_sign_up(p_name text, p_password text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  nm text := trim(coalesce(p_name, ''));
  em text := lower(trim(coalesce(p_name, ''))) || '@zxg-acc.invalid';
  uid uuid := gen_random_uuid();
begin
  if nm !~ '^[A-Za-z0-9_]{3,20}$' then
    raise exception 'Use 3 to 20 letters, numbers and underscores.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_password, '')) < 8 or char_length(p_password) > 72 then
    raise exception 'Passwords need 8 to 72 characters.' using errcode = '22023';
  end if;
  -- A brake on scripted sign-ups: at most 30 new accounts a minute across the site.
  if (select count(*) from auth.users where created_at > now() - interval '1 minute') >= 30 then
    raise exception 'rate limit: too many new accounts, try again in a minute' using errcode = '54000';
  end if;
  if exists (select 1 from auth.users where lower(email) = em)
     or exists (select 1 from public.profiles where lower(username::text) = lower(nm)) then
    raise exception 'User already registered' using errcode = '23505';
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

revoke execute on function public.zxg_sign_up(text, text) from public;
grant execute on function public.zxg_sign_up(text, text) to anon, authenticated;
