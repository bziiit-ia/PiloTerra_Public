-- =====================================================================
--  PILOTERRA — ÉTAPE 6 · Vitrine tri-marché
--
--  Idempotent, rejouable. À exécuter en une fois dans l'éditeur SQL.
--  Ordre : après sql/etape5d_profils_par_marche.sql. Dev d'abord.
--
--  Arbitrages du 17/09/2026 :
--    - accroche « Votre portail IA open source pour » + mot tournant
--      (l'agriculture / l'environnement / la logistique) dans la couleur du
--      marché ; un marché choisi affiche sa phrase fixe. Le mot vit dans
--      marches.mot_accroche, la phrase complète dans marches.baseline ;
--    - section « À qui est destiné ce portail IA ? » : publics par marché
--      rangés en base (marches.publics_intro + marches.publics).
--      Agriculture = texte actuel à l'identique ; environnement et
--      logistique = propositions de Claude, À VALIDER PAR PAUL.
--
--  Rejeu : aucune valeur modifiée à la main n'est écrasée. Les accroches
--  ne sont réécrites que si elles ont encore leur valeur d'origine, les
--  publics ne sont écrits que s'ils sont vides.
--
--  Format de marches.publics : tableau JSON d'objets
--    { "libelle": "…", "icone": "…" }
--  icone ∈ globe, batiment, groupe, personne, camion, entrepot, feuille,
--  goutte, recyclage, ancre, balance — traduit en pictogramme par le front
--  (repli : batiment).
-- =====================================================================

begin;

alter table public.marches add column if not exists mot_accroche text;
alter table public.marches add column if not exists publics_intro text;
alter table public.marches add column if not exists publics jsonb;

comment on column public.marches.mot_accroche is
  'Mot tournant de l''accroche vitrine (« l''agriculture »), complète « Votre portail IA open source pour ».';
comment on column public.marches.publics_intro is
  'Phrase d''introduction de la section « À qui est destiné ce portail IA ? ».';
comment on column public.marches.publics is
  'Publics visés, tableau JSON [{libelle, icone}], ordre d''affichage.';

-- ---------------------------------------------------------------------
--  1. Accroches
-- ---------------------------------------------------------------------

update public.marches set mot_accroche = 'l''agriculture'   where code = 'agriculture'   and mot_accroche is null;
update public.marches set mot_accroche = 'l''environnement' where code = 'environnement' and mot_accroche is null;
update public.marches set mot_accroche = 'la logistique'    where code = 'logistique'    and mot_accroche is null;

-- Phrase fixe d'un marché choisi, réécrite seulement si elle est encore
-- à sa valeur d'origine (étape 0).
update public.marches
set baseline = 'Votre portail IA open source pour ' || mot_accroche
where mot_accroche is not null
  and baseline in (
    'Votre portail IA agricole open source',
    'Votre portail IA environnement open source',
    'Votre portail IA logistique open source'
  );

-- ---------------------------------------------------------------------
--  2. Publics par marché
-- ---------------------------------------------------------------------

-- Agriculture : reprise exacte de la section actuelle
update public.marches
set publics_intro = 'Aux spécialistes du monde agricole.',
    publics = '[
      {"libelle": "Coopératives Agricoles", "icone": "globe"},
      {"libelle": "Chambres d''agriculture", "icone": "batiment"},
      {"libelle": "CUMA", "icone": "groupe"},
      {"libelle": "Fédérations", "icone": "personne"},
      {"libelle": "Cabinets comptables et centre de gestion", "icone": "batiment"}
    ]'::jsonb
where code = 'agriculture' and publics is null;

-- Environnement : proposition, à valider
update public.marches
set publics_intro = 'Aux acteurs de la transition environnementale.',
    publics = '[
      {"libelle": "Collectivités territoriales", "icone": "batiment"},
      {"libelle": "Syndicats de l''eau et des déchets", "icone": "goutte"},
      {"libelle": "Bureaux d''études environnement", "icone": "feuille"},
      {"libelle": "Éco-organismes et filières de recyclage", "icone": "recyclage"},
      {"libelle": "Associations et fédérations environnementales", "icone": "groupe"}
    ]'::jsonb
where code = 'environnement' and publics is null;

-- Logistique : proposition, à valider
update public.marches
set publics_intro = 'Aux professionnels du transport et de la supply chain.',
    publics = '[
      {"libelle": "Transporteurs routiers", "icone": "camion"},
      {"libelle": "Prestataires logistiques et entrepôts", "icone": "entrepot"},
      {"libelle": "Commissionnaires et transitaires", "icone": "globe"},
      {"libelle": "Ports et plateformes multimodales", "icone": "ancre"},
      {"libelle": "Fédérations professionnelles", "icone": "personne"}
    ]'::jsonb
where code = 'logistique' and publics is null;

commit;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
--  3. Vérification — une ligne par marché, colonnes « ok » attendues à true
-- ---------------------------------------------------------------------

select code,
       baseline,
       mot_accroche,
       baseline = 'Votre portail IA open source pour ' || mot_accroche as accroche_ok,
       jsonb_array_length(publics) as nb_publics,
       coalesce(jsonb_array_length(publics), 0) > 0 and publics_intro is not null as publics_ok,
       actif
from public.marches
order by ordre;
