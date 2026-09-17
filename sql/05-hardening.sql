-- Migration 5 : durcissement, suite a l'analyseur de securite Supabase.

-- 1. search_path fige sur les fonctions de trigger.
alter function public.categories_depth_guard() set search_path = public;
alter function public.events_no_future()      set search_path = public;

-- 2. Le role anon n'appelle aucune fonction metier. PostgREST expose
--    automatiquement toute fonction du schema public en /rest/v1/rpc/.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('add_event','reverse_event','repair_event',
                        'request_redemption','approve_redemption',
                        'grant_weekly_streak','auth_family_id','is_parent')
  loop
    execute format('revoke execute on function %s from anon, public', f.sig);
    execute format('grant  execute on function %s to authenticated', f.sig);
  end loop;
end $$;
