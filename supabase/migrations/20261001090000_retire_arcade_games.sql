-- The hub now carries only its two 3D shooters (Trenches, Neon Siege). The four
-- launch games are retired, not deleted: their scores, favourites and the
-- All-Rounder badges already earned stay intact, but submit_score refuses them.
update public.games set status = 'retired'
where slug in ('zero-dash', 'grid-lock', 'orbit', 'blitz-trivia');

update public.achievements set description = 'Legacy: scored in every launch game.'
where id = 'all-rounder';
