-- Hometown: one shared, persistent online town. Players are citizens with cash, energy and an
-- inventory; they own plots and build houses, run businesses that turn raw goods into products,
-- trade on an order-book market and in their own shops, and elect a mayor who sets the sales tax
-- and the public wage paid from the town treasury.
--
-- Security model: every table is readable (the town is public; inventories only by their owner),
-- and nothing is writable directly. All changes go through SECURITY DEFINER functions that check
-- auth.uid(), lock the rows they touch and keep money and goods conserved (escrow on orders).
-- `game_rooms` style throttles: work and production have server-side cooldowns.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.town_state (
  id integer primary key default 1 check (id = 1),
  mayor uuid references auth.users (id) on delete set null,
  sales_tax numeric(4, 3) not null default 0.05 check (sales_tax between 0 and 0.2),
  public_wage integer not null default 60 check (public_wage between 20 and 200),
  treasury bigint not null default 5000 check (treasury >= 0),
  updated_at timestamptz not null default now()
);
insert into public.town_state (id) values (1);

create table public.town_citizens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 3 and 20),
  cash bigint not null default 1500 check (cash >= 0),
  energy integer not null default 100 check (energy between 0 and 100),
  energy_at timestamptz not null default now(),
  worked_at timestamptz,
  look jsonb not null default '{}'::jsonb check (pg_column_size(look) < 2000),
  created_at timestamptz not null default now()
);

create table public.town_inventory (
  user_id uuid not null references public.town_citizens (user_id) on delete cascade,
  item text not null check (item in ('wheat', 'logs', 'ore', 'flour', 'planks', 'steel', 'bread', 'furniture', 'tools')),
  qty integer not null default 0 check (qty >= 0),
  primary key (user_id, item)
);

create table public.town_plots (
  id integer primary key check (id between 0 and 47),
  owner uuid references public.town_citizens (user_id) on delete set null,
  price integer not null check (price > 0),
  sale_price integer check (sale_price is null or sale_price between 1 and 10000000),
  build jsonb,
  walls integer not null default 0,
  items integer not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.town_plots (id, price)
select i, 900 + (i % 6) * 250 + (case when i % 12 < 6 then 300 else 0 end) from generate_series(0, 47) as i;

create table public.town_businesses (
  id bigserial primary key,
  owner uuid not null references public.town_citizens (user_id) on delete cascade,
  plot_id integer not null unique references public.town_plots (id),
  kind text not null check (kind in ('mill', 'bakery', 'sawmill', 'workshop', 'foundry', 'smithy')),
  name text not null check (char_length(name) between 2 and 30),
  produced_at timestamptz,
  total bigint not null default 0,
  created_at timestamptz not null default now()
);

create table public.town_orders (
  id bigserial primary key,
  user_id uuid not null references public.town_citizens (user_id) on delete cascade,
  item text not null check (item in ('wheat', 'logs', 'ore', 'flour', 'planks', 'steel', 'bread', 'furniture', 'tools')),
  side text not null check (side in ('buy', 'sell')),
  price integer not null check (price between 1 and 100000),
  qty integer not null check (qty > 0),
  -- Filled and cancelled orders are closed, not removed: the book is the open ones.
  open boolean not null default true,
  created_at timestamptz not null default now()
);
create index town_orders_book on public.town_orders (item, side, price);
create index town_orders_open on public.town_orders (item, side, price) where open;

create table public.town_trades (
  id bigserial primary key,
  item text not null,
  price integer not null,
  qty integer not null,
  buyer uuid,
  seller uuid,
  via text not null default 'market',
  at timestamptz not null default now()
);
create index town_trades_at on public.town_trades (at desc);

create table public.town_shops (
  plot_id integer primary key references public.town_plots (id),
  owner uuid not null references public.town_citizens (user_id) on delete cascade,
  name text not null check (char_length(name) between 2 and 30),
  created_at timestamptz not null default now()
);

create table public.town_shop_items (
  plot_id integer not null references public.town_shops (plot_id) on delete cascade,
  item text not null check (item in ('wheat', 'logs', 'ore', 'flour', 'planks', 'steel', 'bread', 'furniture', 'tools')),
  price integer not null check (price between 1 and 100000),
  qty integer not null check (qty >= 0),
  primary key (plot_id, item)
);

create table public.town_elections (
  id bigserial primary key,
  ends_at timestamptz not null,
  resolved boolean not null default false,
  winner uuid,
  turnout integer not null default 0
);

create table public.town_candidates (
  election_id bigint not null references public.town_elections (id) on delete cascade,
  user_id uuid not null references public.town_citizens (user_id) on delete cascade,
  slogan text not null check (char_length(slogan) between 3 and 80),
  sales_tax numeric(4, 3) not null check (sales_tax between 0 and 0.2),
  public_wage integer not null check (public_wage between 20 and 200),
  created_at timestamptz not null default now(),
  primary key (election_id, user_id)
);

create table public.town_votes (
  election_id bigint not null references public.town_elections (id) on delete cascade,
  voter uuid not null references public.town_citizens (user_id) on delete cascade,
  candidate uuid not null,
  primary key (election_id, voter)
);

create table public.town_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  kind text not null,
  text text not null
);
create index town_log_at on public.town_log (at desc);

-- ---------------------------------------------------------------------------
-- RLS: public reads (inventory: owner only), no direct writes
-- ---------------------------------------------------------------------------

alter table public.town_state enable row level security;
alter table public.town_citizens enable row level security;
alter table public.town_inventory enable row level security;
alter table public.town_plots enable row level security;
alter table public.town_businesses enable row level security;
alter table public.town_orders enable row level security;
alter table public.town_trades enable row level security;
alter table public.town_shops enable row level security;
alter table public.town_shop_items enable row level security;
alter table public.town_elections enable row level security;
alter table public.town_candidates enable row level security;
alter table public.town_votes enable row level security;
alter table public.town_log enable row level security;

create policy "Town is public" on public.town_state for select to anon, authenticated using (true);
create policy "Citizens are public" on public.town_citizens for select to anon, authenticated using (true);
create policy "Your inventory" on public.town_inventory for select to authenticated using (user_id = (select auth.uid()));
create policy "Plots are public" on public.town_plots for select to anon, authenticated using (true);
create policy "Businesses are public" on public.town_businesses for select to anon, authenticated using (true);
create policy "The book is public" on public.town_orders for select to anon, authenticated using (true);
create policy "Trades are public" on public.town_trades for select to anon, authenticated using (true);
create policy "Shops are public" on public.town_shops for select to anon, authenticated using (true);
create policy "Shop shelves are public" on public.town_shop_items for select to anon, authenticated using (true);
create policy "Elections are public" on public.town_elections for select to anon, authenticated using (true);
create policy "Candidates are public" on public.town_candidates for select to anon, authenticated using (true);
create policy "Your vote" on public.town_votes for select to authenticated using (voter = (select auth.uid()));
create policy "The news is public" on public.town_log for select to anon, authenticated using (true);

