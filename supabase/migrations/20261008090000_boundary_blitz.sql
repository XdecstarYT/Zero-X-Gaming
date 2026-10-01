-- Sports+ cricket: Boundary Blitz (T20). Scored client-side and capped:
-- your runs, 20 a wicket, 4 a six and 150 for a win. A 20-over match with a
-- big innings and a few wickets is around 400–600; a fast 2-over slog makes
-- about 2 points a second at most.
insert into public.games (slug, title, category, status, max_score, max_score_per_second, xp_divisor)
values ('boundary-blitz', 'Boundary Blitz', 'sports', 'live', 3000, 8, 3)
on conflict (slug) do update
  set title = excluded.title, category = excluded.category, status = excluded.status,
      max_score = excluded.max_score, max_score_per_second = excluded.max_score_per_second, xp_divisor = excluded.xp_divisor;
