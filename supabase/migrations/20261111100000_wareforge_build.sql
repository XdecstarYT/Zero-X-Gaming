-- WareForge build update: buildings you put up and let count toward net worth, so a season can end
-- much richer and the score cap rises. Scoring itself is unchanged (a sandbox game never submits).
update public.games set max_score = 3000000 where slug = 'wareforge';
