-- =====================================================================
-- Air Bartoli - Migration 14 : Flexibilité récompenses & équipage complet
-- 1. Colonnes wallet_points et savings_points dans redemption_shares.
-- 2. Colonne default_savings_pct dans savings_settings.
-- 3. Colonne active dans public.parents (visibilité à la connexion).
-- 4. Fonctions request_redemption et approve_redemption avec répartition par stock.
-- 5. Fonctions create_crew_member (avec auth.identities et tokens vides) et remove_crew_member.
-- 6. Fonction get_crew_login_profiles() pour l'écran de connexion dynamique (active = true).
-- =====================================================================

begin;

-- [1] Colonnes wallet_points et savings_points dans redemption_shares
alter table public.redemption_shares add column if not exists wallet_points integer default 0;
alter table public.redemption_shares add column if not exists savings_points integer default 0;

-- [2] Colonne default_savings_pct dans savings_settings
alter table public.savings_settings add column if not exists default_savings_pct integer not null default 70 check (default_savings_pct >= 0 and default_savings_pct <= 100);

-- [3] Colonne active dans public.parents
alter table public.parents add column if not exists active boolean not null default true;

-- [4] Mise à jour de request_redemption pour supporter wallet_points et savings_points
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

-- [5] Mise à jour de approve_redemption
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

    if coalesce(v_s.wallet_points, 0) > 0 then
      insert into events (family_id, child_id, category_id, event_date, day_part,
                          kind, base_points, multiplier, counts_status, note, wallet_target, redemption_id, created_by)
      values (v_family, v_s.child_id, null, v_today, 'reward',
              -v_s.wallet_points, 1, false, 'Echange : ' || v_r.label || ' [Portefeuille]', 'wallet', v_red.id, auth.uid());
    end if;

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

-- [6] Mise à jour de cancel_redemption
create or replace function public.cancel_redemption(p_redemption_id uuid, p_reason text default null)
returns redemptions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_family uuid := coalesce(auth_family_id(), (select family_id from redemptions where id = p_redemption_id));
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
              v_ev.wallet_target, v_ev.id, coalesce(auth.uid(), v_ev.created_by));
    end if;
  end loop;

  if v_r.stock is not null then
    update rewards set stock = stock + 1 where id = v_r.id;
  end if;

  update redemptions
  set state = 'cancelled', decided_by = coalesce(auth.uid(), v_red.decided_by), decided_at = now()
  where id = v_red.id
  returning * into v_red;

  return v_red;
end;
$$;

-- [7] Fonction pour l'écran de connexion dynamique (uniquement les membres actifs)
create or replace function public.get_crew_login_profiles()
returns table (
  user_id uuid,
  display_name text,
  role_title text,
  avatar_url text,
  is_admin boolean,
  email text
)
language sql
security definer
set search_path to 'public'
as $$
  select
    user_id,
    display_name,
    coalesce(role_title, case when is_admin then 'Parent' else 'Membre d''équipage' end) as role_title,
    avatar_url,
    is_admin,
    email
  from parents
  where active = true
  order by is_admin desc, created_at asc;
$$;

grant execute on function public.get_crew_login_profiles() to anon, authenticated;

-- [8] Fonctions create_crew_member (avec auth.identities et tokens vides) et remove_crew_member
create or replace function public.create_crew_member(
  p_email text,
  p_password text,
  p_display_name text,
  p_role_title text default 'Membre d''équipage'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'extensions'
as $$
declare
  v_family_id   uuid := auth_family_id();
  v_is_admin    boolean;
  v_user_id     uuid;
  v_clean_email text := lower(trim(p_email));
begin
  if v_family_id is null then
    raise exception 'Utilisateur non authentifié.';
  end if;
  select is_admin into v_is_admin from parents where user_id = auth.uid();
  if not coalesce(v_is_admin, false) then
    raise exception 'Seuls les administrateurs peuvent inviter des membres d''équipage.';
  end if;

  select id into v_user_id from auth.users where email = v_clean_email;
  if v_user_id is not null then
    raise exception 'Un compte avec cette adresse email existe déjà.';
  end if;

  v_user_id := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, reauthentication_token,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    v_clean_email, extensions.crypt(p_password, extensions.gen_salt('bf')), now(), now(),
    '', '', '', '',
    '', '', '', 0, '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', trim(p_display_name)),
    now(), now()
  );

  insert into auth.identities (
    id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_user_id, v_user_id,
    jsonb_build_object('sub', v_user_id, 'email', v_clean_email, 'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  );

  insert into public.parents (
    user_id, family_id, display_name, is_admin, role_title, email, active
  ) values (
    v_user_id, v_family_id, trim(p_display_name), false, coalesce(p_role_title, 'Membre d''équipage'), v_clean_email, true
  );

  return jsonb_build_object('user_id', v_user_id, 'display_name', p_display_name, 'role_title', p_role_title, 'email', v_clean_email);
end;
$$;

revoke execute on function public.create_crew_member(text, text, text, text) from anon, public;
grant execute on function public.create_crew_member(text, text, text, text) to authenticated;

create or replace function public.update_crew_member(
  p_user_id      uuid,
  p_display_name text,
  p_role_title   text default null,
  p_avatar_url   text default null,
  p_email        text default null,
  p_active       boolean default null
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

  if p_user_id = auth.uid() and p_active = false then
    raise exception 'Impossible de désactiver son propre compte connecté.';
  end if;

  update public.parents
  set
    display_name = coalesce(trim(p_display_name), display_name),
    role_title   = coalesce(trim(p_role_title), role_title),
    avatar_url   = case when p_avatar_url is not null then p_avatar_url else avatar_url end,
    email        = coalesce(lower(trim(p_email)), email),
    active       = coalesce(p_active, active)
  where user_id = p_user_id and family_id = v_family_id;

  return true;
end;
$$;

revoke execute on function public.update_crew_member(uuid, text, text, text, text, boolean) from anon, public;
grant execute on function public.update_crew_member(uuid, text, text, text, text, boolean) to authenticated;

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

  delete from auth.identities where user_id = p_user_id;
  delete from public.parents where user_id = p_user_id and family_id = v_family_id;
  delete from auth.users where id = p_user_id;
  return true;
end;
$$;

revoke execute on function public.remove_crew_member(uuid) from anon, public;
grant execute on function public.remove_crew_member(uuid) to authenticated;

commit;
