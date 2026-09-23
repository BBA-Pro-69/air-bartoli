-- =====================================================================
-- Air Bartoli - Migration 15 : Roles et permissions equipage + stock recompenses
-- =====================================================================

begin;

create table if not exists public.crew_roles (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  is_admin boolean not null default false,
  can_view_settings boolean not null default false,
  can_edit_crew boolean not null default false,
  can_edit_bareme boolean not null default false,
  can_edit_savings boolean not null default false,
  can_edit_rewards boolean not null default false,
  can_give_rewards boolean not null default true,
  can_add_malus boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.crew_roles enable row level security;
drop policy if exists "crew_roles_parent_all" on public.crew_roles;
create policy "crew_roles_parent_all" on public.crew_roles
  for all to authenticated
  using (family_id = auth_family_id())
  with check (family_id = auth_family_id());

alter table public.parents add column if not exists role_id uuid references public.crew_roles(id) on delete set null;

create or replace function public.update_crew_member(
  p_user_id      uuid,
  p_display_name text,
  p_role_title   text default null,
  p_avatar_url   text default null,
  p_email        text default null,
  p_active       boolean default null,
  p_role_id      uuid default null
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
  if v_family_id is null then raise exception 'Utilisateur non authentifie.'; end if;
  select is_admin into v_is_admin from parents where user_id = auth.uid();
  if not coalesce(v_is_admin, false) and p_user_id != auth.uid() then
    raise exception 'Seuls les administrateurs peuvent modifier les autres membres.';
  end if;

  if p_user_id = auth.uid() and p_active = false then
    raise exception 'Impossible de desactiver son propre compte connecte.';
  end if;

  update public.parents
  set
    display_name = coalesce(trim(p_display_name), display_name),
    role_title   = coalesce(trim(p_role_title), role_title),
    avatar_url   = case when p_avatar_url is not null then p_avatar_url else avatar_url end,
    email        = coalesce(lower(trim(p_email)), email),
    active       = coalesce(p_active, active),
    role_id      = coalesce(p_role_id, role_id)
  where user_id = p_user_id and family_id = v_family_id;

  return true;
end;
$$;

revoke execute on function public.update_crew_member(uuid, text, text, text, text, boolean, uuid) from anon, public;
grant execute on function public.update_crew_member(uuid, text, text, text, text, boolean, uuid) to authenticated;

commit;
