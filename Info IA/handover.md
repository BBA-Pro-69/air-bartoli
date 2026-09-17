# Handover — Air Bartoli / programme Keyrilès

Projet Supabase : `air-bartoli`, réf. `dgsvpxeqwdyeudqubayd`, région `eu-west-3`
(Paris). Identifiant de famille : `9a8a25c5-fb62-46d8-9a24-b017db399ae3`.

Document de référence unique pour toute personne, humaine ou agent, qui
reprend le projet. Le README décrit ce que fait l'outil ; ce fichier décrit
**pourquoi il est fait ainsi** et **ce qui casse si on y touche**.

## 1. Les décisions structurantes, et leur raison

### 1.1 Deux compteurs plutôt qu'un
Solde dépensable et miles de statut cumulés à vie. Un seul compteur produit
l'effet « retour à zéro » après chaque grosse récompense, qui est la cause
numéro un d'abandon de ce type de système. Le statut n'est jamais débité :
tout débit porte `counts_status = false`.

### 1.2 Journal en ajout seul
`events` n'a qu'une politique `SELECT`. Pas d'`INSERT` direct (les fonctions
`security definer` s'en chargent), pas d'`UPDATE`, pas de `DELETE`. En RLS,
l'absence de politique vaut interdiction, et un `revoke` explicite double la
protection. Corriger = contrepasser via `reverse_event`.
**Piège** : un agent ou un développeur pressé ajoutera une politique
`for all` sur `events` pour « débloquer » une insertion. Ce serait la fin de
la garantie d'intégrité. Si une insertion échoue, c'est qu'il faut passer par
`add_event`.

### 1.3 Points figés sur l'écriture
`base_points` et `multiplier` sont stockés, `points` est une colonne générée.
Changer un barème n'affecte que l'avenir. Ne jamais écrire de migration qui
recalcule `events` à partir de `categories.default_points`.

### 1.4 Deux niveaux de catégories, pas trois
Imposé par le trigger `categories_depth_guard`. Raison : ergonomie de saisie à
une main sur téléphone, et lisibilité des analyses. `v_category_profile`
suppose cette profondeur (une jointure sur le parent, pas une récursion).

### 1.5 Écrêtage à zéro plutôt que solde négatif
Un enfant à −12 points ne joue plus. Quand le malus dépasse le solde,
`add_event` réduit le montant, et si le solde est déjà nul l'écriture est
enregistrée **à zéro point** avec une mention dans la note. Cette écriture à
zéro est volontaire : elle garde le comportement visible dans l'analyse alors
qu'il n'a aucun effet comptable.

### 1.6 Le multiplicateur ne s'applique qu'aux gains
Codé en dur dans `add_event`. Un jour spécial qui double aussi les punitions
n'est plus un jour spécial.

### 1.7 Vues en security_invoker
Les huit vues portent `security_invoker = on`. Par défaut, une vue Postgres
s'exécute avec les droits de son propriétaire et **court-circuite la RLS** :
`v_child_balance` aurait exposé les soldes de toutes les familles à tout
compte authentifié. Toute vue ajoutée plus tard doit porter la même option,
sans exception.

### 1.8 Pas de classement entre enfants
Décision produit, pas technique. Aucune vue ne compare les enfants entre eux
sauf la cagnotte collective. Si on demande un classement, refuser et proposer
la comparaison de chaque enfant à sa propre moyenne sur 28 jours.

## 2. Anatomie de la base

```
families ──< parents            (rattachement auth.users -> famille)
         ──< children
         ──< categories (auto-référencée, 2 niveaux)
         ──< special_days
         ──< status_levels
         ──< rewards ──< redemptions ──< redemption_shares
         ──< events   ← LE JOURNAL, ajout seul
```

`events.child_id` à `null` signifie **cagnotte commune de la fratrie**
(`v_family_pot`). Ce n'est pas une anomalie.

Vues : `v_child_balance`, `v_child_status`, `v_child_level`, `v_child_rate`,
`v_daily`, `v_category_profile`, `v_reward_eligibility`, `v_family_pot`.
Aucun solde n'est stocké nulle part.

Fonctions : `add_event`, `reverse_event`, `repair_event`,
`request_redemption`, `approve_redemption`, `grant_weekly_streak`,
plus les helpers `auth_family_id()` et `is_parent()`.

`auth_family_id()` est `security definer` : sans cela, la politique RLS de
`parents` s'appellerait elle-même et Postgres renverrait une récursion
infinie. Symptôme : `infinite recursion detected in policy for relation
"parents"`.

## 3. Pièges connus

| Symptôme | Cause réelle |
|---|---|
| Toutes les pages sont vides après connexion | la ligne `parents` du compte n'a pas été insérée, `auth_family_id()` renvoie `null` |
| `invalid input syntax for type uuid` sur le bootstrap | un UID collé dans la colonne `family_id` au lieu de `user_id`. Le script actuel retrouve tout par l'adresse e-mail, il n'y a plus rien à recopier |
| `infinite recursion detected in policy` | `auth_family_id()` a perdu son `security definer` |
| Une saisie du soir tombe la veille | une date calculée en UTC quelque part au lieu de `Europe/Paris` |
| `new row violates row-level security policy for table "events"` | tentative d'`insert` direct au lieu d'un appel à `add_event` |
| Un malus n'a rien retiré | écrêtage à zéro, comportement attendu, la note le dit |
| Le compte à rebours affiche « — » | `v_child_rate` à 0 : aucun point gagné sur 28 jours |
| Une nouvelle vue renvoie les données d'une autre famille | `security_invoker` oublié à la création de la vue |
| `permission denied for function add_event` | le `revoke` de la migration 05 a été appliqué sans le `grant` à `authenticated` |

## 4. Calibration, à réviser tous les trimestres

Étalon : **22 points par semaine et par enfant**. Vérifier avec :

```sql
select child_id, round(avg(gained)*7, 1) as points_par_semaine
from v_daily
where event_date > current_date - 56
group by child_id;
```

Si le rythme réel dérive de plus de 30 % de l'étalon, ajuster **les prix du
catalogue**, jamais les points déjà gagnés. Un catalogue qui devient trop cher
démotive ; un catalogue trop bon marché vide la cagnotte collective de tout
intérêt.

## 5. Connexion : identifiant court, pas adresse complète

Toutes les applications du compte `Fluxym-BBA` partagent la même origine
`fluxym-bba.github.io`. Chrome mélange donc les mots de passe enregistrés
d'une application à l'autre.

Les deux comptes sont des adresses Gmail personnelles aux préfixes
dissemblables (`nevine.bartoli` et `bruno.s.bartoli`) : le recollage
automatique d'un domaine unique, utilisé sur les autres projets, ne
s'applique pas ici. Le front proposera donc **deux boutons portant les
prénoms** plutôt qu'un champ e-mail libre : l'adresse est résolue côté
client à partir du prénom choisi, il ne reste que le mot de passe à saisir.
C'est plus rapide sur un téléphone et cela évite le mélange de Chrome.

## 6. Ce qui reste ouvert

- Mode kiosque enfant sans mot de passe (lien en lecture seule avec jeton
  dédié) : aujourd'hui l'écran enfant s'ouvre depuis la session d'un parent.
- Notification du soir pour rappeler la saisie de la journée.
- Photo jointe à une écriture (dessin réussi, mur repeint) : impliquerait
  Supabase Storage, donc de nouvelles politiques.
- Expiration des points : volontairement **non implémentée**. Un enfant qui
  perd des points en dormant ne comprendrait pas, et les compagnies aériennes
  sont détestées pour exactement cette raison.
