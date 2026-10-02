-- Sports+ golf: Fairway. Scored client-side and capped. Stroke play: 100 a
-- Stableford point, 40 a place beaten and 1,000 for winning, so a strong nine
-- is around 2,500–4,500. Closest to the pin: up to 250 a ball, 1,000 for an ace.
insert into public.games (slug, title, category, status, max_score, max_score_per_second, xp_divisor)
values ('fairway', 'Fairway', 'sports', 'live', 6000, 150, 5)
on conflict (slug) do update
  set title = excluded.title, category = excluded.category, status = excluded.status,
      max_score = excluded.max_score, max_score_per_second = excluded.max_score_per_second, xp_divisor = excluded.xp_divisor;
