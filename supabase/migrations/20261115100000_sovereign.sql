-- Sovereign, the free real-time grand strategy game on the real world map. Its score is what your
-- nation is worth (its GDP a year, its land and anything it has formed), posted as you play and
-- finally when you fall, step down or leave. A superpower starts in the tens of thousands; a world
-- conquest runs past a million, so the cap is generous and the rate check allows a big start.
insert into public.games (slug, title, category, status, max_score, max_score_per_second, xp_divisor)
values ('sovereign', 'Sovereign', 'strategy', 'live', 2000000, 400, 100)
on conflict (slug) do update
  set title = excluded.title, category = excluded.category, status = excluded.status,
      max_score = excluded.max_score, max_score_per_second = excluded.max_score_per_second, xp_divisor = excluded.xp_divisor;
