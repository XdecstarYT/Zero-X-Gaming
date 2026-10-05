-- Lifeline, the hospital management sim. Its score is lives saved (patients treated),
-- which builds up slowly across a saved hospital, so a run can bank a big number after
-- a short session: the per-second cap is generous. Open to everyone.
insert into public.games (slug, title, category, status, max_score, max_score_per_second, xp_divisor)
values ('lifeline', 'Lifeline', 'sim', 'live', 100000, 50, 5)
on conflict (slug) do update
  set title = excluded.title, category = excluded.category, status = excluded.status,
      max_score = excluded.max_score, max_score_per_second = excluded.max_score_per_second, xp_divisor = excluded.xp_divisor;
