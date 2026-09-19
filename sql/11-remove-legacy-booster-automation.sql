-- Air Bartoli - retirer l'ancien déclencheur de boosters à coefficient.
-- Les anciennes données restent dans events et booster_grants.
begin;

drop trigger if exists events_auto_boosters on public.events;
drop function if exists public.events_auto_boosters();
drop function if exists public.evaluate_current_boosters();
drop function if exists public.grant_period_boosters(uuid, uuid, date, uuid);

commit;
