-- =====================================================================
-- Air Bartoli - Migration 13 : Gestion de l'équipage, profils adultes et enfants
-- =====================================================================

begin;

-- [1] Colonnes role_title et email dans public.parents
alter table public.parents add column if not exists role_title text default 'Parent';
alter table public.parents add column if not exists email text;

-- [2] Renseignement des emails et rôles des parents fondateurs
update public.parents
set email = 'nevine.bartoli@gmail.com', role_title = 'Parent', is_admin = true
where display_name ilike '%nevine%';

update public.parents
set email = 'bruno.s.bartoli@gmail.com', role_title = 'Parent', is_admin = true
where display_name ilike '%bruno%';

-- [3] Ajustement du taux d'intérêt annuel par défaut de la Tirelire Magique à 100%
update public.savings_settings
set annual_interest_rate = 100.00
where family_id = '9a8a25c5-fb62-46d8-9a24-b017db399ae3';

-- [4] Ajustement de la part d'épargne par défaut des enfants à 70%
update public.children
set savings_pct = 70
where family_id = '9a8a25c5-fb62-46d8-9a24-b017db399ae3';

-- [5] Fonction pour inviter / créer un membre d'équipage adulte
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
  v_family_id uuid := auth_family_id();
  v_is_admin  boolean;
  v_user_id   uuid;
begin
  if v_family_id is null then
    raise exception 'Utilisateur non authentifié.';
  end if;
  select is_admin into v_is_admin from parents where user_id = auth.uid();
  if not coalesce(v_is_admin, false) then
    raise exception 'Seuls les administrateurs peuvent inviter des membres d''équipage.';
  end if;

  select id into v_user_id from auth.users where email = lower(trim(p_email));
  if v_user_id is not null then
    raise exception 'Un compte avec cette adresse email existe déjà.';
  end if;

  v_user_id := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    lower(trim(p_email)), extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', p_display_name),
    now(), now()
  );

  insert into public.parents (
    user_id, family_id, display_name, is_admin, role_title, email
  ) values (
    v_user_id, v_family_id, trim(p_display_name), false, coalesce(p_role_title, 'Membre d''équipage'), lower(trim(p_email))
  );

  return jsonb_build_object('user_id', v_user_id, 'display_name', p_display_name, 'role_title', p_role_title, 'email', p_email);
end;
$$;

revoke execute on function public.create_crew_member(text, text, text, text) from anon, public;
grant execute on function public.create_crew_member(text, text, text, text) to authenticated;

-- [6] Fonction pour retirer un membre d'équipage adulte
create or replace function public.remove_crew_member(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_family_id uuid := auth_family_id();
  v_is_admin  boolean;
  v_target_admin boolean;
begin
  if v_family_id is null then
    raise exception 'Utilisateur non authentifié.';
  end if;
  select is_admin into v_is_admin from parents where user_id = auth.uid();
  if not coalesce(v_is_admin, false) then
    raise exception 'Seuls les administrateurs peuvent retirer des membres d''équipage.';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Impossible de supprimer son propre compte administrateur.';
  end if;

  select is_admin into v_target_admin from parents where user_id = p_user_id and family_id = v_family_id;
  if not found then
    raise exception 'Membre d''équipage introuvable.';
  end if;
  if v_target_admin then
    raise exception 'Impossible de supprimer un compte parent administrateur.';
  end if;

  delete from public.parents where user_id = p_user_id;
  delete from auth.users where id = p_user_id;
  return true;
end;
$$;

revoke execute on function public.remove_crew_member(uuid) from anon, public;
grant execute on function public.remove_crew_member(uuid) to authenticated;

commit;
