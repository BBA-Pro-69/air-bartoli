-- =====================================================================
-- Air Bartoli - autonomie complete sur les categories
-- Suppression physique si la categorie n'a jamais ete utilisee.
-- Sinon retrait du menu, avec conservation de l'historique.
-- =====================================================================
begin;

create or replace function delete_category(p_category_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_family uuid := auth_family_id();
  v_parent uuid;
  v_ids uuid[];
  v_used int;
begin
  if v_family is null then
    raise exception 'Utilisateur non rattache a une famille.';
  end if;

  select parent_id into v_parent
    from categories
   where id = p_category_id and family_id = v_family;
  if not found then
    raise exception 'Categorie introuvable.';
  end if;

  if v_parent is null then
    select array_agg(id) into v_ids
      from categories
     where family_id = v_family
       and (id = p_category_id or parent_id = p_category_id);
  else
    v_ids := array[p_category_id];
  end if;

  select count(*) into v_used
    from events
   where family_id = v_family
     and category_id = any(v_ids);

  if v_used > 0 then
    update categories set active = false
     where family_id = v_family and id = any(v_ids);
    return 'archived';
  end if;

  delete from categories
   where family_id = v_family and id = any(v_ids);
  return 'deleted';
end $$;

grant execute on function delete_category(uuid) to authenticated;
revoke execute on function delete_category(uuid) from anon, public;

-- Le bonus de regularite reste fonctionnel meme si le parent decide de
-- supprimer ou renommer la categorie technique. Dans ce cas l'evenement
-- conserve son type bonus_streak mais category_id est null.
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
   where family_id = v_family and active
     and label in ('Regularite', 'Régularité')
   order by id limit 1;

  for v_c in select id from children where family_id = v_family and active loop
    select count(*) into v_days from v_daily d
     where d.child_id = v_c.id
       and d.event_date between p_week_start and p_week_start + 6
       and d.gained >= p_min_points;
    if v_days >= p_min_days then
      if not exists (select 1 from events
                      where child_id = v_c.id and kind = 'bonus_streak'
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

commit;
