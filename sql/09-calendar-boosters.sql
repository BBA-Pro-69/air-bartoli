-- =====================================================================
-- Air Bartoli - boosters calendaires v2
-- Semaine lundi-dimanche et mois premier-dernier jour.
-- A executer apres automatic_regularite_boosters.
-- =====================================================================

begin;

-- La migration precedente avait un seuil de periode et un coefficient.
-- On conserve ces colonnes pour ne pas detruire l'historique de schema,
-- mais la nouvelle logique n'utilise plus le coefficient.
alter table public.booster_settings
  add column if not exists daily_min_points integer,
  add column if not exists qualifying_days integer,
  add column if not exists total_min_points integer,
  add column if not exists bonus_points integer;

-- Les nouvelles colonnes sont peuplees uniquement lorsqu'elles sont encore
-- nulles. Une seconde execution ne remplace jamais un reglage existant.
update public.booster_settings
set daily_min_points = case when period_type = 'week' then 2 else 2 end,
    qualifying_days = case when period_type = 'week' then 5 else 20 end,
    total_min_points = case when period_type = 'week' then 18 else 70 end,
    bonus_points = case when period_type = 'week' then 5 else 10 end
where daily_min_points is null
   or qualifying_days is null
   or total_min_points is null
   or bonus_points is null;

alter table public.booster_settings
  alter column daily_min_points set default 2,
  alter column daily_min_points set not null,
  alter column qualifying_days set default 5,
  alter column qualifying_days set not null,
  alter column total_min_points set default 18,
  alter column total_min_points set not null,
  alter column bonus_points set default 5,
  alter column bonus_points set not null;

alter table public.booster_settings drop constraint if exists booster_settings_daily_min_points_check;
alter table public.booster_settings drop constraint if exists booster_settings_qualifying_days_check;
alter table public.booster_settings drop constraint if exists booster_settings_total_min_points_check;
alter table public.booster_settings drop constraint if exists booster_settings_bonus_points_check;
alter table public.booster_settings
  add constraint booster_settings_daily_min_points_check
    check (daily_min_points >= 0),
  add constraint booster_settings_qualifying_days_check
    check ((period_type = 'week' and qualifying_days between 1 and 7)
        or (period_type = 'month' and qualifying_days between 1 and 31)),
  add constraint booster_settings_total_min_points_check
    check (total_min_points > 0),
  add constraint booster_settings_bonus_points_check
    check (bonus_points > 0);

-- Snapshot explicite des criteres ayant produit un versement.
alter table public.booster_grants
  add column if not exists daily_min_points integer,
  add column if not exists qualifying_days integer,
  add column if not exists total_points integer;

-- Les anciens versements eventuels restent lisibles. Les nouvelles lignes
-- portent les quatre criteres explicites ci-dessus.
update public.categories
set active = false
where lower(label) in ('regularite', 'régularité')
  and active = true;

-- Le bouton manuel et la fonction a coefficient ne font plus partie du
-- produit. Les anciens evenements bonus_streak restent dans events.
drop function if exists public.grant_weekly_streak(date, integer, integer, integer);

create or replace function public.apply_period_boosters()
returns integer
language plpgsql
security definer
set search_path = public
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
      select count(*)::integer
        into v_days
      from (
        select event_date,
               coalesce(sum(points) filter (
                 where points > 0 and kind <> 'bonus_streak'
               ), 0)::integer as gained
        from events
        where child_id = v_child.id
          and event_date between v_start and v_end
        group by event_date
      ) d
      where d.gained >= v_setting.daily_min_points;

      select coalesce(sum(points) filter (
        where points > 0 and kind <> 'bonus_streak'
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
          base_points, multiplier, note, created_by
        ) values (
          v_family, v_child.id, null, v_end, 'bonus_streak',
          v_setting.bonus_points, 1,
          format(
            'Booster %s : %s jours a %s point(s), %s point(s) au total',
            case when v_setting.period_type = 'week' then 'hebdomadaire' else 'mensuel' end,
            v_days, v_setting.daily_min_points, v_total
          ), auth.uid()
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

revoke execute on function public.apply_period_boosters() from public;
revoke execute on function public.apply_period_boosters() from anon;
grant execute on function public.apply_period_boosters() to authenticated;

commit;
