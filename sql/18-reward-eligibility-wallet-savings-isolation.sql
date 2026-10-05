-- =====================================================================
-- Air Bartoli - Migration 18 : Isolation Portefeuille vs Tirelire pour l'éligibilité
-- 1. Récompenses individuelles : jauge et temps d'attente (days_left)
--    basés exclusivement sur le solde et le flux du Portefeuille (wallet_balance).
-- 2. Récompenses collectives : temps d'attente (days_left) et minimum
--    basés exclusivement sur le solde et le flux de la Tirelire Magique (savings_balance).
-- =====================================================================

begin;

create or replace view public.v_reward_eligibility with (security_invoker = on) as
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
  greatest(
    case
      when r.scope = 'individual' then (r.cost - b.wallet_balance)
      else 0
    end, 0) as missing_individual,
  case
    when coalesce(rt.weekly_rate, 0) = 0 then null::integer
    else (
      ceil(
        greatest(
          case
            when r.scope = 'individual' then (r.cost - b.wallet_balance)
            else (r.min_per_child - b.savings_balance)
          end, 0
        )::numeric / (
          case
            when r.scope = 'individual' then
              greatest(0.05, (rt.weekly_rate::numeric * ((100.0 - coalesce(b.savings_pct, 30)::numeric) / 100.0)) / 7.0)
            else
              greatest(0.05, (rt.weekly_rate::numeric * (coalesce(b.savings_pct, 70)::numeric / 100.0)) / 7.0)
          end
        )
      )
    )::integer
  end as days_left
from rewards r
join v_child_balance b on b.family_id = r.family_id
left join v_child_rate rt on rt.child_id = b.child_id
where r.active;

commit;
