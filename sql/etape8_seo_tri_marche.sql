-- =====================================================================
--  PILOTERRA — ÉTAPE 8 · SEO tri-marché
--
--  Idempotent, rejouable. À exécuter en une fois dans l'éditeur SQL.
--  Ordre : après sql/etape7_veille_par_marche.sql. Dev d'abord.
--
--  Deux apports :
--    1. la vue v_seo_pages expose le marché des contenus (colonne
--       marches), sans changer aucune colonne existante : le plugin SEO
--       peut classer les pages par marché ;
--    2. marches.seo_titre et marches.seo_intro : le titre et le chapô de
--       la page d'atterrissage de chaque marché.
--
--  Arbitrages du 23/09/2026 :
--    - URL en /<marche> puis /<marche>/<rubrique> : aucune URL existante
--      ne bouge, et pas de collision possible avec un slug de fiche ;
--    - un contenu transverse (marches vide) apparaît sur les trois pages
--      de marché, comme dans le portail. Sa fiche reste unique, donc pas
--      de contenu dupliqué pour Google ;
--    - une page de marché n'est générée que si le marché est actif et
--      compte au moins 3 contenus indexables : une page vide est
--      pénalisée. Le seuil et marches.actif pilotent l'ouverture groupée,
--      sans toucher au code.
--
--  Les textes seo_titre / seo_intro sont des propositions, À VALIDER.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
--  1. Textes d'atterrissage par marché
-- ---------------------------------------------------------------------

alter table public.marches add column if not exists seo_titre text;
alter table public.marches add column if not exists seo_intro text;

comment on column public.marches.seo_titre is
  'Titre de la page d''atterrissage SEO du marché (/<code>). Doit tenir en 65 caractères.';
comment on column public.marches.seo_intro is
  'Chapô de la page d''atterrissage SEO du marché, repris en meta description (160 caractères utiles).';

update public.marches set
  seo_titre = 'IA pour l''agriculture : outils, prompts et formations',
  seo_intro = 'Agents IA, prompts métier, sources de données ouvertes et formations pour les coopératives agricoles, les chambres d''agriculture et leurs partenaires. Open source, dans une approche frugale.'
where code = 'agriculture' and seo_titre is null;

update public.marches set
  seo_titre = 'IA pour l''environnement : outils, prompts et formations',
  seo_intro = 'Agents IA, prompts métier, sources de données ouvertes et formations pour les collectivités, les syndicats de l''eau et des déchets et les bureaux d''études. Open source, dans une approche frugale.'
where code = 'environnement' and seo_titre is null;

update public.marches set
  seo_titre = 'IA pour la logistique : outils, prompts et formations',
  seo_intro = 'Agents IA, prompts métier, sources de données ouvertes et formations pour les transporteurs, les prestataires logistiques et les plateformes multimodales. Open source, dans une approche frugale.'
where code = 'logistique' and seo_titre is null;

-- ---------------------------------------------------------------------
--  2. v_seo_pages : ajout du marché
--     Colonne ajoutée EN FIN de vue : create or replace l'accepte, et
--     rien de ce que lit déjà le plugin ne change de place.
--     marches vide = contenu transverse, visible sur les trois marchés.
-- ---------------------------------------------------------------------

create or replace view public.v_seo_pages as
 select 'agent'::text as source_type,
    r.id,
    'agents'::text as rubrique,
    '/agents/'::text || r.slug as url_path,
    r.slug,
    coalesce(nullif(r.seo_title, ''::text), r.title) as seo_title,
    coalesce(nullif(r.seo_description, ''::text), r.description) as seo_description,
    r.title as titre,
    r.description as description_courte,
    r.contenu_long,
    r.image_url,
    r.external_link,
    coalesce(r.seo_updated_at, r.created_at) as lastmod,
    coalesce(r.metadata, '{}'::jsonb) as extra,
    coalesce(r.marches, '{}'::text[]) as marches
   from piloterra_resources r
  where r.type = 'agent'::text and r.published is true and r.seo_indexable is true and r.slug is not null
union all
 select 'formation'::text as source_type,
    r.id,
    'formations'::text as rubrique,
    '/formations/'::text || r.slug as url_path,
    r.slug,
    coalesce(nullif(r.seo_title, ''::text), r.title) as seo_title,
    coalesce(nullif(r.seo_description, ''::text), r.description) as seo_description,
    r.title as titre,
    r.description as description_courte,
    r.contenu_long,
    r.image_url,
    r.external_link,
    coalesce(r.seo_updated_at, r.created_at) as lastmod,
    coalesce(r.metadata, '{}'::jsonb) as extra,
    coalesce(r.marches, '{}'::text[]) as marches
   from piloterra_resources r
  where r.type = 'learning'::text and r.published is true and r.seo_indexable is true and r.slug is not null
union all
 select 'source_donnees'::text as source_type,
    r.id,
    'sources-de-donnees'::text as rubrique,
    '/sources-de-donnees/'::text || r.slug as url_path,
    r.slug,
    coalesce(nullif(r.seo_title, ''::text), r.title) as seo_title,
    coalesce(nullif(r.seo_description, ''::text), r.description) as seo_description,
    r.title as titre,
    r.description as description_courte,
    r.contenu_long,
    r.image_url,
    r.external_link,
    coalesce(r.seo_updated_at, r.created_at) as lastmod,
    coalesce(r.metadata, '{}'::jsonb) as extra,
    coalesce(r.marches, '{}'::text[]) as marches
   from piloterra_resources r
  where r.type = 'data'::text and r.published is true and r.seo_indexable is true and r.slug is not null
union all
 select 'prompt'::text as source_type,
    p.id,
    'prompts'::text as rubrique,
    '/prompts/'::text || p.slug as url_path,
    p.slug,
    coalesce(nullif(p.seo_title, ''::text), p.title) as seo_title,
    coalesce(nullif(p.seo_description, ''::text), p.description) as seo_description,
    p.title as titre,
    p.description as description_courte,
    p.contenu_long,
    null::text as image_url,
    null::text as external_link,
    coalesce(p.seo_updated_at, p.updated_at, p.created_at) as lastmod,
    jsonb_build_object(
      'category', p.category,
      'target_tool', p.target_tool,
      'tags', p.tags,
      'recommended_model', p.recommended_model,
      'frugality_level', p.frugality_level,
      'frugality_tip', p.frugality_tip,
      'content', p.content) as extra,
    coalesce(p.marches, '{}'::text[]) as marches
   from prompts p
  where p.visibility = 'public'::text and p.status = 'published'::text
    and p.moderation_status = 'approved'::text and p.seo_indexable is true and p.slug is not null;

commit;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
--  3. Vérification
--     Les deux premières lignes contrôlent la mécanique ; la troisième
--     montre ce que le plugin SEO générera réellement, marché par marché
--     (transverses compris). Un marché sous 3 contenus n'aura pas de page.
-- ---------------------------------------------------------------------

select controle, ok, detail from (
  select 1 as ordre, 'Textes d''atterrissage sur les 3 marchés' as controle,
         count(*) = 3 as ok,
         string_agg(code, ', ' order by ordre) as detail
  from marches where seo_titre is not null and seo_intro is not null

  union all
  select 2, 'v_seo_pages expose la colonne marches',
         count(*) = 1, 'colonne marches'
  from information_schema.columns
  where table_schema = 'public' and table_name = 'v_seo_pages' and column_name = 'marches'
) v
order by ordre;

-- Le plugin écarte en plus les contenus sans contenu_long : une fiche sans
-- couche éditoriale ne produit pas de page. On applique le même filtre,
-- sinon le compte annoncé ici serait plus optimiste que la réalité.
with pages as (
  select * from v_seo_pages
  where contenu_long is not null and btrim(contenu_long) <> ''
)
select m.code,
       m.actif,
       count(p.*) filter (where p.marches = '{}'::text[] or m.code = any (p.marches)) as contenus_page_marche,
       count(p.*) filter (where m.code = any (p.marches))                              as dont_marques,
       count(p.*) filter (where p.marches = '{}'::text[] or m.code = any (p.marches)) >= 3
         and m.actif as page_generee
from marches m
left join pages p on true
group by m.code, m.actif, m.ordre
order by m.ordre;
