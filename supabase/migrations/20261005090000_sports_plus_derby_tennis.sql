-- Sports+ grows: Diamond Derby (a home run derby) and Ace Rally (singles
-- tennis). Both are in the Sports+ pass, scored client-side and capped.
--  * Derby: 100 a homer plus distance, the longest, 300 a round and 1 000 for
--    the title; a big three-round run is around 15 000, about 25 a second.
--  * Tennis: points, games, sets, aces and winners plus 1 500 for the match,
--    times 1.5 on Legend; a straight-sets win is a few thousand.
insert into public.games (slug, title, category, status, max_score, max_score_per_second, xp_divisor)
values
  ('diamond-derby', 'Diamond Derby', 'sports', 'live', 20000, 40, 10),
  ('ace-rally', 'Ace Rally', 'sports', 'live', 20000, 40, 10)
on conflict (slug) do update
  set title = excluded.title, category = excluded.category, status = excluded.status,
      max_score = excluded.max_score, max_score_per_second = excluded.max_score_per_second, xp_divisor = excluded.xp_divisor;
