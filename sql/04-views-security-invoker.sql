-- Migration 4 : les vues heritent des droits de l'appelant.
-- Sans security_invoker, une vue s'execute avec les droits de son
-- proprietaire (postgres) et IGNORE la RLS : n'importe quel compte
-- authentifie lirait les soldes de toutes les familles.
do $$
declare v text;
begin
  foreach v in array array['v_child_balance','v_child_status','v_child_level',
                           'v_child_rate','v_daily','v_category_profile',
                           'v_reward_eligibility','v_family_pot'] loop
    execute format('alter view %I set (security_invoker = on)', v);
  end loop;
end $$;
