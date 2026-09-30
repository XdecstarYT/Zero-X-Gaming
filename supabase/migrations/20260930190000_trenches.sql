-- Trenches (war FPS, Conquest). Matches are peer-to-peer lobbies and are not
-- ranked: this row exists so the game can be favourited and rated.
insert into public.games (slug, title, category, status, max_score, max_score_per_second, xp_divisor)
values ('trenches', 'Trenches', 'shooter', 'live', 2000000, 1500, 100)
on conflict (slug) do nothing;
