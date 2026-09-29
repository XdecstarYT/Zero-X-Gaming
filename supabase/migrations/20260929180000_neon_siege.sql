-- Neon Siege (arena FPS). Only the solo "Siege" mode vs AI bots is ranked; online
-- matches are peer-to-peer and never call submit_score.
-- Plausibility ceiling: an aimbot simulation (instant perfect aim) stays under 1,500 pts/s.

alter table public.games drop constraint if exists games_category_check;
alter table public.games add constraint games_category_check
  check (category in ('arcade', 'puzzle', 'runner', 'trivia', 'shooter'));

insert into public.games (slug, title, category, status, max_score, max_score_per_second, xp_divisor)
values ('neon-siege', 'Neon Siege', 'shooter', 'live', 2000000, 1500, 100);
