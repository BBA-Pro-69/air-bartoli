-- =====================================================================
-- Air Bartoli - boosters automatiques de regularite
-- Les points du calendrier restent intacts. Le booster est une ecriture
-- distincte, accordee une seule fois par enfant et par periode.
-- =====================================================================
begin;

-- Les boosters sont des entrees positives separees du score de la journee.
alter table events drop constraint if exists events_kind_check;
alter table events add constraint events_kind_check
  check (kind in ('bonus','malus','repair','reward','adjustment','reversal','bonus_streak','booster'));

create table if not exists booster_settings (
  family_id   uuid not null references families(id) on delete cascade,
  period_type text not null check (period_type in ('week','month')),
  active      boolean not null default false,
  min_points int not null default 35 check (min_points > 0),
  multiplier  numeric(3,1) not null default 2.0,
  updated_at  timestamptz not null default now(),
  primary key (family_id, period_type),
  constraint booster_multiplier_range check (multiplier >= 1.0 and multiplier <= 9.9),
  constraint booster_multiplier_one_decimal check (multiplier = round(multiplier, 1))
);

create table if not exists booster_grants (
  id                uuid primary key default gen_random_uuid(),
  family_id         uuid not null references families(id) on delete cascade,
  child_id          uuid not null references children(id) on delete cascade,
  period_type       text not null check (period_type in ('week','month')),
  period_start      date not null,
  threshold_points  int not null,
  qualifying_points int not null,
  multiplier        numeric(3,1) not null,
  bonus_points      int not null check (bonus_points > 0),
  event_id          uuid references events(id) on delete set null,
  granted_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id),
  unique (family_id, child_id, period_type, period_start)
);
create index if not exists booster_grants_family_idx on booster_grants(family_id, granted_at desc);

create or replace function booster_settings_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists booster_settings_updated_at on booster_settings;
create trigger booster_settings_updated_at
before update on booster_settings
for each row execute function booster_settings_touch_updated_at();

alter table booster_settings enable row level security;
alter table booster_grants enable row level security;

drop policy if exists booster_settings_all on booster_settings;
create policy booster_settings_all on booster_settings
for all to authenticated
using (family_id = auth_family_id())
with check (family_id = auth_family_id());

drop policy if exists booster_grants_read on booster_grants;
create policy booster_grants_read on booster_grants
for select to authenticated
using (family_id = auth_family_id());

grant select, insert, update, delete on booster_settings to authenticated;
grant select on booster_grants to authenticated;
revoke all on booster_settings, booster_grants from anon;

insert into booster_settings (family_id, period_type, active, min_points, multiplier)
select id, 'week', false, 35, 2.0 from families
on conflict (family_id, period_type) do nothing;
insert into booster_settings (family_id, period_type, active, min_points, multiplier)
select id, 'month', false, 120, 1.5 from families
on conflict (family_id, period_type) do nothing;

-- v_daily separe le score comportemental des boosters et des achats.
create or replace view v_daily as
select e.family_id, e.child_id, e.event_date,
       coalesce(sum(e.points) filter (where e.points > 0
         and e.kind not in ('booster','bonus_streak','reward','reversal')), 0)::int as gained,
       coalesce(sum(e.points) filter (where e.points < 0
         and e.kind not in ('reward','booster','bonus_streak','reversal')), 0)::int as lost,
       coalesce(sum(e.points) filter (where e.kind = 'reward'), 0)::int as spent,
       coalesce(sum(e.points) filter (where e.kind in ('booster','bonus_streak')), 0)::int as boosters,
       greatest(coalesce(sum(e.points) filter (where e.kind not in ('booster','bonus_streak','reward','reversal')), 0), 0)::int as daily_score,
       sum(e.points)::int as net,
       count(*)::int as entries
from events e
group by e.family_id, e.child_id, e.event_date;
alter view v_daily set (security_invoker = on);

create or replace function grant_period_boosters(
  p_family uuid,
  p_child uuid,
  p_date date,
  p_actor uuid
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_setting record;
  v_period_start date;
  v_qualifying int;
  v_bonus int;
  v_grant_id uuid;
  v_event_id uuid;
  v_n int := 0;
  v_period_label text;
begin
  if p_child is null then return 0; end if;

  for v_setting in
    select * from booster_settings
     where family_id = p_family and active
     order by period_type
  loop
    v_period_start := case v_setting.period_type
      when 'week' then date_trunc('week', p_date::timestamp)::date
      when 'month' then date_trunc('month', p_date::timestamp)::date
    end;

    -- Le seuil repose sur les scores pedagogiques journaliers, donc un jour
    -- negatif compte pour zero. Les boosters ne peuvent pas s'auto-alimenter.
    select coalesce(sum(greatest(coalesce(d.gained, 0) + coalesce(d.lost, 0), 0)), 0)::int
      into v_qualifying
      from v_daily d
     where d.family_id = p_family
       and d.child_id = p_child
       and d.event_date between v_period_start and p_date;

    if v_qualifying < v_setting.min_points then continue; end if;

    v_bonus := ceil(v_qualifying * (v_setting.multiplier - 1))::int;
    if v_bonus <= 0 then continue; end if;

    insert into booster_grants (
      family_id, child_id, period_type, period_start,
      threshold_points, qualifying_points, multiplier, bonus_points, created_by
    ) values (
      p_family, p_child, v_setting.period_type, v_period_start,
      v_setting.min_points, v_qualifying, v_setting.multiplier, v_bonus, p_actor
    ) on conflict (family_id, child_id, period_type, period_start) do nothing
      returning id into v_grant_id;

    if v_grant_id is not null then
      v_period_label := case v_setting.period_type when 'week' then 'semaine' else 'mois' end;
      insert into events (
        family_id, child_id, category_id, event_date, kind,
        base_points, multiplier, counts_status, note, created_by
      ) values (
        p_family, p_child, null, p_date, 'booster',
        v_bonus, 1, true,
        'Booster ' || v_period_label || ' · ' || v_qualifying || ' points × ' || v_setting.multiplier,
        p_actor
      ) returning id into v_event_id;

      update booster_grants set event_id = v_event_id where id = v_grant_id;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

create or replace function events_auto_boosters()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.child_id is not null
     and new.kind in ('bonus','malus','repair','adjustment') then
    perform grant_period_boosters(new.family_id, new.child_id, new.event_date, new.created_by);
  end if;
  return new;
end $$;

drop trigger if exists events_auto_boosters on events;
create trigger events_auto_boosters
after insert on events
for each row execute function events_auto_boosters();

create or replace function evaluate_current_boosters()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_family uuid := auth_family_id();
  v_child record;
  v_n int := 0;
  v_today date := (now() at time zone 'Europe/Paris')::date;
begin
  for v_child in select id from children where family_id = v_family and active loop
    v_n := v_n + grant_period_boosters(v_family, v_child.id, v_today, auth.uid());
  end loop;
  return v_n;
end $$;

grant execute on function evaluate_current_boosters() to authenticated;
revoke execute on function evaluate_current_boosters() from anon, public;
revoke execute on function grant_period_boosters(uuid, uuid, date, uuid) from anon, authenticated, public;
revoke execute on function events_auto_boosters() from anon, authenticated, public;

commit;
