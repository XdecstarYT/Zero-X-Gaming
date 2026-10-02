-- Hometown, part 3: land and houses, businesses, the market and player shops.


-- ---------------------------------------------------------------------------
-- Land and houses
-- ---------------------------------------------------------------------------

-- Buy an unowned lot from the town, or a listed one from its owner (the seller pays the sales tax).
create or replace function public.town_buy_plot(p_plot integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.town__uid();
  p public.town_plots;
  rate numeric;
  tax bigint;
begin
  select * into p from public.town_plots where id = p_plot for update;
  if p.id is null then
    raise exception 'No such plot';
  end if;
  if p.owner = uid then
    raise exception 'You already own it';
  end if;
  if (select count(*) from public.town_plots where owner = uid) >= 3 then
    raise exception 'Three plots is the limit';
  end if;
  if p.owner is null then
    perform public.town__cash(uid, -p.price);
    perform public.town__treasury(p.price);
  elsif p.sale_price is not null then
    select sales_tax into rate from public.town_state where id = 1;
    tax := floor(p.sale_price * rate);
    perform public.town__cash(uid, -p.sale_price);
    perform public.town__cash(p.owner, p.sale_price - tax);
    perform public.town__treasury(tax);
    -- The house, the business and the shop all go with the land.
    update public.town_businesses set owner = uid where plot_id = p_plot;
    update public.town_shops set owner = uid where plot_id = p_plot;
  else
    raise exception 'That plot is not for sale';
  end if;
  update public.town_plots set owner = uid, sale_price = null, updated_at = now() where id = p_plot;
  perform public.town__news('property', public.town__name(uid) || ' bought lot ' || (p_plot + 1));
end;
$$;

create or replace function public.town_list_plot(p_plot integer, p_price integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.town__uid();
begin
  update public.town_plots set sale_price = p_price, updated_at = now() where id = p_plot and owner = uid;
  if not found then
    raise exception 'Not your plot';
  end if;
end;
$$;

-- Save your house. New walls cost a plank each and new furniture a piece of furniture.
create or replace function public.town_save_build(p_plot integer, p_build jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.town__uid();
  p public.town_plots;
  w integer;
  it integer;
begin
  select * into p from public.town_plots where id = p_plot for update;
  if p.owner is distinct from uid then
    raise exception 'Not your plot';
  end if;
  if pg_column_size(p_build) > 60000 or jsonb_typeof(p_build -> 'walls') <> 'array' or jsonb_typeof(p_build -> 'items') <> 'array' then
    raise exception 'That house plan is too big';
  end if;
  w := jsonb_array_length(p_build -> 'walls');
  it := jsonb_array_length(p_build -> 'items');
  if w > 120 or it > 80 then
    raise exception 'That house plan is too big';
  end if;
  if w > p.walls then
    perform public.town__inv(uid, 'planks', -(w - p.walls));
  end if;
  if it > p.items then
    perform public.town__inv(uid, 'furniture', -(it - p.items));
  end if;
  update public.town_plots set build = p_build, walls = w, items = it, updated_at = now() where id = p_plot;
  return jsonb_build_object('walls', w, 'items', it);
end;
$$;

-- Houses changed since a time (the client keeps the rest).
create or replace function public.town_builds(p_since timestamptz default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'build', build, 'at', updated_at)), '[]'::jsonb)
    from public.town_plots
   where build is not null and (p_since is null or updated_at > p_since);
$$;


-- ---------------------------------------------------------------------------
-- Businesses and production
-- ---------------------------------------------------------------------------

create or replace function public.town_found_business(p_plot integer, p_kind text, p_name text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.town__uid();
  bid bigint;
begin
  if not exists (select 1 from public.town_plots where id = p_plot and owner = uid) then
    raise exception 'You need to own the plot';
  end if;
  if exists (select 1 from public.town_businesses where plot_id = p_plot) then
    raise exception 'There is already a business here';
  end if;
  perform public.town__cash(uid, -800);
  perform public.town__treasury(800);
  insert into public.town_businesses (owner, plot_id, kind, name) values (uid, p_plot, p_kind, trim(p_name)) returning id into bid;
  perform public.town__news('business', public.town__name(uid) || ' opened ' || trim(p_name) || ' (' || p_kind || ')');
  return bid;
end;
$$;

-- Run batches: each takes the recipe's inputs from your inventory and puts the outputs in.
create or replace function public.town_produce(p_business bigint, p_batches integer default 1)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.town__uid();
  b public.town_businesses;
  inputs jsonb;
  output text;
  outn integer;
  k text;
  v text;
  n integer := greatest(1, least(5, coalesce(p_batches, 1)));
begin
  select * into b from public.town_businesses where id = p_business for update;
  if b.owner is distinct from uid then
    raise exception 'Not your business';
  end if;
  if b.produced_at is not null and b.produced_at > now() - interval '15 seconds' then
    raise exception 'The machines are still running';
  end if;
  inputs := case b.kind
    when 'mill' then '{"wheat": 3}'
    when 'bakery' then '{"flour": 2}'
    when 'sawmill' then '{"logs": 3}'
    when 'workshop' then '{"planks": 4}'
    when 'foundry' then '{"ore": 3}'
    when 'smithy' then '{"steel": 1, "planks": 1}'
  end::jsonb;
  output := case b.kind when 'mill' then 'flour' when 'bakery' then 'bread' when 'sawmill' then 'planks' when 'workshop' then 'furniture' when 'foundry' then 'steel' when 'smithy' then 'tools' end;
  outn := case b.kind when 'mill' then 2 when 'bakery' then 3 when 'sawmill' then 2 when 'workshop' then 1 when 'foundry' then 1 when 'smithy' then 2 end;
  perform public.town__spend_energy(uid, 5 * n);
  for k, v in select * from jsonb_each_text(inputs) loop
    perform public.town__inv(uid, k, -(v::integer * n));
  end loop;
  perform public.town__inv(uid, output, outn * n);
  update public.town_businesses set produced_at = now(), total = total + outn * n where id = p_business;
  return jsonb_build_object('item', output, 'qty', outn * n);
end;
$$;


-- The order-book market. Orders escrow what they offer (cash for bids, goods for asks) and match
-- against the best resting orders at the resting price; the seller pays the sales tax to the
-- treasury. Filled and cancelled orders are closed (open = false) and kept as history.

create or replace function public.town_place_order(p_item text, p_side text, p_price integer, p_qty integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.town__uid();
  rate numeric;
  o public.town_orders;
  left_qty integer := p_qty;
  n integer;
  gross bigint;
  tax bigint;
  filled integer := 0;
  oid bigint;
begin
  if p_item not in ('wheat', 'logs', 'ore', 'flour', 'planks', 'steel', 'bread', 'furniture', 'tools') then
    raise exception 'No such item';
  end if;
  if p_side not in ('buy', 'sell') then
    raise exception 'Buy or sell';
  end if;
  if p_price is null or p_price < 1 or p_price > 100000 or p_qty is null or p_qty < 1 or p_qty > 1000 then
    raise exception 'Price 1 to 100000, quantity 1 to 1000';
  end if;
  if (select count(*) from public.town_orders where user_id = uid and open) >= 10 then
    raise exception 'Ten open orders is the limit';
  end if;
  select sales_tax into rate from public.town_state where id = 1;
  -- Escrow the whole order up front.
  if p_side = 'buy' then
    perform public.town__cash(uid, -(p_price::bigint * p_qty));
  else
    perform public.town__inv(uid, p_item, -p_qty);
  end if;
  for o in
    select * from public.town_orders
     where open and item = p_item and side <> p_side and user_id <> uid
       and (case when p_side = 'buy' then price <= p_price else price >= p_price end)
     order by case when p_side = 'buy' then price end asc, case when p_side = 'sell' then price end desc, id
     for update
  loop
    exit when left_qty = 0;
    n := least(left_qty, o.qty);
    gross := o.price::bigint * n;
    tax := floor(gross * rate);
    if p_side = 'buy' then
      -- I pay the resting ask; refund the difference from my bid escrow.
      perform public.town__cash(uid, (p_price - o.price)::bigint * n);
      perform public.town__inv(uid, p_item, n);
      perform public.town__cash(o.user_id, gross - tax);
      insert into public.town_trades (item, price, qty, buyer, seller) values (p_item, o.price, n, uid, o.user_id);
    else
      perform public.town__inv(o.user_id, p_item, n);
      perform public.town__cash(uid, gross - tax);
      insert into public.town_trades (item, price, qty, buyer, seller) values (p_item, o.price, n, o.user_id, uid);
    end if;
    perform public.town__treasury(tax);
    if n = o.qty then
      update public.town_orders set open = false where id = o.id;
    else
      update public.town_orders set qty = qty - n where id = o.id;
    end if;
    left_qty := left_qty - n;
    filled := filled + n;
  end loop;
  if left_qty > 0 then
    insert into public.town_orders (user_id, item, side, price, qty) values (uid, p_item, p_side, p_price, left_qty) returning id into oid;
  end if;
  return jsonb_build_object('filled', filled, 'resting', left_qty, 'order', oid);
end;
$$;

create or replace function public.town_cancel_order(p_order bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.town__uid();
  o public.town_orders;
begin
  select * into o from public.town_orders where id = p_order and user_id = uid and open for update;
  if o.id is null then
    raise exception 'No such open order';
  end if;
  if o.side = 'buy' then
    perform public.town__cash(uid, o.price::bigint * o.qty);
  else
    perform public.town__inv(uid, o.item, o.qty);
  end if;
  update public.town_orders set open = false where id = o.id;
end;
$$;


-- Player shops: a storefront on a plot you own. You move goods from your inventory onto the
-- shelves at your own price; anyone can walk in and buy. The sales tax goes to the treasury.

create or replace function public.town_open_shop(p_plot integer, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.town__uid();
begin
  if not exists (select 1 from public.town_plots where id = p_plot and owner = uid) then
    raise exception 'You need to own the plot';
  end if;
  if exists (select 1 from public.town_shops where plot_id = p_plot) then
    raise exception 'There is already a shop here';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 30 then
    raise exception 'Shop names are 2 to 30 letters';
  end if;
  perform public.town__cash(uid, -200);
  perform public.town__treasury(200);
  insert into public.town_shops (plot_id, owner, name) values (p_plot, uid, trim(p_name));
  perform public.town__news('business', public.town__name(uid) || ' opened a shop: ' || trim(p_name));
end;
$$;

-- p_qty > 0 puts goods on the shelf, p_qty < 0 takes them back; p_price sets the shelf price.
create or replace function public.town_stock_shop(p_plot integer, p_item text, p_price integer, p_qty integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.town__uid();
  have integer;
begin
  if not exists (select 1 from public.town_shops where plot_id = p_plot and owner = uid) then
    raise exception 'Not your shop';
  end if;
  if p_item not in ('wheat', 'logs', 'ore', 'flour', 'planks', 'steel', 'bread', 'furniture', 'tools') then
    raise exception 'No such item';
  end if;
  if p_price is null or p_price < 1 or p_price > 100000 or p_qty is null or abs(p_qty) > 1000 then
    raise exception 'Price 1 to 100000, quantity up to 1000';
  end if;
  insert into public.town_shop_items (plot_id, item, price, qty) values (p_plot, p_item, p_price, 0) on conflict do nothing;
  select qty into have from public.town_shop_items where plot_id = p_plot and item = p_item for update;
  if have + p_qty < 0 then
    raise exception 'Not that many on the shelf';
  end if;
  perform public.town__inv(uid, p_item, -p_qty);
  update public.town_shop_items set qty = qty + p_qty, price = p_price where plot_id = p_plot and item = p_item;
  return have + p_qty;
end;
$$;

create or replace function public.town_buy_shop(p_plot integer, p_item text, p_qty integer, p_price integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.town__uid();
  s public.town_shops;
  si public.town_shop_items;
  rate numeric;
  gross bigint;
  tax bigint;
begin
  select * into s from public.town_shops where plot_id = p_plot;
  if s.plot_id is null then
    raise exception 'No shop here';
  end if;
  if s.owner = uid then
    raise exception 'You own this shop';
  end if;
  if p_qty is null or p_qty < 1 or p_qty > 1000 then
    raise exception 'Buy 1 to 1000';
  end if;
  select * into si from public.town_shop_items where plot_id = p_plot and item = p_item for update;
  if si.qty is null or si.qty < p_qty then
    raise exception 'Not enough on the shelf';
  end if;
  -- The price you saw is the most you pay, so a shopkeeper cannot reprice under you.
  if si.price > p_price then
    raise exception 'The price just went up';
  end if;
  select sales_tax into rate from public.town_state where id = 1;
  gross := si.price::bigint * p_qty;
  tax := floor(gross * rate);
  perform public.town__cash(uid, -gross);
  perform public.town__cash(s.owner, gross - tax);
  perform public.town__treasury(tax);
  perform public.town__inv(uid, p_item, p_qty);
  update public.town_shop_items set qty = qty - p_qty where plot_id = p_plot and item = p_item;
  insert into public.town_trades (item, price, qty, buyer, seller, via) values (p_item, si.price, p_qty, uid, s.owner, 'shop');
end;
$$;
