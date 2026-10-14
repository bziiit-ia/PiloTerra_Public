-- =====================================================================
--  PILOTERRA — ÉTAPE 10 · Accent visuel par marché
--
--  Idempotent, rejouable. À exécuter en une fois dans l'éditeur SQL.
--  Ordre : après sql/etape9_redaction_seo_multi_marche.sql. Dev d'abord.
--
--  Le portail entier prend la palette du marché actif : le front calcule
--  onze nuances à partir de marches.couleur_accent (components/
--  paletteMarche.ts). Ce script ajoute la couleur SECONDAIRE, qui
--  remplace le brun doré de la marque là où il se confondrait avec la
--  couleur principale du marché.
--
--  Arbitrages du 30/09/2026 :
--    - vitrine et agriculture gardent le rendu actuel exact : la couleur
--      de marque #1b5e1f produit la palette historique, pas une palette
--      recalculée ;
--    - couleur secondaire par marché, en base ; vide = brun doré de la
--      marque (#a77a15). Logistique : bleu nuit, le brun doré étant
--      presque sa couleur principale (#a16207). Proposition À VALIDER ;
--    - les deux couleurs se modifient dans la console super admin
--      (onglet Marchés), avec aperçu et contrôle de lisibilité. La
--      politique marches_ecriture_admin couvre déjà l'écriture.
-- =====================================================================

begin;

alter table public.marches add column if not exists couleur_secondaire text;

comment on column public.marches.couleur_secondaire is
  'Couleur secondaire du marché (#rrggbb). Vide = brun doré de la marque PiloTerra (#a77a15).';

-- Format #rrggbb : la console refuse déjà une saisie invalide, la base
-- aussi. Les couleurs sont écrites en minuscules d'abord, pour que la
-- comparaison avec la couleur de marque soit fiable.
update public.marches set couleur_accent = lower(couleur_accent)
where couleur_accent <> lower(couleur_accent);

alter table public.marches drop constraint if exists marches_couleur_accent_format;
alter table public.marches add constraint marches_couleur_accent_format
  check (couleur_accent ~ '^#[0-9a-f]{6}$');

alter table public.marches drop constraint if exists marches_couleur_secondaire_format;
alter table public.marches add constraint marches_couleur_secondaire_format
  check (couleur_secondaire is null or couleur_secondaire ~ '^#[0-9a-f]{6}$');

-- Logistique : bleu nuit à la place du brun doré (proposition).
update public.marches set couleur_secondaire = '#1e40af'
where code = 'logistique' and couleur_secondaire is null;

commit;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
--  Vérification — une ligne par contrôle, colonne « ok » attendue à true
-- ---------------------------------------------------------------------

select controle, ok, detail from (
  select 1 as ordre, 'Colonne couleur_secondaire présente' as controle,
         count(*) = 1 as ok, 'marches.couleur_secondaire' as detail
  from information_schema.columns
  where table_schema = 'public' and table_name = 'marches' and column_name = 'couleur_secondaire'

  union all
  select 2, 'Couleurs principales au format #rrggbb',
         bool_and(couleur_accent ~ '^#[0-9a-f]{6}$'),
         string_agg(code || ' ' || couleur_accent, ' | ' order by ordre)
  from marches

  union all
  select 3, 'Couleur secondaire de la logistique',
         bool_and(couleur_secondaire is not null),
         string_agg(code || ' ' || coalesce(couleur_secondaire, 'marque'), ' | ')
  from marches where code = 'logistique'

  union all
  select 4, 'Agriculture sur la couleur de marque (rendu actuel)',
         bool_and(couleur_accent = '#1b5e1f' and couleur_secondaire is null),
         string_agg(couleur_accent || ' / ' || coalesce(couleur_secondaire, 'marque'), '')
  from marches where code = 'agriculture'
) v
order by ordre;
