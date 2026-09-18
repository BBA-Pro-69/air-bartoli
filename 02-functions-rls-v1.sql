-- =====================================================================
--  Famille Miles - fonctions metier et Row Level Security (v1)
--  A executer APRES sql/schema-v1.sql.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Helper : la famille du parent connecte.
--    security definer, sinon la politique RLS de parents s'appelle
--    elle-meme et Postgres renvoie une recursion infinie.
-- ---------------------------------------------------------------------

create or replace function auth_family_id() returns uuid
language sql stable security definer set search_path = public as $$
  select family_id from parents where user_id = auth.uid()
$$;

create or replace function is_parent() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from parents where user_id = auth.uid())
$$;

-- ---------------------------------------------------------------------
-- 1. add_event : LE point d'entree unique de toute saisie.
--    Applique le jour special, le plafond journalier et l'ecretage a zero.
--    Ne jamais faire d'INSERT direct dans events depuis le front.
-- ---------------------------------------------------------------------

create or replace function add_event(
  p_child_id    uuid,
  p_category_id uuid,
  p_points      int  default null,        -- null = points par defaut de la categorie
  p_date        date default null,
  p_day_part    text default null,
  p_note        text default null
) returns events
language plpgsql security definer set search_path = public as $$
declare
  v_family   uuid := auth_family_id();
  v_cat      categories;
  v_date     date := coalesce(p_date, (now() at time zone 'Europe/Paris')::date);
  v_points   int;
  v_mult     numeric(4,2) := 1;
  v_used     int;
  v_balance  int;
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

  v_points := coalesce(p_points, v_cat.default_points);

  -- Le sens de la categorie fait foi. Une categorie 'malus' ne peut pas
  -- produire un gain par une faute de frappe, et reciproquement.
  if v_cat.kind = 'bonus' then
    v_points := abs(v_points);
  elsif v_cat.kind = 'malus' then
    v_points := -abs(v_points);
  end if;
  if v_points = 0 then
    raise exception 'Un evenement a zero point n''a pas de sens.';
  end if;
  v_kind := case when v_points > 0 then 'bonus' else 'malus' end;

  -- Plafond d'occurrences par jour : empeche la spirale ou une meme
  -- betise est ressaisie cinq fois dans la meme soiree.
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

  -- Jour special : le multiplicateur ne s'applique JAMAIS a un malus.
  -- Doubler une punition un jour de fete est la meilleure facon de tuer
  -- l'idee de jour special.
  if v_points > 0 then
    select max(s.multiplier) into v_mult from special_days s
     where s.family_id = v_family and s.day = v_date
       and (s.child_id is null or s.child_id = p_child_id);
    v_mult := coalesce(v_mult, 1);
  end if;

  -- Ecretage : le solde ne descend jamais sous zero.
  if v_points < 0 and p_child_id is not null then
    select balance into v_balance from v_child_balance where child_id = p_child_id;
    if coalesce(v_balance, 0) + v_points < 0 then
      v_points := -coalesce(v_balance, 0);
      if v_points = 0 then
        -- Solde deja nul : on enregistre quand meme l'evenement a zero point
        -- pour garder la trace dans l'historique et dans les analyses.
        insert into events (family_id, child_id, category_id, event_date, day_part,
                            kind, base_points, multiplier, counts_status, note, created_by)
        values (v_family, p_child_id, v_cat.id, v_date, p_day_part,
                'malus', 0, 1, false,
                coalesce(p_note || ' ', '') || '[solde deja a zero, aucun point retire]', auth.uid())
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
end $$;

-- ---------------------------------------------------------------------
-- 2. reverse_event : annuler une saisie. On n'efface pas, on contrepasse.
-- ---------------------------------------------------------------------

create or replace function reverse_event(p_event_id uuid, p_reason text default null)
returns events
language plpgsql security definer set search_path = public as $$
declare
  v_src events;
  v_row events;
begin
  select * into v_src from events where id = p_event_id and family_id = auth_family_id();
  if not found then raise exception 'Evenement introuvable.'; end if;
  if exists (select 1 from events where reverses_id = p_event_id) then
    raise exception 'Cet evenement a deja ete annule.';
  end if;
  if v_src.kind = 'reward' then
    raise exception 'Un echange se rembourse via cancel_redemption, pas ici.';
  end if;

  insert into events (family_id, child_id, category_id, event_date, day_part,
                      kind, base_points, multiplier, counts_status, note,
                      reverses_id, created_by)
  values (v_src.family_id, v_src.child_id, v_src.category_id, v_src.event_date, v_src.day_part,
          'reversal', -v_src.points, 1, false,
          coalesce(p_reason, 'Annulation'), v_src.id, auth.uid())
  returning * into v_row;
  return v_row;
end $$;

-- ---------------------------------------------------------------------
-- 3. repair_event : la reparation. Rend la moitie du malus, arrondi au
--    superieur, quand l'enfant repare ce qu'il a fait.
-- ---------------------------------------------------------------------

create or replace function repair_event(
  p_event_id uuid,
  p_ratio    numeric default 0.5,
  p_note     text    default null
) returns events
language plpgsql security definer set search_path = public as $$
declare
  v_src events;
  v_cat categories;
  v_back int;
  v_row events;
begin
  select * into v_src from events where id = p_event_id and family_id = auth_family_id();
  if not found then raise exception 'Evenement introuvable.'; end if;
  if v_src.points >= 0 then raise exception 'On ne repare qu''un malus.'; end if;
  select * into v_cat from categories where id = v_src.category_id;
  if not coalesce(v_cat.repairable, false) then
    raise exception 'La categorie "%" n''est pas reparable.', v_cat.label;
  end if;
  if exists (select 1 from events where repairs_id = p_event_id) then
    raise exception 'Ce malus a deja ete repare.';
  end if;
  if p_ratio <= 0 or p_ratio > 1 then raise exception 'Ratio attendu entre 0 et 1.'; end if;

  v_back := ceil(abs(v_src.points) * p_ratio)::int;

  insert into events (family_id, child_id, category_id, event_date, day_part,
                      kind, base_points, multiplier, counts_status, note,
                      repairs_id, created_by)
  values (v_src.family_id, v_src.child_id, v_src.category_id,
          (now() at time zone 'Europe/Paris')::date, v_src.day_part,
          'repair', v_back, 1, true,
          coalesce(p_note, 'Reparation'), v_src.id, auth.uid())
  returning * into v_row;
  return v_row;
end $$;

-- ---------------------------------------------------------------------
-- 4. Echanges. p_shares : [{"child_id":"...","points":250}, ...]
--    Le debit n'a lieu qu'a l'approbation, en une seule transaction.
-- ---------------------------------------------------------------------

create or replace function request_redemption(p_reward_id uuid, p_shares jsonb)
returns redemptions
language plpgsql security definer set search_path = public as $$
declare
  v_family uuid := auth_family_id();
  v_r  rewards;
  v_total int;
  v_row redemptions;
  v_share record;
begin
  select * into v_r from rewards where id = p_reward_id and family_id = v_family and active;
  if not found then raise exception 'Recompense inconnue ou desactivee.'; end if;
  if v_r.stock is not null and v_r.stock <= 0 then raise exception 'Stock epuise.'; end if;

  select coalesce(sum((s->>'points')::int), 0) into v_total
    from jsonb_array_elements(p_shares) s;
  if v_total <> v_r.cost then
    raise exception 'La somme des parts (%) doit faire exactement le prix (%).', v_total, v_r.cost;
  end if;

  insert into redemptions (family_id, reward_id, scope, cost_total, requested_by)
  values (v_family, v_r.id, v_r.scope, v_r.cost, auth.uid())
  returning * into v_row;

  for v_share in select (s->>'child_id')::uuid as child_id, (s->>'points')::int as points
                   from jsonb_array_elements(p_shares) s loop
    if not exists (select 1 from children where id = v_share.child_id and family_id = v_family) then
      raise exception 'Enfant inconnu dans les parts.';
    end if;
    insert into redemption_shares (redemption_id, child_id, points)
    values (v_row.id, v_share.child_id, v_share.points);
  end loop;

  return v_row;
end $$;

create or replace function approve_redemption(p_redemption_id uuid)
returns redemptions
language plpgsql security definer set search_path = public as $$
declare
  v_family uuid := auth_family_id();
  v_red redemptions;
  v_r   rewards;
  v_s   record;
  v_bal int;
  v_status int;
  v_age numeric;
begin
  select * into v_red from redemptions where id = p_redemption_id and family_id = v_family;
  if not found then raise exception 'Echange introuvable.'; end if;
  if v_red.state <> 'requested' then raise exception 'Echange deja traite (%).', v_red.state; end if;
  select * into v_r from rewards where id = v_red.reward_id;

  for v_s in select * from redemption_shares where redemption_id = v_red.id loop
    select balance into v_bal from v_child_balance where child_id = v_s.child_id;
    if coalesce(v_bal,0) < v_s.points then
      raise exception 'Solde insuffisant pour un enfant : % disponibles, % demandes.', coalesce(v_bal,0), v_s.points;
    end if;
    -- La regle anti-compensation : chacun doit atteindre le minimum,
    -- le grand frere ne peut pas porter la sortie a lui tout seul.
    if coalesce(v_bal,0) < v_r.min_per_child then
      raise exception 'Minimum par enfant non atteint : % requis, % disponibles.', v_r.min_per_child, coalesce(v_bal,0);
    end if;
    if v_r.min_status > 0 then
      select status_points into v_status from v_child_status where child_id = v_s.child_id;
      if coalesce(v_status,0) < v_r.min_status then
        raise exception 'Niveau de statut insuffisant.';
      end if;
    end if;
    if v_r.min_age is not null then
      select extract(year from age(birth_date)) into v_age from children where id = v_s.child_id;
      if v_age is not null and v_age < v_r.min_age then
        raise exception 'Age minimum non atteint pour cette recompense.';
      end if;
    end if;
  end loop;

  -- Debits. counts_status = false : depenser ne fait JAMAIS perdre de niveau.
  insert into events (family_id, child_id, category_id, event_date, kind,
                      base_points, multiplier, counts_status, note, redemption_id, created_by)
  select v_family, s.child_id, null, (now() at time zone 'Europe/Paris')::date, 'reward',
         -s.points, 1, false, 'Echange : ' || v_r.label, v_red.id, auth.uid()
  from redemption_shares s where s.redemption_id = v_red.id;

  if v_r.stock is not null then
    update rewards set stock = stock - 1 where id = v_r.id;
  end if;

  update redemptions set state = 'approved', decided_by = auth.uid(), decided_at = now()
   where id = v_red.id returning * into v_red;
  return v_red;
end $$;

-- ---------------------------------------------------------------------
-- 5. Bonus de regularite hebdomadaire.
--    A appeler une fois par semaine (pg_cron ou bouton dans les reglages).
--    Donne un horizon court au plus jeune, qui ne se projette pas a 3 mois.
-- ---------------------------------------------------------------------

create or replace function grant_weekly_streak(
  p_week_start date,
  p_min_points int default 2,
  p_min_days   int default 5,
  p_bonus      int default 5
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_family uuid := auth_family_id();
  v_cat uuid;
  v_n int := 0;
  v_c record;
  v_days int;
begin
  select id into v_cat from categories
   where family_id = v_family and label = 'Regularite' and active limit 1;
  if v_cat is null then raise exception 'Categorie "Regularite" absente.'; end if;

  for v_c in select id from children where family_id = v_family and active loop
    select count(*) into v_days from v_daily d
     where d.child_id = v_c.id
       and d.event_date between p_week_start and p_week_start + 6
       and d.gained >= p_min_points;
    if v_days >= p_min_days then
      if not exists (select 1 from events
                      where child_id = v_c.id and category_id = v_cat
                        and event_date = p_week_start + 6) then
        insert into events (family_id, child_id, category_id, event_date, kind,
                            base_points, multiplier, note, created_by)
        values (v_family, v_c.id, v_cat, p_week_start + 6, 'bonus_streak',
                p_bonus, 1, v_days || ' jours sur 7 au-dessus du seuil', auth.uid());
        v_n := v_n + 1;
      end if;
    end if;
  end loop;
  return v_n;
end $$;

-- =====================================================================
--  ROW LEVEL SECURITY
--  Tout est cloisonne par famille. Le role anon n'a aucun droit.
--  NE JAMAIS DESACTIVER, meme "juste pour tester".
-- =====================================================================

alter table families          enable row level security;
alter table parents           enable row level security;
alter table children          enable row level security;
alter table categories        enable row level security;
alter table special_days      enable row level security;
alter table status_levels     enable row level security;
alter table rewards           enable row level security;
alter table redemptions       enable row level security;
alter table redemption_shares enable row level security;
alter table events            enable row level security;

drop policy if exists families_read on families;
create policy families_read on families for select to authenticated
  using (id = auth_family_id());

drop policy if exists parents_read on parents;
create policy parents_read on parents for select to authenticated
  using (family_id = auth_family_id());

-- Tables de parametrage : lecture et ecriture libres pour les parents
-- de la famille. Pas de distinction admin : les deux parents sont egaux.
do $$
declare t text;
begin
  foreach t in array array['children','categories','special_days','status_levels','rewards'] loop
    execute format('drop policy if exists %I on %I', t || '_all', t);
    execute format(
      'create policy %I on %I for all to authenticated
         using (family_id = auth_family_id())
         with check (family_id = auth_family_id())', t || '_all', t);
  end loop;
end $$;

drop policy if exists redemptions_all on redemptions;
create policy redemptions_all on redemptions for all to authenticated
  using (family_id = auth_family_id()) with check (family_id = auth_family_id());

drop policy if exists shares_all on redemption_shares;
create policy shares_all on redemption_shares for all to authenticated
  using (exists (select 1 from redemptions r
                  where r.id = redemption_id and r.family_id = auth_family_id()))
  with check (exists (select 1 from redemptions r
                  where r.id = redemption_id and r.family_id = auth_family_id()));

-- LE JOURNAL EST EN AJOUT SEUL.
-- Une seule politique : SELECT. Pas d'INSERT direct (tout passe par les
-- fonctions security definer), pas d'UPDATE, pas de DELETE. En RLS,
-- l'absence de politique vaut interdiction.
drop policy if exists events_read on events;
create policy events_read on events for select to authenticated
  using (family_id = auth_family_id());

revoke insert, update, delete on events from authenticated, anon;

commit;

-- ---------------------------------------------------------------------
-- Verification rapide apres execution :
--   select tablename, rowsecurity from pg_tables where schemaname='public';
--   -> rowsecurity doit valoir true partout.
-- ---------------------------------------------------------------------
