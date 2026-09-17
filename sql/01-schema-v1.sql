-- =====================================================================
--  Famille Miles - schema initial (v1)
--  A executer UNE SEULE FOIS dans Supabase > SQL Editor, projet dedie.
--  Postgres 15+ / Supabase. Aucune extension exotique requise.
-- =====================================================================
--  Principes non negociables, rappeles ici parce que le schema les porte :
--   1. Le journal (events) est en AJOUT SEUL. Pas d'UPDATE, pas de DELETE.
--      Une erreur se corrige par une ecriture inverse, comme en comptabilite.
--   2. Les points sont FIGES sur l'evenement au moment de la saisie.
--      Changer un bareme ne reecrit jamais le passe.
--   3. Aucun solde n'est stocke. Tout est vue.
--   4. Deux compteurs : le SOLDE (depensable) et les MILES DE STATUT
--      (cumules a vie, jamais depenses, ils donnent le niveau).
--   5. Le solde ne descend jamais sous zero. Le malus est ecrete.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Famille, parents, enfants
-- ---------------------------------------------------------------------

create table if not exists families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists parents (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  family_id    uuid not null references families(id) on delete cascade,
  display_name text not null,
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists parents_family_idx on parents(family_id);

create table if not exists children (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references families(id) on delete cascade,
  first_name   text not null,
  birth_date   date,
  color        text not null default '#00A7E1',
  avatar       text,
  weekly_goal  int  not null default 22,   -- sert a calculer les ETA
  active       boolean not null default true,
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists children_family_idx on children(family_id);

-- ---------------------------------------------------------------------
-- 2. Categories, auto-referencees, entierement pilotees par les parents
--    Deux niveaux maximum : une categorie, ses sous-categories. Pas plus.
-- ---------------------------------------------------------------------

create table if not exists categories (
  id             uuid primary key default gen_random_uuid(),
  family_id      uuid not null references families(id) on delete cascade,
  parent_id      uuid references categories(id) on delete restrict,
  label          text not null,
  kind           text not null default 'bonus'
                 check (kind in ('bonus','malus','both')),
  default_points int  not null default 1,
  max_per_day    int,           -- occurrences max / enfant / jour. null = illimite
  repairable     boolean not null default false,
  icon           text,
  color          text,
  active         boolean not null default true,
  sort_order     int  not null default 0,
  created_at     timestamptz not null default now(),
  constraint categories_not_self check (parent_id is null or parent_id <> id)
);
create index if not exists categories_family_idx on categories(family_id, active);
create index if not exists categories_parent_idx on categories(parent_id);

-- Interdit le 3e niveau. Une sous-sous-categorie ne se lit plus dans un menu
-- a une main sur un telephone, et elle rend les analyses illisibles.
create or replace function categories_depth_guard() returns trigger
language plpgsql as $$
begin
  if new.parent_id is not null then
    if (select parent_id from categories where id = new.parent_id) is not null then
      raise exception 'Deux niveaux maximum : cette categorie est deja une sous-categorie.';
    end if;
    if (select family_id from categories where id = new.parent_id) <> new.family_id then
      raise exception 'La categorie parente appartient a une autre famille.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists categories_depth on categories;
create trigger categories_depth before insert or update on categories
  for each row execute function categories_depth_guard();

-- ---------------------------------------------------------------------
-- 3. Jours speciaux (multiplicateurs)
-- ---------------------------------------------------------------------

create table if not exists special_days (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references families(id) on delete cascade,
  day         date not null,
  child_id    uuid references children(id) on delete cascade,  -- null = toute la fratrie
  multiplier  numeric(4,2) not null default 2
              check (multiplier > 0 and multiplier <= 5),
  reason      text not null,
  created_at  timestamptz not null default now()
);
create unique index if not exists special_days_unique
  on special_days(family_id, day, coalesce(child_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ---------------------------------------------------------------------
-- 4. Niveaux de statut (miles qualifiants, jamais depenses)
-- ---------------------------------------------------------------------

create table if not exists status_levels (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references families(id) on delete cascade,
  label        text not null,
  min_points   int  not null check (min_points >= 0),
  perks        text,
  color        text,
  sort_order   int  not null default 0
);
create unique index if not exists status_levels_unique on status_levels(family_id, min_points);

-- ---------------------------------------------------------------------
-- 5. Catalogue de recompenses et echanges
-- ---------------------------------------------------------------------

create table if not exists rewards (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id) on delete cascade,
  label         text not null,
  description   text,
  scope         text not null default 'individual'
                check (scope in ('individual','collective')),
  cost          int  not null check (cost > 0),
  min_per_child int  not null default 0 check (min_per_child >= 0),
  min_age       int,
  min_status    int  not null default 0,     -- miles de statut requis
  stock         int,                          -- null = illimite
  cooldown_days int,                          -- delai avant de le reprendre
  active        boolean not null default true,
  icon          text,
  sort_order    int  not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists rewards_family_idx on rewards(family_id, active);

create table if not exists redemptions (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references families(id) on delete cascade,
  reward_id    uuid not null references rewards(id) on delete restrict,
  scope        text not null check (scope in ('individual','collective')),
  cost_total   int  not null check (cost_total > 0),
  state        text not null default 'requested'
               check (state in ('requested','approved','refused','delivered','cancelled')),
  requested_by uuid references auth.users(id),
  requested_at timestamptz not null default now(),
  decided_by   uuid references auth.users(id),
  decided_at   timestamptz,
  delivered_at timestamptz,
  note         text
);
create index if not exists redemptions_family_idx on redemptions(family_id, state);

create table if not exists redemption_shares (
  redemption_id uuid not null references redemptions(id) on delete cascade,
  child_id      uuid not null references children(id) on delete cascade,
  points        int  not null check (points >= 0),
  primary key (redemption_id, child_id)
);

-- ---------------------------------------------------------------------
-- 6. LE JOURNAL. Ajout seul.
--    child_id null = cagnotte commune de la fratrie.
-- ---------------------------------------------------------------------

create table if not exists events (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id) on delete cascade,
  child_id      uuid references children(id) on delete cascade,
  category_id   uuid references categories(id) on delete restrict,
  event_date    date not null default current_date,
  day_part      text check (day_part in ('matin','ecole','midi','gouter','soir','nuit')),
  kind          text not null
                check (kind in ('bonus','malus','repair','reward','adjustment','reversal','bonus_streak')),
  base_points   int  not null,
  multiplier    numeric(4,2) not null default 1,
  points        int generated always as (round(base_points * multiplier)::int) stored,
  counts_status boolean not null default true,
  note          text,
  reverses_id   uuid references events(id),
  repairs_id    uuid references events(id),
  redemption_id uuid references redemptions(id) on delete restrict,
  created_by    uuid not null references auth.users(id),
  created_at    timestamptz not null default now()
);

-- Pas de saisie dans le futur. Impose par trigger et non par CHECK :
-- Postgres refuse une contrainte CHECK qui appelle une fonction non
-- immuable ("functions in check constraint must be marked IMMUTABLE").
create or replace function events_no_future() returns trigger
language plpgsql as $$
begin
  if new.event_date > (now() at time zone 'Europe/Paris')::date then
    raise exception 'Pas de saisie dans le futur (% demande).', new.event_date;
  end if;
  return new;
end $$;

drop trigger if exists events_future_guard on events;
create trigger events_future_guard before insert on events
  for each row execute function events_no_future();
create index if not exists events_child_date_idx on events(child_id, event_date desc);
create index if not exists events_family_date_idx on events(family_id, event_date desc);
create index if not exists events_category_idx on events(category_id);

-- ---------------------------------------------------------------------
-- 7. Vues : soldes, statut, niveau, rythme, cagnotte
-- ---------------------------------------------------------------------

create or replace view v_child_balance as
select c.id as child_id, c.family_id, c.first_name,
       coalesce(sum(e.points), 0)::int as balance
from children c
left join events e on e.child_id = c.id
group by c.id, c.family_id, c.first_name;

create or replace view v_child_status as
select c.id as child_id, c.family_id, c.first_name,
       coalesce(sum(e.points) filter (where e.points > 0 and e.counts_status), 0)::int as status_points
from children c
left join events e on e.child_id = c.id
group by c.id, c.family_id, c.first_name;

create or replace view v_child_level as
select s.child_id, s.family_id, s.first_name, s.status_points,
       l.label as level_label, l.color as level_color, l.perks,
       (select min(l2.min_points) from status_levels l2
         where l2.family_id = s.family_id and l2.min_points > s.status_points) as next_level_points
from v_child_status s
left join lateral (
  select * from status_levels l
  where l.family_id = s.family_id and l.min_points <= s.status_points
  order by l.min_points desc limit 1
) l on true;

-- Rythme moyen sur 28 jours glissants, en points par semaine. Base des ETA.
create or replace view v_child_rate as
select c.id as child_id, c.family_id,
       round(coalesce(sum(e.points) filter (where e.points > 0), 0) / 4.0)::int as weekly_rate
from children c
left join events e
  on e.child_id = c.id
 and e.event_date > ((now() at time zone 'Europe/Paris')::date - interval '28 days')
group by c.id, c.family_id;

create or replace view v_family_pot as
select f.id as family_id, coalesce(sum(e.points), 0)::int as pot
from families f
left join events e on e.family_id = f.id and e.child_id is null
group by f.id;

-- Une ligne par jour et par enfant, pour l'historique et les graphiques.
create or replace view v_daily as
select e.family_id, e.child_id, e.event_date,
       sum(e.points) filter (where e.points > 0)::int as gained,
       sum(e.points) filter (where e.points < 0 and e.kind <> 'reward')::int as lost,
       sum(e.points) filter (where e.kind = 'reward')::int as spent,
       sum(e.points)::int as net,
       count(*)::int as entries
from events e
group by e.family_id, e.child_id, e.event_date;

-- Ou se gagnent et ou se perdent les points, par categorie et par moment.
-- C'est la vue qui alimente la conversation "tu as tendance a ...".
create or replace view v_category_profile as
select e.family_id, e.child_id, e.day_part,
       coalesce(p.id, c.id)     as root_category_id,
       coalesce(p.label, c.label) as root_label,
       c.id as category_id, c.label as category_label,
       count(*)::int as occurrences,
       sum(e.points)::int as net_points,
       sum(e.points) filter (where e.points > 0)::int as gained,
       sum(e.points) filter (where e.points < 0)::int as lost,
       min(e.event_date) as first_seen,
       max(e.event_date) as last_seen
from events e
join categories c on c.id = e.category_id
left join categories p on p.id = c.parent_id
group by e.family_id, e.child_id, e.day_part, coalesce(p.id, c.id),
         coalesce(p.label, c.label), c.id, c.label;

-- Eligibilite a chaque recompense, enfant par enfant, avec le nombre de jours
-- restants au rythme actuel. C'est ce chiffre qui rend un objectif lointain
-- supportable pour un enfant de cinq ans.
create or replace view v_reward_eligibility as
select r.id as reward_id, r.family_id, r.label, r.scope, r.cost, r.min_per_child,
       b.child_id, b.first_name, b.balance,
       greatest(r.min_per_child - b.balance, 0)::int as missing_for_min,
       greatest(case when r.scope = 'individual' then r.cost - b.balance else 0 end, 0)::int as missing_individual,
       case when coalesce(rt.weekly_rate, 0) = 0 then null
            else ceil(
              greatest(
                case when r.scope = 'individual' then r.cost - b.balance
                     else r.min_per_child - b.balance end, 0
              ) / (rt.weekly_rate / 7.0))::int
       end as days_left
from rewards r
join v_child_balance b on b.family_id = r.family_id
left join v_child_rate rt on rt.child_id = b.child_id
where r.active;

commit;
