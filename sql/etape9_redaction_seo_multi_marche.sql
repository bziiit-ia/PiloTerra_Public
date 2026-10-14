-- =====================================================================
--  PILOTERRA — ÉTAPE 9 · Rédaction SEO multi-marché
--
--  Idempotent, rejouable. À exécuter en une fois dans l'éditeur SQL.
--  Ordre : après sql/etape8_seo_tri_marche.sql. Dev d'abord.
--
--  Les quatre scénarios n8n de rédaction SEO (agents, formations, prompts,
--  sources de données) rédigent contenu_long, seo_title et seo_description
--  en brouillon. Ils étaient écrits pour les seules coopératives agricoles,
--  lisaient et écrivaient par un accès Postgres direct, et ignoraient le
--  marché du contenu.
--
--  Ce script leur donne un contrat stable, sur le modèle de la veille :
--    - marches.seo_redaction : les mots propres à chaque marché, insérés
--      dans la consigne de rédaction (public, lecteur, type de structure,
--      contexte métier) ;
--    - seo_consigne_marche(marches) : choisit ces mots selon le marché du
--      contenu — un seul marché : les siens ; transverse ou plusieurs
--      marchés : une version neutre, sans ancrage sectoriel ;
--    - seo_a_rediger(rubrique) et seo_enregistrer_brouillon(...) : lecture
--      et écriture, réservées au service role. Plus d'accès Postgres direct.
--
--  Arbitrages du 29/09/2026 :
--    - un seul scénario par type de contenu, qui traite les trois marchés ;
--    - seuls les contenus QUALIFIÉS (marche_qualifie_le renseigné) sont
--      rédigés : un texte neutre écrit avant qualification resterait figé ;
--    - le slug est déjà posé par les triggers trg_slug_piloterra_resources
--      et trg_slug_prompts (à la création comme à la modification) : rien
--      à ajouter ici, le contrôle 6 vérifie leur présence ;
--    - pas de réécriture automatique quand le marché d'un contenu change :
--      vider contenu_long suffit à relancer la rédaction au passage suivant.
--
--  Agriculture reprend les mots des consignes actuelles, à l'accentuation
--  près. Environnement et logistique sont des propositions, À VALIDER PAR
--  PAUL.
--
--  Contrainte d'écriture : organisation_courte commence par « un » ou
--  « une » — la consigne l'emploie après une élision (« Ce qu'une
--  coopérative peut en faire »).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
--  1. Les mots de chaque marché
-- ---------------------------------------------------------------------

alter table public.marches add column if not exists seo_redaction jsonb;

comment on column public.marches.seo_redaction is
  'Mots insérés dans les consignes n8n de rédaction SEO : public, organisation, organisation_courte (commence par un/une), lecteur, lecteur_formation, univers, adjectif (féminin), contexte (facultatif).';

update public.marches set seo_redaction = jsonb_build_object(
  'public',              'aux coopératives agricoles françaises',
  'organisation',        'une coopérative agricole',
  'organisation_courte', 'une coopérative',
  'lecteur',             'un salarié de coopérative agricole',
  'lecteur_formation',   'un salarié ou un dirigeant de coopérative agricole',
  'univers',             'le monde agricole',
  'adjectif',            'agricole',
  'contexte',            null
)
where code = 'agriculture' and seo_redaction is null;

update public.marches set seo_redaction = jsonb_build_object(
  'public',              'aux acteurs français de l''environnement : collectivités, syndicats de l''eau et des déchets, bureaux d''études',
  'organisation',        'une collectivité ou une structure de l''environnement',
  'organisation_courte', 'une collectivité ou un syndicat',
  'lecteur',             'un agent de collectivité ou un technicien de l''environnement',
  'lecteur_formation',   'un agent, un technicien ou un responsable de collectivité, de syndicat ou de bureau d''études',
  'univers',             'les métiers de l''environnement',
  'adjectif',            'environnementale',
  'contexte',            'Les lecteurs travaillent dans l''eau et l''assainissement, les déchets et le recyclage, la qualité de l''air, la biodiversité, l''énergie et le climat. Leurs employeurs sont surtout publics ou parapublics : les exemples tiennent compte des obligations réglementaires, de la commande publique et du lien avec les élus et les usagers. L''empreinte environnementale de l''IA elle-même n''est pas le sujet, sauf si le contenu en parle.'
)
where code = 'environnement' and seo_redaction is null;

update public.marches set seo_redaction = jsonb_build_object(
  'public',              'aux professionnels français du transport et de la logistique',
  'organisation',        'une entreprise de transport ou de logistique',
  'organisation_courte', 'une entreprise logistique',
  'lecteur',             'un exploitant, un planificateur ou un responsable d''entrepôt',
  'lecteur_formation',   'un salarié ou un dirigeant d''entreprise de transport ou de logistique',
  'univers',             'le transport et la logistique',
  'adjectif',            'logistique',
  'contexte',            'Les lecteurs travaillent chez des transporteurs routiers, des prestataires logistiques, des commissionnaires et sur des plateformes multimodales : exploitation et planification des tournées, entrepôt et préparation de commandes, suivi des expéditions et relation client, documents de transport et douane. Il s''agit du transport de marchandises : le transport de voyageurs est hors sujet.'
)
where code = 'logistique' and seo_redaction is null;

-- ---------------------------------------------------------------------
--  2. Choix des mots selon le marché du contenu
--     - un seul marché doté de seo_redaction : ses mots ;
--     - sinon (transverse, plusieurs marchés, marché pas encore rédigé) :
--       version neutre, qui nomme les secteurs concernés sans en
--       privilégier aucun. Transverse = tous les marchés actifs : la
--       version neutre suit l'ajout d'un marché sans reprise.
-- ---------------------------------------------------------------------

create or replace function public.seo_consigne_marche(p_marches text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_marches   text[] := coalesce(p_marches, '{}');
  v_mots      jsonb;
  v_libelles  text[];
  v_accroches text[];
  v_liste     text;
  v_domaines  text;
  n           int;
begin
  -- Un seul marché, avec ses mots : cas courant
  if cardinality(v_marches) = 1 then
    select m.seo_redaction
             || jsonb_build_object('mode', 'marche', 'marches_libelle', m.libelle)
      into v_mots
    from marches m
    where m.code = v_marches[1] and m.seo_redaction is not null;

    if v_mots is not null then
      return v_mots;
    end if;
  end if;

  -- Version neutre : secteurs concernés, dans l'ordre du référentiel
  select array_agg(lower(m.libelle) order by m.ordre),
         array_agg('de ' || coalesce(m.mot_accroche, lower(m.libelle)) order by m.ordre)
    into v_libelles, v_accroches
  from marches m
  where (cardinality(v_marches) = 0 and m.actif)
     or m.code = any (v_marches);

  n := coalesce(cardinality(v_libelles), 0);
  if n = 0 then
    v_liste    := 'tous les secteurs';
    v_domaines := 'de tous les secteurs';
  elsif n = 1 then
    v_liste    := v_libelles[1];
    v_domaines := v_accroches[1];
  else
    v_liste    := array_to_string(v_libelles[1:n-1], ', ') || ' et ' || v_libelles[n];
    v_domaines := array_to_string(v_accroches[1:n-1], ', ') || ' et ' || v_accroches[n];
  end if;

  return jsonb_build_object(
    'mode',                case when cardinality(v_marches) = 0 then 'transverse' else 'multi' end,
    'marches_libelle',     v_liste,
    'public',              'aux professionnels ' || v_domaines,
    'organisation',        'une entreprise ou une organisation professionnelle',
    'organisation_courte', 'une organisation',
    'lecteur',             'un professionnel de terrain',
    'lecteur_formation',   'un salarié ou un dirigeant d''entreprise ou de collectivité',
    'univers',             'un secteur d''activité particulier',
    'adjectif',            'sectorielle',
    'contexte',
      case when cardinality(v_marches) = 0 then
        'Ce contenu est transverse : il sert tous les secteurs couverts par PiloTerra (' || v_liste
        || '). N''ancre pas le texte dans un secteur particulier. Si tu donnes des exemples, varie-les entre ces secteurs sans en privilégier un.'
      else
        'Ce contenu concerne plusieurs secteurs : ' || v_liste
        || '. Si tu donnes des exemples, prends-les dans ces secteurs sans en privilégier un, et n''en évoque pas d''autres.'
      end
  );
end;
$$;

-- ---------------------------------------------------------------------
--  3. Contenus à rédiger
--     Une ligne JSON par contenu, avec les mêmes champs que les anciennes
--     requêtes des scénarios, plus « marches » et « consigne ».
--     Rubrique : 'agent', 'learning', 'data' (piloterra_resources.type)
--     ou 'prompt' (table prompts).
--     Critères inchangés (publié, contenu_long < 800 caractères), plus la
--     qualification de marché.
-- ---------------------------------------------------------------------

create or replace function public.seo_a_rediger(p_rubrique text)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_rubrique = 'prompt' then
    return query
    select jsonb_build_object(
             'id',                p.id,
             'title',             p.title,
             'description',       coalesce(p.description, ''),
             'content',           coalesce(p.content, ''),
             'category',          coalesce(p.category, ''),
             'tags',              coalesce(array_to_string(p.tags, ', '), ''),
             'variables_json',    coalesce(p.variables::text, '[]'),
             'target_tool',       coalesce(p.target_tool, ''),
             'recommended_model', coalesce(p.recommended_model, ''),
             'frugality_level',   coalesce(p.frugality_level::text, ''),
             'frugality_tip',     coalesce(p.frugality_tip, ''),
             'slug',              p.slug,
             'marches',           to_jsonb(p.marches),
             'consigne',          seo_consigne_marche(p.marches)
           )
    from prompts p
    where p.visibility = 'public'
      and p.status = 'published'
      and p.moderation_status = 'approved'
      and p.marche_qualifie_le is not null
      and coalesce(length(p.contenu_long), 0) < 800
    order by p.created_at;

  elsif p_rubrique in ('agent', 'learning', 'data') then
    return query
    select jsonb_build_object(
             'id',            r.id,
             'title',         r.title,
             'description',   coalesce(r.description, ''),
             'external_link', coalesce(r.external_link, ''),
             'metadata_json', coalesce(r.metadata::text, '{}'),
             'slug',          r.slug,
             'marches',       to_jsonb(r.marches),
             'consigne',      seo_consigne_marche(r.marches)
           )
    from piloterra_resources r
    where r.type = p_rubrique
      and r.published is true
      and r.marche_qualifie_le is not null
      and coalesce(length(r.contenu_long), 0) < 800
    order by r.created_at;

  else
    raise exception 'Rubrique inconnue : % (attendu : agent, learning, data, prompt)', p_rubrique;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
--  4. Enregistrer le brouillon
--     N'écrit que contenu_long, seo_title, seo_description et
--     seo_updated_at. Ne touche jamais seo_indexable : la mise en ligne
--     reste une relecture humaine. Le slug est posé par trigger.
-- ---------------------------------------------------------------------

create or replace function public.seo_enregistrer_brouillon(
  p_rubrique        text,
  p_id              uuid,
  p_contenu_long    text,
  p_seo_title       text,
  p_seo_description text
)
returns table (id uuid, titre text, slug text, taille_contenu int)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(length(trim(p_contenu_long)), 0) = 0 then
    raise exception 'Brouillon vide pour % : rien n''est écrit', p_id;
  end if;

  if p_rubrique = 'prompt' then
    return query
    update prompts p
       set contenu_long    = p_contenu_long,
           seo_title       = p_seo_title,
           seo_description = p_seo_description,
           seo_updated_at  = now()
     where p.id = p_id
    returning p.id, p.title, p.slug, length(p.contenu_long);

  elsif p_rubrique in ('agent', 'learning', 'data') then
    return query
    update piloterra_resources r
       set contenu_long    = p_contenu_long,
           seo_title       = p_seo_title,
           seo_description = p_seo_description,
           seo_updated_at  = now()
     where r.id = p_id
       and r.type = p_rubrique
    returning r.id, r.title, r.slug, length(r.contenu_long);

  else
    raise exception 'Rubrique inconnue : % (attendu : agent, learning, data, prompt)', p_rubrique;
  end if;
end;
$$;

revoke all on function public.seo_consigne_marche(text[])                            from public, anon, authenticated;
revoke all on function public.seo_a_rediger(text)                                    from public, anon, authenticated;
revoke all on function public.seo_enregistrer_brouillon(text, uuid, text, text, text) from public, anon, authenticated;

grant execute on function public.seo_consigne_marche(text[])                            to service_role;
grant execute on function public.seo_a_rediger(text)                                    to service_role;
grant execute on function public.seo_enregistrer_brouillon(text, uuid, text, text, text) to service_role;

commit;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
--  5. Vérification — une ligne par contrôle, colonne « ok » attendue à true
-- ---------------------------------------------------------------------

select controle, ok, detail from (
  select 1 as ordre, 'Mots de rédaction SEO sur les 3 marchés' as controle,
         count(*) = 3 as ok,
         string_agg(code, ', ' order by ordre) as detail
  from marches where seo_redaction is not null

  union all
  select 2, 'organisation_courte commence par un/une (élision)',
         bool_and(seo_redaction->>'organisation_courte' ~ '^une? '),
         string_agg(code || ' : ' || (seo_redaction->>'organisation_courte'), ' | ' order by ordre)
  from marches where seo_redaction is not null

  union all
  select 3, 'Consigne d''un contenu agricole',
         seo_consigne_marche(array['agriculture'])->>'mode' = 'marche',
         seo_consigne_marche(array['agriculture'])->>'public'

  union all
  select 4, 'Consigne d''un contenu transverse (neutre)',
         seo_consigne_marche('{}')->>'mode' = 'transverse',
         seo_consigne_marche('{}')->>'public'

  union all
  select 5, 'Fonctions seo_* (3 attendues)',
         count(*) = 3, string_agg(proname, ', ' order by proname)
  from pg_proc
  where pronamespace = 'public'::regnamespace
    and proname in ('seo_consigne_marche', 'seo_a_rediger', 'seo_enregistrer_brouillon')

  union all
  select 6, 'Triggers de slug présents (ressources et prompts)',
         count(distinct event_object_table) = 2,
         string_agg(distinct trigger_name, ', ')
  from information_schema.triggers
  where trigger_schema = 'public'
    and trigger_name in ('trg_slug_piloterra_resources', 'trg_slug_prompts')

  union all
  select 7, 'Fonctions fermées à la clé publique',
         bool_and(not has_function_privilege('anon', p.oid, 'execute')
              and not has_function_privilege('authenticated', p.oid, 'execute')),
         'anon et authenticated'
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('seo_consigne_marche', 'seo_a_rediger', 'seo_enregistrer_brouillon')

  union all
  select 8, 'Fonctions ouvertes au service role',
         bool_and(has_function_privilege('service_role', p.oid, 'execute')),
         'service_role'
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('seo_consigne_marche', 'seo_a_rediger', 'seo_enregistrer_brouillon')
) v
order by ordre;

-- ---------------------------------------------------------------------
--  6. Ce qui attend la rédaction (informatif)
--     Contenus publiés sans texte long, qualifiés ou non : ceux « à
--     qualifier » ne seront rédigés qu'après passage dans la console.
-- ---------------------------------------------------------------------

select rubrique,
       count(*) filter (where qualifie)     as a_rediger,
       count(*) filter (where not qualifie) as a_qualifier_d_abord
from (
  select r.type as rubrique, r.marche_qualifie_le is not null as qualifie
  from piloterra_resources r
  where r.type in ('agent', 'learning', 'data')
    and r.published is true
    and coalesce(length(r.contenu_long), 0) < 800
  union all
  select 'prompt', p.marche_qualifie_le is not null
  from prompts p
  where p.visibility = 'public' and p.status = 'published'
    and p.moderation_status = 'approved'
    and coalesce(length(p.contenu_long), 0) < 800
) t
group by rubrique
order by rubrique;
