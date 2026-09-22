-- =====================================================================
-- Air Bartoli - Migration 14 : Flexibilité d'attribution des récompenses
-- 1. Choix du stock (Portefeuille vs Tirelire Magique) par enfant.
-- 2. Colonne default_savings_pct pour persister le réglage global d'épargne.
-- 3. Fonctions RPC update_crew_member et remove_crew_member pour tous les adultes.
-- 4. Prise en compte de 'adjustment' dans v_child_balance.
-- =====================================================================

begin;

-- [1] Colonnes wallet_points et savings_points dans redemption_shares
alter table public.redemption_shares add column if not exists wallet_points integer default 0;
alter table public.redemption_shares add column if not exists savings_points integer default 0;

-- [2] Colonne default_savings_pct dans savings_settings
alter table public.savings_settings add column if not exists default_savings_pct integer not null default 70 check (default_savings_pct >= 0 and default_savings_pct <= 100);

-- [3] Mise à jour de request_redemption pour supporter wallet_points et savings_points
create or replace function public.request_redemption(p_reward_id uuid, p_shares jsonb)
returns redemptions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_family uuid := auth_family_id();
  v_r      rewards;
  v_total  int;
  v_row    redemptions;
  v_elem   jsonb;
  v_cid    uuid;
  v_pts    int;
  v_wp     int;
  v_sp     int;
begin
  select * into v_r from rewards where id = p_reward_id and family_id = v_family and active;
  if not found then raise exception 'Recompense inconnue ou desactivee.'; end if;
  if v_r.stock is not null and v_r.stock <= 0 then raise exception 'Stock epuise.'; end if;

  v_total := 0;
  for v_elem in select * from jsonb_array_elements(p_shares) loop
    v_wp := coalesce((v_elem->>'wallet_points')::int, 0);
    v_sp := coalesce((v_elem->>'savings_points')::int, 0);
    v_pts := coalesce((v_elem->>'points')::int, v_wp + v_sp);
    if v_wp = 0 and v_sp = 0 and v_pts > 0 then
      if v_r.scope = 'collective' then v_sp := v_pts; else v_wp := v_pts; end if;
    end if;
    v_total := v_total + v_wp + v_sp;
  end loop;

  if v_total <> v_r.cost then
    raise exception 'La somme des parts (% pts) doit faire exactement le prix (% pts).', v_total, v_r.cost;
  end if;

  insert into redemptions (family_id, reward_id, scope, cost_total, requested_by)
  values (v_family, v_r.id, v_r.scope, v_r.cost, auth.uid())
  returning * into v_row;

  for v_elem in select * from jsonb_array_elements(p_shares) loop
    v_cid := (v_elem->>'child_id')::uuid;
    v_wp := coalesce((v_elem->>'wallet_points')::int, 0);
    v_sp := coalesce((v_elem->>'savings_points')::int, 0);
    v_pts := coalesce((v_elem->>'points')::int, v_wp + v_sp);
    if v_wp = 0 and v_sp = 0 and v_pts > 0 then
      if v_r.scope = 'collective' then v_sp := v_pts; else v_wp := v_pts; end if;
    end if;

    if not exists (select 1 from children where id = v_cid and family_id = v_family) then
      raise exception 'Enfant inconnu dans les parts.';
    end if;

    insert into redemption_shares (redemption_id, child_id, points, wallet_points, savings_points)
    values (v_row.id, v_cid, v_wp + v_sp, v_wp, v_sp);
  end loop;

  return v_row;
end;
$$;

-- [4] Mise à jour de approve_redemption
create or replace function public.approve_redemption(p_redemption_id uuid)
returns redemptions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_family   uuid := auth_family_id();
  v_red      redemptions;
  v_r        rewards;
  v_s        record;
  v_wbal     int;
  v_sbal     int;
  v_today    date := (now() at time zone 'Europe/Paris')::date;
begin
  select * into v_red from redemptions where id = p_redemption_id and family_id = v_family;
  if not found then raise exception 'Echange introuvable.'; end if;
  if v_red.state <> 'requested' then raise exception 'Echange deja traite (%).', v_red.state; end if;
  select * into v_r from rewards where id = v_red.reward_id;

  for v_s in select * from redemption_shares where redemption_id = v_red.id loop
    select wallet_balance, savings_balance into v_wbal, v_sbal
    from v_child_balance where child_id = v_s.child_id;

    if coalesce(v_s.wallet_points, 0) > coalesce(v_wbal, 0) then
      raise exception 'Solde Portefeuille insuffisant : % pts requis, % disponibles.', v_s.wallet_points, coalesce(v_wbal, 0);
    end if;
    if coalesce(v_s.savings_points, 0) > coalesce(v_sbal, 0) then
      raise exception 'Solde Tirelire Magique insuffisant : % pts requis, % disponibles.', v_s.savings_points, coalesce(v_sbal, 0);
    end if;

    -- Débit du portefeuille si part > 0
    if coalesce(v_s.wallet_points, 0) > 0 then
      insert into events (family_id, child_id, category_id, event_date, day_part,
                          kind, base_points, multiplier, counts_status, note, wallet_target, redemption_id, created_by)
      values (v_family, v_s.child_id, null, v_today, 'reward',
              -v_s.wallet_points, 1, false, 'Echange : ' || v_r.label || ' [Portefeuille]', 'wallet', v_red.id, auth.uid());
    end if;

    -- Débit de la tirelire si part > 0
    if coalesce(v_s.savings_points, 0) > 0 then
      insert into events (family_id, child_id, category_id, event_date, day_part,
                          kind, base_points, multiplier, counts_status, note, wallet_target, redemption_id, created_by)
      values (v_family, v_s.child_id, null, v_today, 'reward',
              -v_s.savings_points, 1, false, 'Echange : ' || v_r.label || ' [Tirelire Magique]', 'savings', v_red.id, auth.uid());
    end if;
  end loop;

  if v_r.stock is not null then
    update rewards set stock = stock - 1 where id = v_r.id;
  end if;

  update redemptions set state = 'approved', decided_by = auth.uid(), decided_at = now()
   where id = v_red.id returning * into v_red;
  return v_red;
end;
$$;

-- [5] Mise à jour de cancel_redemption pour restituer les points dans le bon stock
create or replace function public.cancel_redemption(p_redemption_id uuid, p_reason text default null)
returns redemptions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_family uuid := auth_family_id();
  v_red    redemptions;
  v_r      rewards;
  v_ev     record;
begin
  select * into v_red from redemptions where id = p_redemption_id and family_id = v_family;
  if not found then raise exception 'Echange introuvable.'; end if;
  if v_red.state = 'cancelled' then raise exception 'Cet echange a deja ete annule.'; end if;
  select * into v_r from rewards where id = v_red.reward_id;

  for v_ev in select * from events where redemption_id = v_red.id and kind = 'reward' loop
    if not exists (select 1 from events where reverses_id = v_ev.id) then
      insert into events (family_id, child_id, category_id, event_date, day_part,
                          kind, base_points, multiplier, counts_status, note,
                          wallet_target, reverses_id, created_by)
      values (v_family, v_ev.child_id, null, (now() at time zone 'Europe/Paris')::date, v_ev.day_part,
              'reversal', abs(v_ev.points), 1, false,
              coalesce(p_reason, 'Annulation de recompense : ' || coalesce(v_r.label, '')),
              v_ev.wallet_target, v_ev.id, auth.uid());
    end if;
  end loop;

  if v_r.stock is not null then
    update rewards set stock = stock + 1 where id = v_r.id;
  end if;

  update redemptions
  set state = 'cancelled', decided_by = auth.uid(), decided_at = now()
  where id = v_red.id
  returning * into v_red;

  return v_red;
end;
$$;

-- [6] Fonctions update_crew_member et remove_crew_member
create or replace function public.update_crew_member(
  p_user_id      uuid,
  p_display_name text,
  p_role_title   text default null,
  p_avatar_url   text default null,
  p_email        text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_family_id uuid := auth_family_id();
  v_is_admin  boolean;
begin
  if v_family_id is null then
    raise exception 'Utilisateur non authentifié.';
  end if;
  select is_admin into v_is_admin from parents where user_id = auth.uid();
  if not coalesce(v_is_admin, false) and p_user_id != auth.uid() then
    raise exception 'Seuls les administrateurs peuvent modifier les autres membres.';
  end if;

  update public.parents
  set
    display_name = coalesce(trim(p_display_name), display_name),
    role_title   = coalesce(trim(p_role_title), role_title),
    avatar_url   = case when p_avatar_url is not null then p_avatar_url else avatar_url end,
    email        = coalesce(lower(trim(p_email)), email)
  where user_id = p_user_id and family_id = v_family_id;

  return true;
end;
$$;

revoke execute on function public.update_crew_member(uuid, text, text, text, text) from anon, public;
grant execute on function public.update_crew_member(uuid, text, text, text, text) to authenticated;

create or replace function public.remove_crew_member(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_family_id uuid := auth_family_id();
  v_is_admin  boolean;
begin
  if v_family_id is null then
    raise exception 'Utilisateur non authentifié.';
  end if;
  select is_admin into v_is_admin from parents where user_id = auth.uid();
  if not coalesce(v_is_admin, false) then
    raise exception 'Seuls les administrateurs peuvent retirer des membres d''équipage.';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Impossible de supprimer son propre compte connecté.';
  end if;

  if not exists (select 1 from parents where user_id = p_user_id and family_id = v_family_id) then
    raise exception 'Membre introuvable dans cette famille.';
  end if;

  delete from public.parents where user_id = p_user_id and family_id = v_family_id;
  delete from auth.users where id = p_user_id;
  return true;
end;
$$;

revoke execute on function public.remove_crew_member(uuid) from anon, public;
grant execute on function public.remove_crew_member(uuid) to authenticated;

-- [7] Vue v_child_balance avec prise en compte des ajustements dans chaque stock
drop view if exists public.v_reward_eligibility cascade;
drop view if exists public.v_child_balance cascade;

create view public.v_child_balance with (security_invoker = on) as
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
    coalesce(sum(e.points) filter (
      where (e.kind = 'reward' and coalesce(e.wallet_target, 'wallet') = 'wallet')
         or (e.kind = 'reversal' and exists (
               select 1 from events r where r.id = e.reverses_id and r.kind = 'reward' and coalesce(r.wallet_target, 'wallet') = 'wallet'
            ))
         or (e.kind in ('booster', 'bonus_streak', 'adjustment') and coalesce(e.wallet_target, 'wallet') = 'wallet' and not exists (
               select 1 from events rev where rev.reverses_id = e.id
            ))
    ), 0)::integer as wallet_extras,
    coalesce(sum(e.points) filter (
      where e.kind = 'interest'
         or (e.kind = 'reward' and e.wallet_target = 'savings')
         or (e.kind = 'reversal' and exists (
               select 1 from events r where r.id = e.reverses_id and r.kind = 'reward' and r.wallet_target = 'savings'
            ))
         or (e.kind in ('booster', 'bonus_streak', 'adjustment') and e.wallet_target = 'savings' and not exists (
               select 1 from events rev where rev.reverses_id = e.id
            ))
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
  coalesce(c.savings_pct, 70)::integer as savings_pct
from children c
left join settled s on s.child_id = c.id
left join rewards_and_interest ri on ri.child_id = c.id
left join today_pending_calc tp on tp.child_id = c.id;

create view public.v_reward_eligibility with (security_invoker = on) as
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

commit;
