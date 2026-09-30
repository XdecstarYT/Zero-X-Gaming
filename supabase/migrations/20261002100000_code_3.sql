-- Code 3 (police patrol sim). A new "sim" category, and the game row.
-- Shifts are scored client-side: up to 100 000 points, and at most 80 points a
-- second of active play (a 15-minute shift tops out around 10 000 in practice).
alter table public.games drop constraint if exists games_category_check;
alter table public.games add constraint games_category_check
  check (category in ('arcade', 'puzzle', 'runner', 'trivia', 'shooter', 'sim'));

insert into public.games (slug, title, category, status, max_score, max_score_per_second, xp_divisor)
values ('code-3', 'Code 3', 'sim', 'live', 100000, 80, 20)
on conflict (slug) do update
  set title = excluded.title, category = excluded.category, status = excluded.status,
      max_score = excluded.max_score, max_score_per_second = excluded.max_score_per_second, xp_divisor = excluded.xp_divisor;
