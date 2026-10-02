-- Hometown, part 4: City Hall, the town view, function grants and the seed.

-- City Hall. Elections run every six hours: anyone can stand (a 100 filing fee to the treasury)
-- with a slogan and a platform (sales tax and public wage); every citizen gets one vote, which
-- they can change until polls close. The winner becomes mayor and their platform takes effect;
-- the mayor can adjust it within the legal limits until the next election.

create or replace function public.town_run(p_slogan text, p_sales_tax numeric, p_public_wage integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.town__uid();
  el bigint;
begin
  perform public.town__tick();
  select id into el from public.town_elections where not resolved order by id desc limit 1;
  if exists (select 1 from public.town_candidates where election_id = el and user_id = uid) then
    raise exception 'You are already on the ballot';
  end if;
  if char_length(trim(coalesce(p_slogan, ''))) not between 3 and 80 then
    raise exception 'Slogans are 3 to 80 letters';
  end if;
  if p_sales_tax is null or p_sales_tax < 0 or p_sales_tax > 0.2 or p_public_wage is null or p_public_wage < 20 or p_public_wage > 200 then
    raise exception 'Tax 0 to 20 percent, wage 20 to 200';
  end if;
  perform public.town__cash(uid, -100);
  perform public.town__treasury(100);
  insert into public.town_candidates (election_id, user_id, slogan, sales_tax, public_wage)
  values (el, uid, trim(p_slogan), round(p_sales_tax, 3), p_public_wage);
  perform public.town__news('election', public.town__name(uid) || ' is running for mayor: ' || trim(p_slogan));
end;
$$;

create or replace function public.town_vote(p_candidate uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.town__uid();
  el bigint;
begin
  perform public.town__tick();
  select id into el from public.town_elections where not resolved order by id desc limit 1;
  if not exists (select 1 from public.town_candidates where election_id = el and user_id = p_candidate) then
    raise exception 'They are not on the ballot';
  end if;
  insert into public.town_votes (election_id, voter, candidate) values (el, uid, p_candidate)
  on conflict (election_id, voter) do update set candidate = excluded.candidate;
end;
$$;

create or replace function public.town_set_policy(p_sales_tax numeric, p_public_wage integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.town__uid();
begin
  if (select mayor from public.town_state where id = 1) is distinct from uid then
    raise exception 'Only the mayor can do that';
  end if;
  if p_sales_tax is null or p_sales_tax < 0 or p_sales_tax > 0.2 or p_public_wage is null or p_public_wage < 20 or p_public_wage > 200 then
    raise exception 'Tax 0 to 20 percent, wage 20 to 200';
  end if;
  update public.town_state set sales_tax = round(p_sales_tax, 3), public_wage = p_public_wage, updated_at = now() where id = 1;
  perform public.town__news('policy', 'Mayor ' || public.town__name(uid) || ' set the sales tax to ' || round(p_sales_tax * 100, 1) || '% and the public wage to ' || p_public_wage);
end;
$$;


create or replace function public.town_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  el public.town_elections;
begin
  perform public.town__tick();
  select * into el from public.town_elections where not resolved order by id desc limit 1;
  return jsonb_build_object(
    'now', now(),
    'state', (
      select jsonb_build_object('mayor', s.mayor, 'mayorName', case when s.mayor is null then null else public.town__name(s.mayor) end,
        'salesTax', s.sales_tax, 'publicWage', s.public_wage, 'treasury', s.treasury)
        from public.town_state s where s.id = 1),
    'citizens', (select count(*) from public.town_citizens),
    'rich', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'cash', cash) order by cash desc)
        from (select name, cash from public.town_citizens order by cash desc limit 5) r), '[]'::jsonb),
    'plots', (
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'owner', p.owner, 'ownerName', case when p.owner is null then null else public.town__name(p.owner) end,
        'price', p.price, 'salePrice', p.sale_price, 'at', p.updated_at,
        'business', (select jsonb_build_object('id', b.id, 'kind', b.kind, 'name', b.name, 'total', b.total, 'producedAt', b.produced_at)
                       from public.town_businesses b where b.plot_id = p.id),
        'shop', (select jsonb_build_object('name', sh.name, 'items', coalesce((
                    select jsonb_agg(jsonb_build_object('item', si.item, 'price', si.price, 'qty', si.qty) order by si.item)
                      from public.town_shop_items si where si.plot_id = sh.plot_id and si.qty > 0), '[]'::jsonb))
                   from public.town_shops sh where sh.plot_id = p.id)
      ) order by p.id) from public.town_plots p),
    'book', coalesce((
      select jsonb_agg(jsonb_build_object('item', item, 'side', side, 'price', price, 'qty', qty) order by item, side, price)
        from (select item, side, price, sum(qty)::integer as qty from public.town_orders where open group by item, side, price) bk), '[]'::jsonb),
    'last', coalesce((
      select jsonb_object_agg(item, price)
        from (select distinct on (item) item, price from public.town_trades order by item, at desc, id desc) lt), '{}'::jsonb),
    'trades', coalesce((
      select jsonb_agg(jsonb_build_object('item', item, 'price', price, 'qty', qty, 'via', via, 'at', at) order by id desc)
        from (select * from public.town_trades order by id desc limit 20) t), '[]'::jsonb),
    'election', jsonb_build_object(
      'id', el.id, 'endsAt', el.ends_at,
      'candidates', coalesce((
        select jsonb_agg(jsonb_build_object('id', c.user_id, 'name', public.town__name(c.user_id), 'slogan', c.slogan,
            'salesTax', c.sales_tax, 'publicWage', c.public_wage,
            'votes', (select count(*) from public.town_votes v where v.election_id = c.election_id and v.candidate = c.user_id))
            order by c.created_at)
          from public.town_candidates c where c.election_id = el.id), '[]'::jsonb)),
    'news', coalesce((
      select jsonb_agg(jsonb_build_object('at', at, 'kind', kind, 'text', text) order by id desc)
        from (select * from public.town_log order by id desc limit 25) n), '[]'::jsonb)
  );
end;
$$;

-- Helpers are private; the game API is for signed-in citizens; the town view is for everyone.
revoke execute on function
  public.town__uid(), public.town__inv(uuid, text, integer), public.town__cash(uuid, bigint), public.town__treasury(bigint),
  public.town__energy(uuid), public.town__spend_energy(uuid, integer), public.town__news(text, text), public.town__name(uuid),
  public.town__tick()
from public, anon, authenticated;

revoke execute on function
  public.town_me(), public.town_join(jsonb), public.town_work(text), public.town_eat(),
  public.town_buy_plot(integer), public.town_list_plot(integer, integer), public.town_save_build(integer, jsonb),
  public.town_found_business(integer, text, text), public.town_produce(bigint, integer),
  public.town_place_order(text, text, integer, integer), public.town_cancel_order(bigint),
  public.town_open_shop(integer, text), public.town_stock_shop(integer, text, integer, integer), public.town_buy_shop(integer, text, integer, integer),
  public.town_run(text, numeric, integer), public.town_vote(uuid), public.town_set_policy(numeric, integer),
  public.town_snapshot(), public.town_builds(timestamptz)
from public, anon;

grant execute on function
  public.town_me(), public.town_join(jsonb), public.town_work(text), public.town_eat(),
  public.town_buy_plot(integer), public.town_list_plot(integer, integer), public.town_save_build(integer, jsonb),
  public.town_found_business(integer, text, text), public.town_produce(bigint, integer),
  public.town_place_order(text, text, integer, integer), public.town_cancel_order(bigint),
  public.town_open_shop(integer, text), public.town_stock_shop(integer, text, integer, integer), public.town_buy_shop(integer, text, integer, integer),
  public.town_run(text, numeric, integer), public.town_vote(uuid), public.town_set_policy(numeric, integer)
to authenticated;

grant execute on function public.town_snapshot(), public.town_builds(timestamptz) to anon, authenticated;

-- Open the first election.
select public.town__tick();

insert into public.games (slug, title, category, status, max_score, max_score_per_second, xp_divisor)
values ('hometown', 'Hometown', 'sim', 'live', 100000, 50, 20)
on conflict (slug) do nothing;
