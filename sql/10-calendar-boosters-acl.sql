-- Correction des droits de la fonction de boosters.
begin;
revoke execute on function public.apply_period_boosters() from public;
revoke execute on function public.apply_period_boosters() from anon;
grant execute on function public.apply_period_boosters() to authenticated;
commit;
