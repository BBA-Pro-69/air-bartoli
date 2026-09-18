-- =====================================================================
--  DERNIERE ETAPE DE MISE EN SERVICE - deja executee le 17/09/2026
-- =====================================================================
--  Prealable, dans Supabase > Authentication :
--   1. Sign In / Providers > Email : decocher "Confirm email",
--      desactiver "Allow new users to sign up".
--   2. Users > Add user > Create new user, "Auto Confirm User" coche.
--
--  Ce script ne demande AUCUN identifiant a recopier : il retrouve les
--  comptes par leur adresse et l'identifiant de famille tout seul.
--  Premiere version de ce fichier : il fallait coller deux UID a la main
--  dans une requete a quatre colonnes, et l'erreur naturelle est de les
--  coller dans la colonne family_id. C'est exactement ce qui est arrive.
--  Un script qui se trompe de colonne est un script mal ecrit, pas un
--  utilisateur distrait.
--
--  Il est idempotent : le relancer ne cree pas de doublon.
-- =====================================================================

insert into parents (user_id, family_id, display_name, is_admin)
select u.id,
       (select id from families),          -- une seule famille dans ce projet
       case u.email
         when 'nevine.bartoli@gmail.com'    then 'Névine'
         when 'bruno.s.bartoli@gmail.com'   then 'Bruno'
       end,
       true
from auth.users u
where u.email in ('nevine.bartoli@gmail.com','bruno.s.bartoli@gmail.com')
on conflict (user_id) do nothing;

-- Controle : doit renvoyer deux lignes, avec le MEME family_id.
select p.display_name, u.email, p.family_id
from parents p join auth.users u on u.id = p.user_id
order by p.display_name;
