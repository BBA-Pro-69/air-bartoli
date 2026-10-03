# État du déploiement — Air Bartoli / Keyrilès

À tenir à jour à chaque livraison. Une ligne par version, la plus récente en
haut.

## 3 octobre 2026 : calcul net des boosters calendaires (L56)

- Migration `17-fix-booster-net-calculation.sql` :
  - `apply_period_boosters` : les jours qualifiants (`v_days`) sont désormais calculés sur le **score net journalier** (`day_net = gains - malus`), et non sur les gains bruts isolés. Un jour où le net est inférieur au seuil quotidien n'est plus qualifiant.
  - Le total de la période (`v_total`) est désormais évalué en points nets (après déduction des malus).
  - La note de l'événement généré indique explicitement le nombre réel de jours qualifiants et le minimum requis : `Booster hebdomadaire : X jours qualifiants à au moins Y pt(s) (min. Z), N pts nets au total`.
  - Données historiques du 27 septembre 2026 régularisées : Keyran validait bien la règle (6 jours réels >= 2 pts pour un minimum de 5 requis, et 40 pts nets pour 18 requis).

## 2 octobre 2026 : scores journaliers négatifs autorisés et plancher global à zéro (L55)

- Migration `16-allow-negative-daily-score.sql` :
  - `add_event` : suppression de l'écrêtage à 0 lors de la saisie d'un malus. L'enfant peut descendre dans le négatif au sein d'une même journée.
  - `daily_settlements` : suppression du check positif sur `day_score` pour refléter le score exact du jour. `wallet_points` et `savings_points` restent >= 0 (0 point crédité sur le compteur global si journée négative).
  - `v_daily` : expose `daily_score` (comportement réel du jour, peut être négatif) et `counted_score` (score comptabilisé sur le compteur global avec plancher à 0).
- Front-end :
  - `js/saisie.js` : affichage du score net négatif (ex: -4 pts) avec libellé clair `(comptabilisé : 0 pt)`. Retrait du message déroutant "est déjà à 0 : rien retiré".
  - `js/historique.js` : calendrier mensuel avec affichage des scores réels négatifs en rouge (`.negative`) et modale détaillée avec mention explicite du score comptabilisé à 0.
  - `js/reglages.js` : présélection intelligente de `malus` par défaut lors de la création d'une sous-catégorie sous "Problèmes".
  - `css/app.css` : styles pour `.journal-day-score.negative` et `.journal-modal-summary.negative`.
  - Cache PWA incrémenté à `2026-10-02a` dans `sw.js` et `index.html`.

## v1 — base de données en service (17 septembre 2026)

**Projet Supabase dédié**, créé pour ce seul usage :

| | |
|---|---|
| Nom | `air-bartoli` |
| Référence | `dgsvpxeqwdyeudqubayd` |
| Région | `eu-west-3` (Paris) |
| Postgres | 17.6 |
| Coût | 0 €/mois |
| URL API | `https://dgsvpxeqwdyeudqubayd.supabase.co` |
| Identifiant de famille | `9a8a25c5-fb62-46d8-9a24-b017db399ae3` |

Le projet `quiz-famille` de la même organisation **n'a pas été touché**.

### Ce qui est déployé

| Élément | État |
|---|---|
| Migration `01-schema-v1` : 10 tables, 8 vues, 3 triggers | appliquée |
| Migration `02-functions-rls-v1` : 8 fonctions, RLS sur 10 tables | appliquée |
| `03-seed-v1` : 9 catégories racines, 26 sous-catégories, 5 niveaux, 10 récompenses | chargé |
| Migration `04-views-security-invoker` | appliquée |
| Migration `05-hardening` : `search_path`, retrait des droits `anon` | appliquée |
| Enfants Keyran et Rilès | créés, **dates de naissance à renseigner** |
| Recette fonctionnelle, 21 scénarios | tous verts, données de test supprimées |
| Analyseur de sécurité Supabase | aucune alerte, hors l'avertissement attendu sur les fonctions appelables par les comptes connectés (c'est l'API de l'application) |
| `js/config.js` | renseigné avec l'URL et la clé publiable |
| Front : `login`, `index`, `enfant`, `historique`, `dashboard`, `reglages` | écrit |
| `css/app.css`, modules `api/ui/nav/login/saisie/enfant/historique/dashboard/reglages` | écrits |
| Lectures du front rejouées sous l'identité réelle de Bruno | 14 requêtes, toutes passent la RLS |
| Cinématiques de points, PWA, navigation mobile et cinématiques | écrites et validées statiquement |
| Manifest, service worker et 4 icônes | écrits, version `2026-09-17c` |
| Comptes Névine et Bruno créés et confirmés | fait |
| Rattachement `parents` (`99-parents-bootstrap.sql`) | fait, session réelle vérifiée |

### Comptes

| Parent | Adresse | UID |
|---|---|---|
| Névine | `nevine.bartoli@gmail.com` | `5439b1ca-bf92-4338-870d-c38db1b060bf` |
| Bruno | `bruno.s.bartoli@gmail.com` | `e2893297-7536-489a-bf41-80c51bedd22d` |

Session réelle simulée pour Bruno : `auth_family_id()` renvoie bien la
famille, 2 enfants, 35 catégories, 10 récompenses et 2 soldes visibles, tous
à 0 point. La base est prête à recevoir le premier point.

### Ce qui reste à faire

1. **Déployer le contenu du dépôt sur GitHub Pages.** Le service worker et
   l'installation PWA ne fonctionnent pas depuis `file://`, il faut une URL
   HTTPS, typiquement GitHub Pages.
2. **Dates de naissance** des enfants, pour que `min_age` serve à quelque
   chose : `update children set birth_date = '...' where first_name = '...';`
3. **Publication** GitHub Pages : `Settings` → `Pages` → `main` / `(root)`.

### Base vide, volontairement

Aucune écriture dans `events` : le journal démarre au premier point donné par
un parent. Le compte technique de recette et toutes ses données ont été
supprimés.


## 18 septembre 2026 : seuils de cinématiques configurables

La table `cinematic_settings` a été ajoutée dans Supabase. Elle contient une ligne par famille avec les trois seuils `level_1_min`, `level_2_min` et `level_3_min`, initialisés à 1, 5 et 16. La RLS limite lecture et écriture aux parents de la famille.

La carte **Cinématiques de récompense** est disponible dans **Réglages**. Les seuils s’appliquent aux points positifs gagnés lors d’une seule saisie. Le cache PWA passe à `2026-09-18c`.


## 18 septembre 2026 : autonomie sur les catégories

La migration `07-category-autonomy.sql` ajoute la fonction `delete_category`. Depuis Réglages, les parents peuvent modifier, renommer et supprimer les grandes catégories comme les sous-catégories. Une catégorie jamais utilisée est supprimée physiquement. Une catégorie déjà présente dans le journal est désactivée et retirée des menus, afin de préserver l'historique append-only.

Les anciennes catégories dites système ne sont plus bloquées dans l'interface. Le bonus hebdomadaire n'échoue plus si la catégorie de régularité est renommée ou retirée.


## 18 septembre 2026 : journal calendrier et grilles mobiles

Le module `historique.js` a été refondu autour de deux vues : calendrier mensuel et Aujourd'hui. Les données sont chargées par plage via `getDailyRange` et `getEventsRange`. Le score affiché par jour est plafonné à zéro après gains et malus, tandis que les événements réels restent visibles dans le détail.

Dans `saisie.js`, les sélecteurs de moment et de grande catégorie sont des grilles tactiles, sans défilement horizontal. Le cache PWA passe à `2026-09-18c`.


## 19 septembre 2026 : avatars familiaux

Les avatars `avatar_Keyran.png`, `avatar_Rilès.png`, `avatar_Bruno.png` et `avatar_Névine.png` sont maintenant utilisés par le front dans la connexion, la barre haute, la saisie, l’écran Enfants, le Journal, l’Analyse et les Réglages. Le cache PWA passe à `2026-09-19a` et inclut les quatre images.
