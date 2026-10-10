-- WareForge super mega update: bigger sites (the Mega hall, rail, two new sites) mean bigger
-- businesses, so the score cap rises. Scoring itself is unchanged.
update public.games set max_score = 600000 where slug = 'wareforge';
