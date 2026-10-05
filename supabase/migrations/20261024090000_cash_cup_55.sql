-- Cash Cups now drop 55 fighters (was 32): placements and eliminations are
-- checked against the bigger field. Prizes are unchanged.

create or replace function public.finish_cash_cup(
  p_entry bigint, p_placement integer, p_kills integer, p_damage integer, p_chests integer, p_survived_s integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  e public.cash_cup_entries;
  elapsed numeric;
  won integer;
  bal integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into e from public.cash_cup_entries where id = p_entry and user_id = uid for update;
  if not found or e.finished_at is not null then
    raise exception 'no open entry' using errcode = '22023';
  end if;
  elapsed := extract(epoch from now() - e.created_at);
  if elapsed > 40 * 60 then
    update public.cash_cup_entries set finished_at = now() where id = e.id;
    raise exception 'entry expired' using errcode = '22023';
  end if;
  if p_placement is null or p_placement < 1 or p_placement > 55
     or p_kills is null or p_kills < 0 or p_kills > 55 - p_placement
     or p_chests is null or p_chests < 0 or p_chests > 120
     or p_survived_s is null or p_survived_s < 0 or p_survived_s > 1800 or p_survived_s > elapsed + 5
     or p_damage is null or p_damage < 0 or p_damage > 20000 or p_damage > p_survived_s * 200
     or (p_placement = 1 and p_survived_s < 150)
     or (p_placement <= 10 and p_survived_s < 60) then
    raise exception 'match not plausible' using errcode = '22023';
  end if;
  won := public.cash_cup__prize(p_placement, p_kills);
  update public.cash_cup_entries set
    finished_at = now(), placement = p_placement, kills = p_kills, damage = p_damage,
    chests = p_chests, survived_s = p_survived_s, prize = won
    where id = e.id;
  bal := public.add_coins(uid, won, 'cash_cup', 'cup-prize:' || e.id);
  return jsonb_build_object('prize', won, 'coins', bal, 'placement', p_placement);
end;
$$;
