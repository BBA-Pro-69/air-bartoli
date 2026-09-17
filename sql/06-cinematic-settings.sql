-- =====================================================================
-- Air Bartoli - seuils des cinématiques, configurables par famille
-- Les seuils s'appliquent aux points gagnés lors d'une seule saisie.
-- =====================================================================
begin;

create table if not exists cinematic_settings (
  family_id   uuid primary key references families(id) on delete cascade,
  level_1_min int not null default 1,
  level_2_min int not null default 5,
  level_3_min int not null default 16,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint cinematic_level_1_positive check (level_1_min >= 1),
  constraint cinematic_level_2_after_level_1 check (level_2_min > level_1_min),
  constraint cinematic_level_3_after_level_2 check (level_3_min > level_2_min)
);

create or replace function cinematic_settings_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists cinematic_settings_updated_at on cinematic_settings;
create trigger cinematic_settings_updated_at
before update on cinematic_settings
for each row execute function cinematic_settings_touch_updated_at();

alter table cinematic_settings enable row level security;

drop policy if exists cinematic_settings_all on cinematic_settings;
create policy cinematic_settings_all on cinematic_settings
for all to authenticated
using (family_id = auth_family_id())
with check (family_id = auth_family_id());

-- Une ligne de réglages par famille, avec les valeurs actuelles comme défaut.
insert into cinematic_settings (family_id)
select id from families
on conflict (family_id) do nothing;

grant select, insert, update, delete on cinematic_settings to authenticated;
revoke all on cinematic_settings from anon;

commit;
