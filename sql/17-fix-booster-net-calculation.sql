-- =====================================================================
-- Air Bartoli - Migration 17 : Calcul net des boosters périodiques
-- 1. Les jours qualifiants sont évalués sur le score NET de comportement
--    de la journée (gains + malus), et non sur les gains bruts isolés.
-- 2. Le total de points de la période est évalué en net (après déduction des malus).
-- 3. La mention générée dans la note de l'événement est claire et transparente :
--    'Booster hebdomadaire : %s jours qualifiants à au moins %s pt(s) (min. %s), %s pts nets au total'
-- =====================================================================

begin;

create or replace function public.apply_period_boosters()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_family       uuid := auth_family_id();
  v_today        date := (now() at time zone 'Europe/Paris')::date;
  v_setting      record;
  v_child        record;
  v_start        date;
  v_end          date;
  v_days         integer;
  v_total        integer;
  v_grant_id     uuid;
  v_event_id     uuid;
  v_count        integer := 0;
begin
  if v_family is null then
    raise exception 'Utilisateur non rattache a une famille.';
  end if;

  for v_setting in
    select * from booster_settings
    where family_id = v_family and active = true
    order by period_type
  loop
    if v_setting.period_type = 'week' then
      v_start := date_trunc('week', v_today - 7)::date;
      v_end := v_start + 6;
    elsif v_setting.period_type = 'month' then
      v_start := date_trunc('month', v_today - interval '1 month')::date;
      v_end := (v_start + interval '1 month - 1 day')::date;
    else
      continue;
    end if;

    for v_child in
      select id from children where family_id = v_family and active = true
    loop
      -- Jours qualifiants bases sur le score NET reel de chaque journee (apres malus)
      select count(*)::integer
        into v_days
      from (
        select event_date,
               coalesce(sum(points) filter (
                 where kind in ('bonus', 'malus', 'repair')
                    or (kind = 'reversal' and points < 0)
                    or (kind = 'reversal' and points > 0 and exists (select 1 from events orig where orig.id = events.reverses_id and orig.kind = 'malus'))
               ), 0)::integer as day_net
        from events
        where child_id = v_child.id
          and event_date between v_start and v_end
        group by event_date
      ) d
      where d.day_net >= v_setting.daily_min_points;

      -- Total net reel de la periode
      select coalesce(sum(points) filter (
        where kind in ('bonus', 'malus', 'repair')
           or (kind = 'reversal' and points < 0)
           or (kind = 'reversal' and points > 0 and exists (select 1 from events orig where orig.id = events.reverses_id and orig.kind = 'malus'))
      ), 0)::integer
        into v_total
      from events
      where child_id = v_child.id
        and event_date between v_start and v_end;

      if v_days < v_setting.qualifying_days
         or v_total < v_setting.total_min_points then
        continue;
      end if;

      v_grant_id := null;
      insert into booster_grants (
        family_id, child_id, period_type, period_start,
        threshold_points, qualifying_points, multiplier, bonus_points,
        daily_min_points, qualifying_days, total_points, created_by
      ) values (
        v_family, v_child.id, v_setting.period_type, v_start,
        v_setting.daily_min_points, v_setting.total_min_points, 1,
        v_setting.bonus_points, v_setting.daily_min_points,
        v_setting.qualifying_days, v_total, auth.uid()
      )
      on conflict (family_id, child_id, period_type, period_start) do nothing
      returning id into v_grant_id;

      if v_grant_id is not null then
        insert into events (
          family_id, child_id, category_id, event_date, kind,
          base_points, multiplier, note, created_by, wallet_target
        ) values (
          v_family, v_child.id, null, v_end, 'bonus_streak',
          v_setting.bonus_points, 1,
          format(
            'Booster %s : %s jours qualifiants a au moins %s pt(s) (min. %s), %s pts nets au total',
            case when v_setting.period_type = 'week' then 'hebdomadaire' else 'mensuel' end,
            v_days, v_setting.daily_min_points, v_setting.qualifying_days, v_total
          ), auth.uid(), 'wallet'
        ) returning id into v_event_id;

        update booster_grants
        set event_id = v_event_id
        where id = v_grant_id;
        v_count := v_count + 1;
      end if;
    end loop;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.apply_period_boosters() from anon, public;
grant execute on function public.apply_period_boosters() to authenticated;

commit;
