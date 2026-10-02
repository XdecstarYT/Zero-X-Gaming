-- Life, the flagship life sim. The score is a finished life's score: age,
-- net worth, family, degrees, promotions, happiness, ribbons, days lived in
-- 3D and houses built. A long, full life is several thousand; a life takes
-- at least a few minutes of play (min 60 s is enforced client-side).
insert into public.games (slug, title, category, status, max_score, max_score_per_second, xp_divisor)
values ('life', 'Life', 'sim', 'live', 20000, 60, 10)
on conflict (slug) do update
  set title = excluded.title, category = excluded.category, status = excluded.status,
      max_score = excluded.max_score, max_score_per_second = excluded.max_score_per_second, xp_divisor = excluded.xp_divisor;
