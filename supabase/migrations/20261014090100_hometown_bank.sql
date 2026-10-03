-- Hometown: the Town Bank and the daily allowance.
--
-- Savings earn 2% a day, paid by the treasury (accrued lazily whenever you look; if the treasury can't cover it,
-- you get what it has). The allowance is a little cash from the treasury once every 20 hours: the mayor's public
-- wage, so it's another lever in the election.

alter table public.town_citizens add column if not exists savings bigint not null default 0 check (savings >= 0);
alter table public.town_citizens add column if not exists saved_at timestamptz not null default now();
alter table public.town_citizens add column if not exists allowance_at timestamptz;

-- Pay the interest owed since the last look.
create or replace function public.town__interest(p_user uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.town_citizens;
  owed bigint;
  t bigint;
begin
  select * into c from public.town_citizens where user_id = p_user for update;
  owed := floor(c.savings * 0.02 * extract(epoch from (now() - c.saved_at)) / 86400);
  if owed > 0 then
    select treasury into t from public.town_state where id = 1 for update;
    owed := least(owed, t);
    update public.town_state set treasury = treasury - owed where id = 1;
    update public.town_citizens set savings = savings + owed, saved_at = now() where user_id = p_user;
  elsif c.savings = 0 then
    update public.town_citizens set saved_at = now() where user_id = p_user;
  end if;
  return c.savings + greatest(owed, 0);
end;
$$;

create or replace function public.town_bank(p_amount bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.town__uid();
  bal bigint;
begin
  -- Positive deposits, negative withdraws.
  if p_amount is null or p_amount = 0 or abs(p_amount) > 100000000 then
    raise exception 'How much?';
  end if;
  bal := public.town__interest(uid);
  if p_amount > 0 then
    perform public.town__cash(uid, -p_amount);
  elsif bal + p_amount < 0 then
    raise exception 'You don''t have that much saved';
  else
    perform public.town__cash(uid, -p_amount);
  end if;
  update public.town_citizens set savings = savings + p_amount, saved_at = now() where user_id = uid;
  return jsonb_build_object('savings', bal + p_amount);
end;
$$;

create or replace function public.town_allowance()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.town__uid();
  c public.town_citizens;
  pay integer;
begin
  select * into c from public.town_citizens where user_id = uid for update;
  if c.allowance_at is not null and c.allowance_at > now() - interval '20 hours' then
    raise exception 'Your allowance comes again in %', to_char(c.allowance_at + interval '20 hours' - now(), 'HH24"h "MI"m"');
  end if;
  select public_wage into pay from public.town_state where id = 1;
  perform public.town__treasury(-pay);
  perform public.town__cash(uid, pay);
  update public.town_citizens set allowance_at = now() where user_id = uid;
  return pay;
end;
$$;

-- You, now with your savings and when the allowance is next due.
create or replace function public.town_me()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.town__uid();
  e integer := public.town__energy(uid);
  s bigint := public.town__interest(uid);
  c public.town_citizens;
begin
  select * into c from public.town_citizens where user_id = uid;
  return jsonb_build_object(
    'id', uid,
    'name', c.name,
    'cash', c.cash,
    'savings', s,
    'allowanceAt', c.allowance_at,
    'energy', e,
    'workedAt', c.worked_at,
    'look', c.look,
    'inventory', coalesce((select jsonb_object_agg(item, qty) from public.town_inventory where user_id = uid and qty > 0), '{}'::jsonb),
    'orders', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'item', item, 'side', side, 'price', price, 'qty', qty) order by id) from public.town_orders where user_id = uid and open), '[]'::jsonb),
    'voted', (select candidate from public.town_votes v join public.town_elections el on el.id = v.election_id where not el.resolved and v.voter = uid limit 1)
  );
end;
$$;

revoke execute on function public.town__interest(uuid) from public, anon, authenticated;
revoke execute on function public.town_bank(bigint), public.town_allowance() from public, anon;
grant execute on function public.town_bank(bigint), public.town_allowance() to authenticated;
