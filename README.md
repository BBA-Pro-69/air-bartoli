# Air Bartoli — programme de fidélité **Keyrilès**

Système de points familial pour Keyran (7 ans) et Rilès (5 ans et demi),
calqué sur un programme de miles aérien : on **gagne** des points au quotidien, on en
**perd** parfois, on les **échange** contre des récompenses choisies à
l'avance, et on progresse dans des **niveaux qui ne se perdent jamais**.

L'objectif n'est pas de noter les enfants. Il est de remplacer la négociation
et les cris par un cadre écrit, prévisible et consultable, dont les enfants
deviennent les pilotes.

## Nature technique

Site **100 % statique** : HTML, CSS et JavaScript vanilla, servi par GitHub
Pages. Aucun build, aucun bundler, aucun framework, aucune dépendance npm. Les
fichiers du dépôt sont exactement ceux servis au navigateur. Seule exception :
`supabase-js`, chargé depuis un CDN en module ES.

Base de données : **Supabase** (PostgreSQL managé, région Europe).

C'est la même architecture que `Santiago-performances`, volontairement : elle
est maîtrisée, elle s'ouvre en deux secondes sur un téléphone, et elle ne
demande aucune maintenance de chaîne de build.

## Arborescence

```
Air-Bartoli/
├── index.html               saisie rapide (page d'entrée des parents)
├── enfant.html              écran enfant : jauge, niveau, catalogue
├── historique.html          journal des écritures, annulation, réparation
├── dashboard.html           analyse : où se gagnent et où se perdent les points
├── reglages.html            enfants, catégories, barème, catalogue, jours spéciaux
├── login.html               connexion e-mail / mot de passe
├── robots.txt               interdiction d'indexation
├── sql/
│   ├── 01-schema-v1.sql        tables, vues, index
│   ├── 02-functions-rls-v1.sql fonctions métier et Row Level Security
│   ├── 03-seed-v1.sql          catégories, niveaux et catalogue de départ
│   ├── 04-views-security-invoker.sql  les vues respectent la RLS
│   ├── 05-hardening.sql        search_path et retrait des droits du rôle anon
│   ├── 06-cinematic-settings.sql seuils des effets, par famille
│   └── 99-parents-bootstrap.sql rattachement des comptes parents
├── Info IA/
│   ├── handover.md          architecture, décisions, pièges (source unique)
│   ├── etat.md              ce qui est déployé — à tenir à jour
│   └── agent/
│       └── instructions.md  instructions de l'agent Dust du projet
├── css/
│   └── app.css              feuille unique, variables CSS dans :root
├── assets/
│   ├── icon-192.png         icône PWA
│   ├── icon-512.png         icône PWA haute résolution
│   ├── icon-maskable-512.png icône Android maskable
│   └── apple-touch-icon-180.png
├── manifest.webmanifest     installation comme application
├── sw.js                    cache de l'interface, versionné
├── .nojekyll                publication GitHub Pages sans Jekyll
├── js/
│   ├── config.js            URL et clé publiable du projet Supabase
│   ├── api.js               client Supabase, auth, appels RPC, dates
│   ├── ui.js                helpers d'affichage, toasts, graphiques SVG
│   ├── cinematics.js        paliers, confettis canvas, file d'animations
│   ├── pwa.js               installation, service worker, aide iOS/Android
│   ├── saisie.js            logique de la saisie rapide
│   ├── enfant.js            écran enfant
│   ├── historique.js        journal et corrections
│   ├── dashboard.js         analyses
│   └── reglages.js          paramétrage
```

## État de la mise en service

| Étape | État |
|---|---|
| Projet Supabase `air-bartoli` (`dgsvpxeqwdyeudqubayd`), région Paris | **fait** |
| Migrations 01 à 06 appliquées | **fait** |
| Catégories, niveaux et catalogue chargés | **fait** |
| Recette fonctionnelle, 21 scénarios | **fait, tous verts** |
| `js/config.js` renseigné | **fait** |
| Comptes Névine et Bruno + rattachement `parents` | **fait** |
| Front : 6 pages, `css/app.css`, 11 modules JS | **fait** |
| Publication GitHub Pages | à faire |

Il ne reste que la publication : `Settings` → `Pages` → `Deploy from a
branch` → `main` / `(root)`. L'application est utilisable immédiatement après.

## Une seule page, cinq écrans

Depuis la v3, l'application n'est plus un site à six pages mais **une
coquille applicative** : `index.html` contient cinq vues, une seule visible à
la fois, exactement comme le mode application de `Chicago-Bruno-Chris`.

| Vue | À quoi elle sert |
|---|---|
| Saisie | la vue du soir : enfant, moment, tuile. Deux appuis |
| Enfants | solde, niveau, catalogue, comptes à rebours |
| Journal | l'historique, avec annulation et réparation |
| Analyse | où se gagnent et où se perdent les points |
| Réglages | enfants, catégories, barème, catalogue, jours spéciaux |

On passe d'un écran à l'autre de trois façons :

1. **en glissant le doigt** horizontalement, comme dans une application ;
2. par la **barre basse** dans la zone du pouce ;
3. par la **feuille de menu**, qui contient aussi Réglages, Installation,
   Recherche de mise à jour et Déconnexion.

`login.html` reste une page séparée : c'est la porte d'entrée, avant la
coquille. Les anciennes adresses `enfant.html`, `historique.html`,
`dashboard.html` et `reglages.html` sont conservées comme simples
redirections vers l'onglet correspondant.

## Les deux bandeaux, repris de Chicago

| Bandeau | Quand il apparaît | Ce qu'il propose |
|---|---|---|
| `#installBanner` | tant que l'application n'est pas installée | bouton **Installer**, et une croix qui le met en veille 7 jours |
| `#swBanner` | dès qu'une nouvelle version est déployée | bouton **Mettre à jour**, qui active la nouvelle version et recharge |

La détection de mise à jour est automatique : au démarrage, à chaque retour
sur l'application, et manuellement depuis **Menu → Rechercher une mise à
jour**. C'est le `service worker` qui signale la version en attente, et le
bouton lui envoie `air-bartoli-skip-waiting`.

### Ce que fait la saisie, et ce qu'elle ne fait pas

Pas de bouton « valider » : l'appui sur une tuile écrit immédiatement, et un
bandeau laisse **dix secondes pour revenir en arrière**. Passé ce délai,
l'annulation reste possible depuis l'historique, mais elle devient une
écriture visible. C'est volontaire : au-delà de dix secondes, ce n'est plus
une faute de frappe, c'est un changement d'avis, et un changement d'avis se
montre.

Le moment de la journée est présélectionné d'après l'heure de Paris. La date
est modifiable pour rattraper une soirée oubliée, jamais vers le futur.

La case « ajouter une note » transforme l'appui en petite fenêtre. Les
catégories à points libres (`Exceptionnel`, `Régularité`) l'ouvrent toujours.


## Mode application et responsive mobile

Air Bartoli est maintenant une **PWA installable** depuis la première page :

- `manifest.webmanifest` décrit l'application, son icône, ses raccourcis et
  son affichage autonome ;
- `sw.js` met en cache l'interface et les icônes dès la première visite ;
- les appels Supabase ne sont volontairement jamais mis en cache, pour qu'un
  solde périmé ne soit jamais présenté comme actuel ;
- Android affiche le bouton « Installer l'application » quand le navigateur
  rend l'installation disponible ;
- sur iPhone et iPad, le bouton explique le geste « Partager → Sur l'écran
  d'accueil » ;
- sous 760 px, la navigation passe en barre basse au pouce avec quatre accès
  directs et un menu coulissant, selon le principe de `Chicago-Bruno-Chris`.

La version du cache est `2026-09-18a`. À chaque livraison front, incrémenter
la constante `VERSION` dans `sw.js` et le paramètre `?v=` du manifeste dans les
pages HTML. Sinon un téléphone déjà installé peut conserver l'ancienne
interface.

## Cinématiques de points

Chaque ajout positif déclenche une cinématique à partir du **nombre réellement
retourné par Supabase**, jamais à partir d'un barème recopié dans le front :

| Palier | Points ajoutés | Effet |
|---|---:|---|
| 1 | seuil 1 à seuil 2 - 1 | tuile qui pulse et « +X point(s) » |
| 2 | seuil 2 à seuil 3 - 1 | pulse plus marqué, particules bleu/vert |
| 3 | seuil 3 et plus | message central, confettis canvas et trois salves latérales |

Les animations sont mises en file : quatre saisies rapides produisent une
célébration cumulée plutôt que quatre feux d'artifice superposés. Les malus ne
déclenchent pas de fête, ils ont seulement un retour visuel bref. Le mode
`prefers-reduced-motion` désactive les particules et les grands mouvements.

Les seuils sont réglables depuis Réglages, stockés dans Supabase par famille, et s’appliquent aux points gagnés lors d’une seule saisie. Les valeurs par défaut restent 1, 5 et 16. La logique est isolée dans `js/cinematics.js`, de la même façon que
`Santiago-performances` isole sa couche UX dans `js/saisie-ux.js`. Cela permet
de modifier l'intensité des effets sans toucher au métier ni aux appels
Supabase.

## Les deux compteurs, cœur du système

C'est la seule idée à comprendre avant de lire le reste.

| Compteur | Ce que c'est | Se dépense ? |
|---|---|---|
| **Solde** | les points disponibles, affichés en gros sur l'écran enfant | oui |
| **Miles de statut** | tous les points gagnés depuis le début, cumulés à vie | **jamais** |

Les miles de statut déterminent le **niveau** (Décollage, Bronze, Argent, Or,
Platine), et le niveau ouvre des privilèges non monétaires : choisir la musique
dans la voiture, le film du samedi, se coucher un quart d'heure plus tard.

Pourquoi c'est structurant : le jour où un enfant lâche 350 points pour Walibi,
son solde s'effondre mais **son niveau ne bouge pas**. Sans cette séparation,
chaque grosse dépense est vécue comme un retour à la case départ, et le système
s'éteint après la première récompense. C'est exactement ce que font les
compagnies aériennes, et c'est pour cette raison qu'elles le font.

Techniquement : `v_child_balance` somme tous les événements, `v_child_status`
ne somme que les positifs. Un débit d'échange porte `counts_status = false`.

## Le barème

Un point par action, figé au moment de la saisie. Un ordre de grandeur :

| Action | Points |
|---|---|
| Journée réussie (école ou non) | 3 |
| Devoirs faits sans rappel | 3 |
| Aide ou console son frère | 3 |
| Mot positif de la maîtresse | 5 |
| Geste exceptionnel | 5 et plus, à la main |
| Bonus de régularité (5 jours sur 7) | 5 |
| Il a fallu répéter trois fois | −2 |
| Dispute | −2 |
| Bagarre, coup | −4 |
| A écrit sur le mur | −5 |

Soit environ **22 points par semaine** pour un enfant. Ce chiffre est la mesure
étalon de tout le reste.

> **Règle de calibration, à ne jamais contourner :**
> `prix d'une récompense = (semaines d'attente souhaitées) × 22`

L'écran de création d'une récompense affiche ce calcul en direct. Au-delà de
16 semaines d'attente, une récompense ne motive plus un enfant de cinq ans,
elle le décourage : l'outil affiche un avertissement.

### Les points sont gravés, pas recalculés

Différence assumée avec `Santiago-performances`, où le score est recalculé par
la vue `v_daily_kpi` et où changer une pondération change l'historique.

Ici, le nombre de points est **stocké sur l'événement**. Si le barème d'une
bêtise passe de 2 à 3 points en novembre, les écritures d'octobre ne bougent
pas. Un enfant qui verrait son solde changer pendant la nuit perdrait toute
confiance dans le système, et le système ne vaut que par la confiance qu'on lui
accorde.

### Le journal est en ajout seul

`events` n'accepte ni `UPDATE` ni `DELETE`, la RLS l'interdit. Une erreur de
saisie se corrige par une **écriture inverse** (`reverse_event`), visible dans
l'historique. On ne réécrit pas le passé, on le corrige au vu de tous. C'est la
même logique qu'un livre de comptes, et cela coupe court à toute contestation.

## Les cinq garde-fous sur le malus

Le retrait de points est le mécanisme le plus dangereux du dispositif : une
perte est ressentie deux à trois fois plus fort qu'un gain de même taille, et
un enfant dans le rouge décroche complètement.

1. **Le solde ne descend jamais sous zéro.** `add_event` écrête : si le malus
   dépasse le solde, il est ramené à ce qui reste. L'écriture est quand même
   enregistrée, à zéro point, avec la mention, pour que l'analyse reste juste.
2. **Un plafond d'occurrences par jour** sur chaque catégorie
   (`max_per_day`) : une même bêtise ne peut pas être saisie cinq fois dans la
   même soirée.
3. **La réparation** : les catégories marquées `repairable` permettent de
   récupérer la moitié du malus quand l'enfant répare (nettoyer le mur,
   s'excuser sincèrement, ranger ce qu'il a renversé). Le système n'apprend
   pas à ne pas se faire prendre, il apprend à réparer.
4. **Un jour spécial ne double jamais un malus**, uniquement les gains.
   Doubler une punition un jour de fête tue l'idée même de jour spécial.
5. **Jamais de saisie pendant la crise.** Celle-là, aucune ligne de code ne
   peut la garantir : le malus se saisit après, à froid. Une application
   dégainée au milieu d'une dispute devient une arme dans la dispute au lieu
   d'en être la sortie.

## Les récompenses collectives

Une sortie familiale a **deux conditions simultanées**, vérifiées par
`approve_redemption` :

- le **total** est atteint (par exemple 350 points pour Walibi) ;
- **et chaque enfant atteint le minimum individuel** (120 points).

La seconde condition est la seule qui compte vraiment : sans elle, un aîné à
600 points paie la sortie pour un cadet à 100, le cadet n'apprend rien et
l'aîné le vit comme un vol. Le message est explicite quand le minimum n'est pas
atteint, et il nomme l'enfant concerné.

## Ce que l'écran enfant affiche, et ce qu'il n'affiche pas

Il affiche : le solde en très gros, le niveau et la distance au niveau suivant,
le catalogue avec une jauge par récompense, et surtout, sous chaque récompense,
**« à ton rythme actuel, c'est dans 11 jours »**.

Ce compte à rebours est la fonctionnalité la plus importante du projet. Il est
calculé par `v_reward_eligibility` à partir du rythme des 28 derniers jours.
C'est lui qui rend un objectif à 350 points tenable pour un enfant de cinq ans,
parce qu'il transforme un nombre abstrait en une durée qu'il sait se
représenter.

Il n'affiche **pas** de classement entre les deux enfants. Il y a dix-huit mois
d'écart : le plus jeune perdrait structurellement, et on fabriquerait de la
rivalité là où on cherche de la coopération. Chaque enfant se compare à
lui-même, à sa moyenne des quatre dernières semaines. Le seul chiffre commun
est la cagnotte collective.

## Le dashboard parents

Une question, une réponse : **où se gagnent et où se perdent les points ?**

- Répartition des gains et des pertes par catégorie racine, puis par
  sous-catégorie au clic.
- **Répartition par moment de la journée** (matin, école, midi, goûter, soir).
  C'est le champ `day_part` de chaque écriture, et c'est ce qui permet la
  phrase « tu as tendance à moins écouter en fin de journée » plutôt que
  « tu n'écoutes jamais ».
- Tendance semaine par semaine, par enfant, sur son propre historique.
- Effet des réparations : combien de malus ont été réparés, sur quelles
  catégories.

Toutes ces vues sont alimentées par `v_category_profile` et `v_daily`.

## Code couleur

- **Gains** : camaïeu de bleu Fluxym (`#00A7E1`, `#0369a1`, `#0B2046`)
- **Pertes** : rouge (`#dc2626`), utilisé avec parcimonie et jamais en aplat
  plein sur l'écran enfant
- **Réparations** : vert (`#16a34a`), pour qu'une réparation se voie autant
  qu'une bêtise
- **Une couleur par enfant** sur les graphiques comparatifs, jamais une couleur
  par « bon » ou « mauvais »

## Comportements à connaître

- **Aucun bouton valider.** Une tuile de catégorie appuyée écrit immédiatement,
  via la fonction `add_event`. Un bandeau d'annulation reste 10 secondes.
- **Aucune écriture directe dans `events` depuis le front** : tout passe par
  les fonctions `security definer`. Un `insert` direct sera refusé par la RLS,
  c'est voulu.
- **Dates en heure locale Europe/Paris**, jamais en UTC : une saisie à 23 h ne
  doit pas tomber sur la veille.
- **Pas de saisie dans le futur**, contrainte au niveau de la base.
- **Le bonus de régularité** n'est pas automatique : il s'accorde par un appel
  à `grant_weekly_streak`, depuis les réglages ou par un `pg_cron` hebdomadaire.
- **Les catégories `Exceptionnel`, `Régularité` et `Ajustement` ne se
  renomment pas** : le code s'appuie sur leur libellé.

## Sur la clé publiable dans un dépôt public

Fonctionnement normal de Supabase : la clé publiable ne donne aucun droit par
elle-même. Trois barrières se superposent :

1. la **Row Level Security**, active sur les dix tables, qui filtre tout sur
   `family_id = auth_family_id()` ;
2. les **vues en `security_invoker`** : sans cette option, une vue s'exécute
   avec les droits de son propriétaire et contourne la RLS, ce qui exposerait
   les soldes de toutes les familles ;
3. le **retrait des droits du rôle `anon`** sur les fonctions métier, que
   PostgREST expose automatiquement en `/rest/v1/rpc/`.

Conséquence directe : **ne jamais désactiver la RLS**, même « juste pour
tester », et **ne jamais créer une vue sans `security_invoker`**.

## Recette, exécutée le 17 septembre 2026

21 scénarios joués sur la base réelle avec un compte technique, supprimé
depuis. Tous verts :

| Vérifié | Résultat |
|---|---|
| Gain simple, plafond journalier, occurrences multiples | conformes |
| Malus sur solde nul | écrêté à 0, écriture conservée avec mention |
| Malus sur solde partiel | écrêté au solde disponible |
| Malus saisi en positif | ramené au négatif par le sens de la catégorie |
| Réparation à 50 % | moitié rendue, arrondie au supérieur |
| Jour spécial ×2 | double les gains, **pas** les malus |
| Contrepassation, puis double contrepassation | la seconde est refusée |
| Échange individuel | solde débité, **miles de statut inchangés** |
| Sortie collective, minimum par enfant | refusée en nommant le manquant |
| Parts qui ne font pas le prix | refusées |
| Saisie dans le futur | refusée |
| `insert`, `update`, `delete` directs sur `events` | refusés |
| Rôle `anon` sur `events` | 0 ligne visible |
| Création d'une sous-sous-catégorie | refusée |


## Réglage des cinématiques

Dans le menu **Réglages**, la carte **Cinématiques de récompense** permet de choisir les trois seuils : retour discret, pluie de particules et feu d’artifice. Les valeurs doivent être des entiers strictement croissants. Le réglage est enregistré dans `cinematic_settings`, une ligne par famille, avec RLS. Il est donc partagé entre les téléphones de Bruno et Névine.

Les seuils portent sur le nombre de points positifs réellement retournés par une saisie. Un malus ne déclenche jamais de célébration.
