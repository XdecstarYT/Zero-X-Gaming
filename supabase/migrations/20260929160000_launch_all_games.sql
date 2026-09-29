-- Phase 5: Grid Lock, Orbit and Blitz Trivia ship.
-- Grid Lock's plausibility ceiling rises to 800 pts/s: a simulated greedy bot making
-- four optimal moves per second (faster than humanly possible) peaks around 520 pts/s,
-- and the limit is an anti-cheat ceiling, so it needs headroom above that.

update public.games set status = 'live' where slug in ('grid-lock', 'orbit', 'blitz-trivia');
update public.games set max_score_per_second = 800 where slug = 'grid-lock';
