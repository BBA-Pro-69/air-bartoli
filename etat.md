# État du déploiement — Air Bartoli / Keyrilès

À tenir à jour à chaque livraison. Une ligne par version, la plus récente en
haut.

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

La carte **Cinématiques de récompense** est disponible dans **Réglages**. Les seuils s’appliquent aux points positifs gagnés lors d’une seule saisie. Le cache PWA passe à `2026-09-18d`.


## 18 septembre 2026 : autonomie sur les catégories

La migration `07-category-autonomy.sql` ajoute la fonction `delete_category`. Depuis Réglages, les parents peuvent modifier, renommer et supprimer les grandes catégories comme les sous-catégories. Une catégorie jamais utilisée est supprimée physiquement. Une catégorie déjà présente dans le journal est désactivée et retirée des menus, afin de préserver l'historique append-only.

Les anciennes catégories dites système ne sont plus bloquées dans l'interface. Le bonus hebdomadaire n'échoue plus si la catégorie de régularité est renommée ou retirée.


## 18 septembre 2026 : journal calendrier et grilles mobiles

Le module `historique.js` a été refondu autour de deux vues : calendrier mensuel et Aujourd'hui. Les données sont chargées par plage via `getDailyRange` et `getEventsRange`. Le score affiché par jour est plafonné à zéro après gains et malus, tandis que les événements réels restent visibles dans le détail.

Dans `saisie.js`, les sélecteurs de moment et de grande catégorie sont des grilles tactiles, sans défilement horizontal. Le cache PWA passe à `2026-09-18d`.


## 18 septembre 2026 : score réel et boosters automatiques

La migration `08-automatic-boosters.sql` ajoute `booster_settings` et `booster_grants`, autorise le type d'événement `booster`, sépare les boosters de `v_daily`, et installe un trigger après chaque saisie. Les règles disponibles sont codées sur semaine calendaire et mois calendaire.

Une règle active possède un seuil entier et un coefficient numérique à une décimale. Dès que la somme des scores pédagogiques journaliers atteint le seuil, un booster séparé est créé une seule fois par enfant et par période. La formule est `ceil(score × coefficient) - score`. Les boosters et les dépenses ne participent pas au score pédagogique du jour.

La saisie affiche le résultat réel éventuellement négatif en gris et le score compté plafonné à zéro en grand.
