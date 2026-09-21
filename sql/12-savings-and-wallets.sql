-- =====================================================================
-- Air Bartoli - Migration 12 : Système d'épargne (Portefeuille & Tirelire Magique)
-- 1. Les points de la journée en cours sont virtuels et non dépensables.
-- 2. À minuit (ou au premier chargement le lendemain), ils basculent
--    en vrais points ventilés entre Portefeuille et Tirelire Magique.
-- 3. Les malus d'une journée ne peuvent jamais impacter les points acquis
--    des jours précédents.
-- 4. Intérêts mensuels sur le solde de la Tirelire Magique.
-- =====================================================================

begin;

-- [1] Pourcentage d'épargne par enfant
alter table children add column if not exists savings_pct integer not null default 30 check (savings_pct >= 0 and savings_pct <= 100);

-- [2] Contraintes sur events.kind et cible de stock
alter table events drop constraint if exists events_kind_check;
alter table events add constraint events_kind_check
  check (kind in ('bonus','malus','repair','reward','adjustment','reversal','bonus_streak','booster','interest'));

alter table events add column if not exists wallet_target text check (wallet_target in ('wallet','savings'));

-- [3] Paramètres de l'épargne par famille
create table if not exists savings_settings (
  family_id            uuid primary key references families(id) on delete cascade,
  annual_interest_rate numeric(5,2) not null default 12.00 check (annual_interest_rate >= 0 and annual_interest_rate <= 100),
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table savings_settings enable row level security;
drop policy if exists "savings_settings_parent_all" on savings_settings;
create policy "savings_settings_parent_all" on savings_settings
  for all to authenticated
  using (family_id = auth_family_id())
  with check (family_id = auth_family_id());

-- [4] Règlements journaliers (clôture des journées passées)
create table if not exists daily_settlements (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references families(id) on delete cascade,
  child_id        uuid not null references children(id) on delete cascade,
  settlement_date date not null,
  day_score       integer not null default 0 check (day_score >= 0),
  wallet_points   integer not null default 0 check (wallet_points >= 0),
  savings_points  integer not null default 0 check (savings_points >= 0),
  created_at      timestamptz not null default now(),
  unique (child_id, settlement_date)
);

create index if not exists daily_settlements_child_date_idx on daily_settlements(child_id, settlement_date desc);
create index if not exists daily_settlements_family_idx on daily_settlements(family_id);

alter table daily_settlements enable row level security;
drop policy if exists "daily_settlements_parent_all" on daily_settlements;
create policy "daily_settlements_parent_all" on daily_settlements
  for all to authenticated
  using (family_id = auth_family_id())
  with check (family_id = auth_family_id());

-- [5] Historique des versements d'intérêts mensuels
create table if not exists interest_grants (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references families(id) on delete cascade,
  child_id        uuid not null references children(id) on delete cascade,
  year_month      text not null, -- format 'YYYY-MM'
  savings_balance integer not null,
  annual_rate     numeric(5,2) not null,
  interest_points integer not null check (interest_points >= 0),
  event_id        uuid references events(id) on delete set null,
  granted_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id),
  unique (family_id, child_id, year_month)
);

create index if not exists interest_grants_child_idx on interest_grants(child_id, year_month desc);
alter table interest_grants enable row level security;
drop policy if exists "interest_grants_parent_all" on interest_grants;
create policy "interest_grants_parent_all" on interest_grants
  for all to authenticated
  using (family_id = auth_family_id())
  with check (family_id = auth_family_id());

-- [6] Fonction pour régler / ventiler les journées passées
create or replace function public.settle_daily_points()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_family uuid := auth_family_id();
  v_today  date := (now() at time zone 'Europe/Paris')::date;
  v_rec    record;
  v_count  integer := 0;
  v_score  integer;
  v_savings integer;
  v_wallet  integer;
begin
  if v_family is null then
    raise exception 'Utilisateur non rattache a une famille.';
  end if;

  -- Pour chaque enfant et chaque date passée ayant des événements
  for v_rec in
    select
      e.child_id,
      e.event_date,
      coalesce(c.savings_pct, 30) as savings_pct,
      greatest(0, coalesce(sum(e.points) filter (
        where e.kind in ('bonus', 'malus', 'repair')
           or (e.kind = 'reversal' and e.points < 0) -- annulation de bonus
           or (e.kind = 'reversal' and e.points > 0 and exists (select 1 from events orig where orig.id = e.reverses_id and orig.kind = 'malus')) -- annulation de malus
      ), 0))::integer as day_net_score
    from events e
    join children c on c.id = e.child_id
    where e.family_id = v_family
      and e.child_id is not null
      and e.event_date < v_today
    group by e.child_id, e.event_date, c.savings_pct
  loop
    v_score := v_rec.day_net_score;
    if v_score > 0 then
      v_savings := round(v_score * (v_rec.savings_pct::numeric / 100.0))::integer;
      v_wallet := v_score - v_savings;
    else
      v_savings := 0;
      v_wallet := 0;
    end if;

    insert into daily_settlements (family_id, child_id, settlement_date, day_score, wallet_points, savings_points)
    values (v_family, v_rec.child_id, v_rec.event_date, v_score, v_wallet, v_savings)
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

-- [7] Fonction pour verser les intérêts mensuels au 1er du mois
create or replace function public.apply_monthly_interest()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_family       uuid := auth_family_id();
  v_today        date := (now() at time zone 'Europe/Paris')::date;
  v_prev_month   text := to_char(v_today - interval '1 month', 'YYYY-MM');
  v_prev_end     date := (date_trunc('month', v_today) - interval '1 day')::date;
  v_setting      record;
  v_child        record;
  v_rate         numeric(5,2);
  v_monthly_rate numeric(8,5);
  v_savings      integer;
  v_interest     integer;
  v_grant_id     uuid;
  v_event_id     uuid;
  v_count        integer := 0;
begin
  if v_family is null then
    raise exception 'Utilisateur non rattache a une famille.';
  end if;

  select * into v_setting from savings_settings where family_id = v_family and active = true;
  v_rate := coalesce(v_setting.annual_interest_rate, 12.00);
  v_monthly_rate := (v_rate / 100.0) / 12.0;

  for v_child in select id, first_name from children where family_id = v_family and active = true
  loop
    -- Vérifier si l'intérêt du mois précédent a déjà été accordé
    if exists (select 1 from interest_grants where child_id = v_child.id and year_month = v_prev_month) then
      continue;
    end if;

    -- Solde de la Tirelire Magique à la fin du mois précédent
    select coalesce(sum(savings_points), 0)::integer into v_savings
    from daily_settlements
    where child_id = v_child.id and settlement_date <= v_prev_end;

    -- Ajouter les intérêts et ajustements passés de la tirelire jusqu'à la fin du mois
    v_savings := v_savings + coalesce((
      select sum(points) from events
      where child_id = v_child.id
        and event_date <= v_prev_end
        and (kind = 'interest' or (kind = 'reward' and wallet_target = 'savings'))
    ), 0);

    if v_savings <= 0 then
      continue;
    end if;

    v_interest := round(v_savings * v_monthly_rate)::integer;
    if v_interest < 1 then
      -- Minimum pédagogique si solde non nul et taux non nul : si le calcul donne au moins 0.5 point arrondi
      continue;
    end if;

    insert into interest_grants (family_id, child_id, year_month, savings_balance, annual_rate, interest_points, created_by)
    values (v_family, v_child.id, v_prev_month, v_savings, v_rate, v_interest, auth.uid())
    returning id into v_grant_id;

    if v_grant_id is not null then
      insert into events (
        family_id, child_id, category_id, event_date, day_part,
        kind, base_points, multiplier, counts_status, note, wallet_target, created_by
      ) values (
        v_family, v_child.id, null, v_today, 'matin',
        'interest', v_interest, 1, true,
        format('Intérêts Tirelire Magique (%s) : +%s pt(s) à %s%%/an', v_prev_month, v_interest, v_rate),
        'savings', auth.uid()
      ) returning id into v_event_id;

      update interest_grants set event_id = v_event_id where id = v_grant_id;
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

-- [8] Mise à jour de la vue v_child_balance (security_invoker = on)
drop view if exists v_reward_eligibility cascade;
drop view if exists v_child_balance cascade;

create view v_child_balance with (security_invoker = on) as
with today_d as (
  select (now() at time zone 'Europe/Paris')::date as d
),
settled as (
  select
    ds.child_id,
    coalesce(sum(ds.wallet_points), 0)::integer as wallet_from_days,
    coalesce(sum(ds.savings_points), 0)::integer as savings_from_days
  from daily_settlements ds
  group by ds.child_id
),
rewards_and_interest as (
  select
    e.child_id,
    -- Dépenses du portefeuille : récompenses individuelles ou ciblées portefeuille
    coalesce(sum(e.points) filter (
      where (e.kind = 'reward' and coalesce(e.wallet_target, 'wallet') = 'wallet')
         or (e.kind = 'reversal' and exists (
               select 1 from events r where r.id = e.reverses_id and r.kind = 'reward' and coalesce(r.wallet_target, 'wallet') = 'wallet'
            ))
         or (e.kind = 'booster' and coalesce(e.wallet_target, 'wallet') = 'wallet')
         or (e.kind = 'bonus_streak' and coalesce(e.wallet_target, 'wallet') = 'wallet')
    ), 0)::integer as wallet_extras,
    -- Mouvements de la tirelire : intérêts + récompenses collectives ou ciblées tirelire
    coalesce(sum(e.points) filter (
      where e.kind = 'interest'
         or (e.kind = 'reward' and e.wallet_target = 'savings')
         or (e.kind = 'reversal' and exists (
               select 1 from events r where r.id = e.reverses_id and r.kind = 'reward' and r.wallet_target = 'savings'
            ))
         or (e.kind = 'booster' and e.wallet_target = 'savings')
         or (e.kind = 'bonus_streak' and e.wallet_target = 'savings')
    ), 0)::integer as savings_extras
  from events e
  where e.child_id is not null
  group by e.child_id
),
today_pending_calc as (
  select
    e.child_id,
    greatest(0, coalesce(sum(e.points) filter (
      where e.kind in ('bonus', 'malus', 'repair')
         or (e.kind = 'reversal' and e.points < 0)
         or (e.kind = 'reversal' and e.points > 0 and exists (select 1 from events orig where orig.id = e.reverses_id and orig.kind = 'malus'))
    ), 0))::integer as today_pending
  from events e, today_d td
  where e.child_id is not null
    and e.event_date = td.d
  group by e.child_id
)
select
  c.id as child_id,
  c.family_id,
  c.first_name,
  (greatest(0, coalesce(s.wallet_from_days, 0) + coalesce(ri.wallet_extras, 0)) +
   greatest(0, coalesce(s.savings_from_days, 0) + coalesce(ri.savings_extras, 0)))::integer as balance,
  greatest(0, coalesce(s.wallet_from_days, 0) + coalesce(ri.wallet_extras, 0))::integer as wallet_balance,
  greatest(0, coalesce(s.savings_from_days, 0) + coalesce(ri.savings_extras, 0))::integer as savings_balance,
  coalesce(tp.today_pending, 0)::integer as today_pending,
  coalesce(c.savings_pct, 30)::integer as savings_pct
from children c
left join settled s on s.child_id = c.id
left join rewards_and_interest ri on ri.child_id = c.id
left join today_pending_calc tp on tp.child_id = c.id;

-- [9] Recréation de v_reward_eligibility avec security_invoker = on
create view v_reward_eligibility with (security_invoker = on) as
select
  r.id as reward_id,
  r.family_id,
  r.label,
  r.scope,
  r.cost,
  r.min_per_child,
  b.child_id,
  b.first_name,
  b.balance,
  b.wallet_balance,
  b.savings_balance,
  greatest(r.min_per_child - b.savings_balance, 0) as missing_for_min,
  greatest(case when r.scope = 'individual' then r.cost - b.wallet_balance else 0 end, 0) as missing_individual,
  case
    when coalesce(rt.weekly_rate, 0) = 0 then null::integer
    else ceil(
      greatest(case when r.scope = 'individual' then r.cost - b.wallet_balance else r.min_per_child - b.savings_balance end, 0)::numeric
      / (rt.weekly_rate::numeric / 7.0)
    )::integer
  end as days_left
from rewards r
join v_child_balance b on b.family_id = r.family_id
left join v_child_rate rt on rt.child_id = b.child_id
where r.active;

-- [10] Adaptation de add_event pour sanctuariser les jours passés
create or replace function public.add_event(
  p_child_id    uuid,
  p_category_id uuid,
  p_points      integer default null,
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
  v_day_net  int;
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

  -- Protection sanctuaire : le malus ne peut entamer que les points de la JOURNEE v_date
  if v_points < 0 and p_child_id is not null then
    select coalesce(sum(e.points), 0)::integer into v_day_net
    from events e
    where e.child_id = p_child_id
      and e.event_date = v_date
      and e.kind in ('bonus', 'malus', 'repair');

    if v_day_net + v_points < 0 then
      v_points := -greatest(0, v_day_net);
      if v_points = 0 then
        insert into events (family_id, child_id, category_id, event_date, day_part,
                            kind, base_points, multiplier, counts_status, note, created_by)
        values (v_family, p_child_id, v_cat.id, v_date, p_day_part,
                'malus', 0, 1, false,
                coalesce(p_note || ' ', '') || '[score du jour deja a zero, aucun point retire]', auth.uid())
        returning * into v_row;
        return v_row;
      end if;
    end if;
  end if;

  insert into events (family_id, child_id, category_id, event_date, day_part,
                      kind, base_points, multiplier, note, created_by)
  values (v_family, p_child_id, v_cat.id, v_date, p_day_part,
          v_kind, v_points, v_mult, p_note, auth.uid())
  returning * into v_row;

  return v_row;
end;
$$;

commit;
