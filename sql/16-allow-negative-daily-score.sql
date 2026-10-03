-- =====================================================================
-- Air Bartoli - Migration 16 : Score de journée négatif autorisé & plancher global à 0
-- 1. Les malus saisis dans add_event ne sont plus écrêtés à 0 à l'insertion :
--    l'enfant peut descendre dans le négatif au sein de la journée.
-- 2. daily_settlements conserve le score réel du jour (day_score peut être négatif),
--    mais wallet_points et savings_points restent >= 0 (0 point crédité si négatif).
-- 3. La vue v_daily expose daily_score (score réel du comportement du jour)
--    et counted_score (score comptabilisé sur le compteur global, plancher 0).
-- 4. Le solde global ne descend jamais en dessous de 0 (garanti par le plancher
--    au niveau du règlement journalier et de today_pending).
-- =====================================================================

begin;

-- [1] Permettre à daily_settlements.day_score de stocker un score négatif
alter table public.daily_settlements drop constraint if exists daily_settlements_day_score_check;

-- [2] Mise à jour de la fonction add_event sans bridage de solde à l'insertion
create or replace function public.add_event(
  p_child_id    uuid,
  p_category_id uuid,
  p_points      int default null,
  p_date        date default null,
  p_day_part    text default null,
  p_note        text default null,
  p_force_kind  text default null,
  p_repairable  boolean default null
)
returns events
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_family   uuid := auth_family_id();
  v_cat      categories;
  v_date     date := coalesce(p_date, (now() at time zone 'Europe/Paris')::date);
  v_points   int;
  v_mult     numeric(4,2) := 1;
  v_used     int;
  v_kind     text;
  v_row      events;
begin
  if v_family is null then
    raise exception 'Utilisateur non rattache a une famille.';
  end if;

  select * into v_cat from categories where id = p_category_id and family_id = v_family;
  if not found then
    raise exception 'Categorie inconnue.';
  end if;
  if not v_cat.active then
    raise exception 'Categorie desactivee : %', v_cat.label;
  end if;

  if p_child_id is not null
     and not exists (select 1 from children where id = p_child_id and family_id = v_family) then
    raise exception 'Enfant inconnu.';
  end if;

  if p_repairable is not null and v_cat.repairable is distinct from p_repairable then
    update categories set repairable = p_repairable where id = v_cat.id;
    v_cat.repairable := p_repairable;
  end if;

  v_points := coalesce(p_points, v_cat.default_points);

  if v_points = 0 then
    v_kind := case when p_force_kind = 'malus' or v_cat.kind = 'malus' then 'malus' else 'bonus' end;
    insert into events (family_id, child_id, category_id, event_date, day_part,
                        kind, base_points, multiplier, counts_status, note, created_by)
    values (v_family, p_child_id, v_cat.id, v_date, p_day_part,
            v_kind, 0, 1, false,
            p_note, auth.uid())
    returning * into v_row;
    return v_row;
  end if;

  if p_force_kind = 'malus' or v_points < 0 then
    v_points := -abs(v_points);
    v_kind := 'malus';
  elsif p_force_kind = 'bonus' or v_points > 0 then
    v_points := abs(v_points);
    v_kind := 'bonus';
  else
    if v_cat.kind = 'malus' then
      v_points := -abs(v_points);
      v_kind := 'malus';
    else
      v_points := abs(v_points);
      v_kind := 'bonus';
    end if;
  end if;

  if v_cat.max_per_day is not null then
    select count(*) into v_used from events
     where category_id = v_cat.id
       and child_id is not distinct from p_child_id
       and event_date = v_date
       and kind in ('bonus','malus');
    if v_used >= v_cat.max_per_day then
      raise exception 'Plafond atteint pour "%" aujourd''hui (% / jour).',
        v_cat.label, v_cat.max_per_day;
    end if;
  end if;

  if v_points > 0 then
    select max(s.multiplier) into v_mult from special_days s
     where s.family_id = v_family and s.day = v_date
       and (s.child_id is null or s.child_id = p_child_id);
    v_mult := coalesce(v_mult, 1);
  end if;

  -- Les malus ne sont plus bridés à zéro à l'insertion :
  -- l'enfant peut descendre dans le négatif au sein d'une même journée.
  -- Le sanctuaire (ne pas entamer le compteur global acquis) est assuré
  -- par settle_daily_points et la vue v_child_balance.
  insert into events (family_id, child_id, category_id, event_date, day_part,
                      kind, base_points, multiplier, note, created_by)
  values (v_family, p_child_id, v_cat.id, v_date, p_day_part,
          v_kind, v_points, v_mult, p_note, auth.uid())
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.add_event(uuid, uuid, int, date, text, text, text, boolean) from anon, public;
grant execute on function public.add_event(uuid, uuid, int, date, text, text, text, boolean) to authenticated;

-- [3] Mise à jour de settle_daily_points pour conserver le score réel du jour
create or replace function public.settle_daily_points()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_family    uuid := auth_family_id();
  v_today     date := (now() at time zone 'Europe/Paris')::date;
  v_rec       record;
  v_count     integer := 0;
  v_raw_score integer;
  v_savings   integer;
  v_wallet    integer;
begin
  if v_family is null then
    raise exception 'Utilisateur non rattache a une famille.';
  end if;

  for v_rec in
    select
      e.child_id,
      e.event_date,
      coalesce(c.savings_pct, 30) as savings_pct,
      coalesce(sum(e.points) filter (
        where e.kind in ('bonus', 'malus', 'repair')
           or (e.kind = 'reversal' and e.points < 0)
           or (e.kind = 'reversal' and e.points > 0 and exists (select 1 from events orig where orig.id = e.reverses_id and orig.kind = 'malus'))
      ), 0)::integer as day_net_score
    from events e
    join children c on c.id = e.child_id
    where e.family_id = v_family
      and e.child_id is not null
      and e.event_date < v_today
    group by e.child_id, e.event_date, c.savings_pct
  loop
    v_raw_score := v_rec.day_net_score;
    -- Si la journée est positive, on ventile entre Portefeuille et Tirelire
    -- Si la journée est nulle ou négative, 0 point comptabilisé sur le compteur global
    if v_raw_score > 0 then
      v_savings := round(v_raw_score * (v_rec.savings_pct::numeric / 100.0))::integer;
      v_wallet := v_raw_score - v_savings;
    else
      v_savings := 0;
      v_wallet := 0;
    end if;

    insert into daily_settlements (family_id, child_id, settlement_date, day_score, wallet_points, savings_points)
    values (v_family, v_rec.child_id, v_rec.event_date, v_raw_score, v_wallet, v_savings)
    on conflict (child_id, settlement_date)
    do update set
      day_score = excluded.day_score,
      wallet_points = excluded.wallet_points,
      savings_points = excluded.savings_points;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.settle_daily_points() from anon, public;
grant execute on function public.settle_daily_points() to authenticated;

-- [4] Mise à jour de la vue v_daily (avec security_invoker = on)
create or replace view public.v_daily with (security_invoker = on) as
select
  family_id,
  child_id,
  event_date,
  coalesce(sum(points) filter (where points > 0 and kind not in ('booster', 'bonus_streak', 'reward', 'reversal')), 0)::integer as gained,
  coalesce(sum(points) filter (where points < 0 and kind not in ('reward', 'booster', 'bonus_streak', 'reversal')), 0)::integer as lost,
  coalesce(sum(points) filter (where kind = 'reward'), 0)::integer as spent,
  sum(points)::integer as net,
  count(*)::integer as entries,
  coalesce(sum(points) filter (where kind in ('booster', 'bonus_streak')), 0)::integer as boosters,
  coalesce(sum(points) filter (where kind not in ('booster', 'bonus_streak', 'reward', 'reversal')), 0)::integer as daily_score,
  greatest(0, coalesce(sum(points) filter (where kind not in ('booster', 'bonus_streak', 'reward', 'reversal')), 0))::integer as counted_score
from events
group by family_id, child_id, event_date;

commit;
