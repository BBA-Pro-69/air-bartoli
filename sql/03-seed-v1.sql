-- =====================================================================
--  Famille Miles - donnees de depart (v1)
--  A executer APRES schema-v1.sql et functions-rls-v1.sql.
--  Tout ce fichier est MODIFIABLE depuis l'ecran Reglages ensuite.
--  Il n'est la que pour ne pas demarrer devant un ecran vide.
-- =====================================================================
--  CALIBRATION RETENUE : un enfant gagne environ 22 points par semaine.
--  Regle a tenir a chaque ajout de recompense :
--      prix = (semaines d'attente souhaitees) x 22
--  Une recompense a plus de 16 semaines d'attente n'existe pas pour un
--  enfant de 5 ans. Elle ne le motive pas, elle le decourage.
-- =====================================================================


do $$
declare
  v_family uuid;
  v_root   uuid;
begin
  -- 1. La famille et les enfants ------------------------------------
  insert into families (name) values ('Air Bartoli') returning id into v_family;

  insert into children (family_id, first_name, birth_date, color, weekly_goal, sort_order)
  values (v_family, 'Keyran', null, '#00A7E1', 22, 1),
         (v_family, 'Riles',  null, '#f59e0b', 22, 2);

  -- 2. Niveaux de statut ---------------------------------------------
  -- Les miles de statut ne se depensent JAMAIS. Un gros achat ne fait
  -- pas redescendre d'un niveau. C'est ce qui rend la depense indolore.
  insert into status_levels (family_id, label, min_points, perks, color, sort_order) values
    (v_family, 'Decollage', 0,    'Bienvenue a bord.', '#94a3b8', 1),
    (v_family, 'Bronze',    150,  'Choisit la musique dans la voiture.', '#b45309', 2),
    (v_family, 'Argent',    400,  'Choisit le film du samedi soir une fois par mois.', '#64748b', 3),
    (v_family, 'Or',        800,  'Se couche 15 minutes plus tard le vendredi.', '#eab308', 4),
    (v_family, 'Platine',   1500, 'Choisit une sortie du week-end par trimestre.', '#0369a1', 5);

  -- 3. Categories ------------------------------------------------------
  -- Six racines. Pas davantage : au-dela, la saisie du soir ne tient plus
  -- sur un ecran de telephone et l'outil est abandonne en trois semaines.

  -- 3.1 La journee
  insert into categories (family_id, label, kind, default_points, icon, color, sort_order)
  values (v_family, 'Journee', 'both', 3, 'calendar', '#0369a1', 1) returning id into v_root;
  insert into categories (family_id, parent_id, label, kind, default_points, max_per_day, sort_order) values
    (v_family, v_root, 'Journee sans ecole reussie', 'bonus', 3, 1, 1),
    (v_family, v_root, 'Journee d''ecole reussie',   'bonus', 3, 1, 2),
    (v_family, v_root, 'Demi-journee reussie',       'bonus', 1, 2, 3),
    (v_family, v_root, 'Journee difficile',          'malus', 2, 1, 4);

  -- 3.2 Ecole
  insert into categories (family_id, label, kind, default_points, icon, color, sort_order)
  values (v_family, 'Ecole', 'both', 2, 'school', '#00A7E1', 2) returning id into v_root;
  insert into categories (family_id, parent_id, label, kind, default_points, max_per_day, repairable, sort_order) values
    (v_family, v_root, 'Lecture / francais',          'bonus', 2, 2, false, 1),
    (v_family, v_root, 'Mathematiques',               'bonus', 2, 2, false, 2),
    (v_family, v_root, 'Devoirs faits sans rappel',   'bonus', 3, 1, false, 3),
    (v_family, v_root, 'Mot positif de la maitresse', 'bonus', 5, 1, false, 4),
    (v_family, v_root, 'Remarque de la maitresse',    'malus', 3, 1, true,  5);

  -- 3.3 Maison
  insert into categories (family_id, label, kind, default_points, icon, color, sort_order)
  values (v_family, 'Maison', 'both', 2, 'home', '#16a34a', 3) returning id into v_root;
  insert into categories (family_id, parent_id, label, kind, default_points, max_per_day, repairable, sort_order) values
    (v_family, v_root, 'Chambre rangee',              'bonus', 2, 1, false, 1),
    (v_family, v_root, 'Table mise ou debarrassee',   'bonus', 1, 2, false, 2),
    (v_family, v_root, 'Habille et pret a l''heure',  'bonus', 2, 1, false, 3),
    (v_family, v_root, 'Coucher sans negociation',    'bonus', 2, 1, false, 4),
    (v_family, v_root, 'Refus de ranger',             'malus', 2, 1, true,  5);

  -- 3.4 Fratrie
  insert into categories (family_id, label, kind, default_points, icon, color, sort_order)
  values (v_family, 'Fratrie', 'both', 3, 'users', '#8b5cf6', 4) returning id into v_root;
  insert into categories (family_id, parent_id, label, kind, default_points, max_per_day, repairable, sort_order) values
    (v_family, v_root, 'Aide ou console son frere', 'bonus', 3, 2, false, 1),
    (v_family, v_root, 'Partage spontanement',      'bonus', 2, 2, false, 2),
    (v_family, v_root, 'Dispute',                   'malus', 2, 2, true,  3),
    (v_family, v_root, 'Bagarre / coup',            'malus', 4, 1, true,  4);

  -- 3.5 Respect et ecoute
  insert into categories (family_id, label, kind, default_points, icon, color, sort_order)
  values (v_family, 'Respect', 'both', 2, 'ear', '#dc2626', 5) returning id into v_root;
  insert into categories (family_id, parent_id, label, kind, default_points, max_per_day, repairable, sort_order) values
    (v_family, v_root, 'Ecoute au premier rappel',   'bonus', 2, 2, false, 1),
    (v_family, v_root, 'Politesse remarquable',      'bonus', 2, 2, false, 2),
    (v_family, v_root, 'A fallu repeter trois fois', 'malus', 2, 2, true,  3),
    (v_family, v_root, 'Insolence / crie sur adulte','malus', 3, 1, true,  4);

  -- 3.6 Betises
  insert into categories (family_id, label, kind, default_points, icon, color, sort_order)
  values (v_family, 'Betise', 'malus', 3, 'alert', '#b91c1c', 6) returning id into v_root;
  insert into categories (family_id, parent_id, label, kind, default_points, max_per_day, repairable, sort_order) values
    (v_family, v_root, 'Degradation (mur, meuble, livre)', 'malus', 5, 1, true,  1),
    (v_family, v_root, 'Objet casse par imprudence',       'malus', 3, 1, true,  2),
    (v_family, v_root, 'Mensonge',                         'malus', 4, 1, false, 3),
    (v_family, v_root, 'Gaspillage / nourriture jetee',    'malus', 2, 1, true,  4);

  -- 3.7 Categories systeme (ne pas renommer : le code s'appuie dessus)
  insert into categories (family_id, label, kind, default_points, icon, color, sort_order) values
    (v_family, 'Exceptionnel', 'bonus', 5, 'star',   '#eab308', 7),
    (v_family, 'Regularite',   'bonus', 5, 'repeat', '#0ea5e9', 8),
    (v_family, 'Ajustement',   'both',  1, 'tool',   '#94a3b8', 9);

  -- 4. Catalogue de recompenses ---------------------------------------
  -- La colonne "attente" ci-dessous est indicative, a 22 points/semaine.
  insert into rewards (family_id, label, scope, cost, min_per_child, description, sort_order) values
    -- horizon court : indispensable pour le plus jeune (2 a 5 jours)
    (v_family, 'Une sucette a 16h',              'individual',  10, 0, 'Environ 3 jours.',  1),
    (v_family, 'Choisir le dessert du dimanche', 'individual',  15, 0, 'Environ 5 jours.',  2),
    (v_family, '15 minutes d''ecran en plus',    'individual',  20, 0, 'Environ 1 semaine.',3),
    -- horizon moyen (3 a 6 semaines)
    (v_family, 'Choisir le repas du samedi soir','individual',  40, 0, 'Environ 2 semaines.',4),
    (v_family, 'Un livre au choix (max 12 EUR)', 'individual',  60, 0, 'Environ 3 semaines.',5),
    (v_family, 'Soiree film en tete a tete',     'individual',  80, 0, 'Environ 4 semaines.',6),
    (v_family, 'Un jouet au choix (max 25 EUR)', 'individual', 130, 0, 'Environ 6 semaines.',7),
    -- collectif : la somme doit etre atteinte ET le minimum par enfant aussi
    (v_family, 'Cinema en famille',              'collective', 180, 70,  'Environ 4 semaines a deux.',  8),
    (v_family, 'Bowling ou laser game',          'collective', 220, 90,  'Environ 5 semaines a deux.',  9),
    (v_family, 'Journee a Walibi',               'collective', 350, 120, 'Environ 8 semaines a deux.', 10);

  raise notice 'Famille creee : %', v_family;
end $$;


-- ---------------------------------------------------------------------
-- ETAPE MANUELLE, apres avoir cree les comptes dans Authentication :
--   insert into parents (user_id, family_id, display_name, is_admin)
--   values ('<uuid du compte papa>',  '<family_id>', 'Papa',  true),
--          ('<uuid du compte maman>', '<family_id>', 'Maman', true);
-- Sans cette ligne, auth_family_id() renvoie null et l'application
-- affiche une page vide : c'est le symptome numero un au demarrage.
-- ---------------------------------------------------------------------
