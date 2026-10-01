-- Clanforge (base-building strategy). A new "strategy" category, and the game row.
-- The score is your trophy count when you post it after a raid: a few thousand
-- at most in practice, and it only moves a few dozen trophies a raid.
alter table public.games drop constraint if exists games_category_check;
alter table public.games add constraint games_category_check
  check (category in ('arcade', 'puzzle', 'runner', 'trivia', 'shooter', 'sim', 'sports', 'strategy'));

insert into public.games (slug, title, category, status, max_score, max_score_per_second, xp_divisor)
values ('clanforge', 'Clanforge', 'strategy', 'live', 10000, 1000, 20)
on conflict (slug) do update
  set title = excluded.title, category = excluded.category, status = excluded.status,
      max_score = excluded.max_score, max_score_per_second = excluded.max_score_per_second, xp_divisor = excluded.xp_divisor;
