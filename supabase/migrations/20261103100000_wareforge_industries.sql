-- WareForge industry update: industries, stores and managers let a business grow much bigger in a
-- season, so the score cap rises. Scoring itself is unchanged (a sandbox game never submits).
update public.games set max_score = 1500000 where slug = 'wareforge';
