-- =====================================================================
--  PILOTERRA — ÉTAPE 7 · Veille par marché
--
--  Idempotent, rejouable. À exécuter en une fois dans l'éditeur SQL.
--  Ordre : après sql/etape6_vitrine_tri_marche.sql. Dev d'abord.
--
--  Aujourd'hui, la veille vit entièrement dans le scénario n8n
--  « Collect News IA Agricole v2 » : 5 requêtes de recherche et 8 flux RSS
--  écrits en dur, un prompt de qualification 100 % agricole, et une
--  écriture par accès Postgres direct sur la prod.
--
--  Ce script sort les sources du code et donne à n8n un contrat stable :
--    - table sources_veille (marché, type, valeur, actif) ;
--    - marches.veille_consigne : le bloc de prompt propre à chaque marché ;
--    - quatre fonctions appelées par le scénario via l'accès Supabase
--      (plus d'accès Postgres direct, plus de SQL dans le scénario).
--
--  Arbitrages du 22/09/2026 :
--    - une news prend le marché de sa source (marches = [marché]), et est
--      donc considérée comme qualifiée (marche_qualifie_le renseigné) : la
--      console de qualification ne sert plus qu'à corriger ;
--    - environnement et logistique : 5 requêtes de recherche chacun, plus
--      les flux RSS repérés par Paul le 23/09/2026 (10 et 9). Les flux
--      sectoriels parlent rarement d'IA : ils servent de filet, l'essentiel
--      des sujets « IA + secteur » vient des requêtes. Pas de flux Google
--      News par site : ses liens sont des redirections, qui casseraient le
--      dédoublonnage par URL et la récupération de la page.
--
--  Les textes de veille_consigne pour environnement et logistique sont des
--  propositions, À VALIDER PAR PAUL. Agriculture reprend les règles du
--  scénario actuel à l'identique.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
--  1. Consigne de qualification par marché
-- ---------------------------------------------------------------------

alter table public.marches add column if not exists veille_consigne text;

comment on column public.marches.veille_consigne is
  'Bloc de prompt de la veille : ce qui rend un article pertinent pour ce marché. Injecté dans le scénario n8n de collecte.';

update public.marches set veille_consigne =
'Le portail s''adresse aux salariés de coopératives agricoles françaises.

pertinent = true UNIQUEMENT si l''article traite réellement d''intelligence artificielle, de robotique ou de numérique avancé APPLIQUÉ à l''agriculture, à l''élevage ou à l''agroalimentaire. Un article agricole sans IA : false. Un article sur l''IA sans lien agricole : false. Une simple mention en passant : false.

score de 0 à 10 : utilité concrète pour un salarié de coopérative agricole française. 10 = cas d''usage opérationnel documenté en France. 0 = hors sujet.'
where code = 'agriculture' and veille_consigne is null;

update public.marches set veille_consigne =
'Le portail s''adresse aux professionnels de l''environnement : collectivités, syndicats de l''eau et des déchets, bureaux d''études, éco-organismes.

pertinent = true UNIQUEMENT si l''article traite réellement d''intelligence artificielle, de robotique ou de numérique avancé APPLIQUÉ à l''environnement : eau et assainissement, déchets et recyclage, qualité de l''air, biodiversité, énergie et climat, sols. Un article environnemental sans IA : false. Un article sur l''IA sans application environnementale : false. Une simple mention en passant : false.

score de 0 à 10 : utilité concrète pour un professionnel français de ces métiers. 10 = cas d''usage opérationnel documenté en France. 0 = hors sujet. Un article qui ne parle que de l''empreinte environnementale de l''IA elle-même ne dépasse pas 4 : c''est un sujet de contexte, pas un cas d''usage.'
where code = 'environnement' and veille_consigne is null;

update public.marches set veille_consigne =
'Le portail s''adresse aux professionnels du transport et de la logistique : transporteurs, prestataires logistiques, commissionnaires, plateformes multimodales.

pertinent = true UNIQUEMENT si l''article traite réellement d''intelligence artificielle, de robotique ou de numérique avancé APPLIQUÉ au transport de marchandises ou à la chaîne logistique : planification et tournées, entrepôt et manutention, prévision de la demande, douane et documents, maintenance des flottes, suivi des expéditions. Un article logistique sans IA : false. Un article sur l''IA sans application logistique : false. Une simple mention en passant : false.

score de 0 à 10 : utilité concrète pour un professionnel français de ces métiers. 10 = cas d''usage opérationnel documenté en France. 0 = hors sujet. Le transport de voyageurs et la voiture autonome grand public sont hors sujet.'
where code = 'logistique' and veille_consigne is null;

-- ---------------------------------------------------------------------
--  2. Table des sources
-- ---------------------------------------------------------------------

create table if not exists public.sources_veille (
  id                   uuid primary key default gen_random_uuid(),
  marche_code          text not null references public.marches(code) on update cascade,
  type                 text not null check (type in ('rss', 'recherche')),
  libelle              text not null,
  valeur               text not null,          -- adresse du flux, ou requête de recherche
  actif                boolean not null default true,
  ordre                integer not null default 100,
  derniere_collecte_at timestamptz,
  dernier_statut       text,
  created_at           timestamptz not null default now()
);

comment on table public.sources_veille is
  'Sources de la veille, par marché. type = rss (adresse d''un flux) ou recherche (requête envoyée à Tavily).';

create unique index if not exists sources_veille_unicite
  on public.sources_veille (marche_code, type, valeur);

create index if not exists sources_veille_actives
  on public.sources_veille (marche_code, actif);

alter table public.sources_veille enable row level security;

drop policy if exists sources_veille_super_admin on public.sources_veille;
create policy sources_veille_super_admin on public.sources_veille
  for all to authenticated
  using (is_super_admin())
  with check (is_super_admin());

-- Le scénario n8n passe par les fonctions ci-dessous (service role).

-- ---------------------------------------------------------------------
--  3. Sources — reprise de l'existant et démarrage des deux autres marchés
--     Rejouable : une source déjà présente n'est pas réécrite, une source
--     désactivée à la main ne se réactive pas.
-- ---------------------------------------------------------------------

insert into public.sources_veille (marche_code, type, libelle, valeur, ordre)
values
  -- Agriculture : les 8 flux et 5 requêtes du scénario actuel, à l'identique
  ('agriculture', 'rss', 'Terre-net',          'https://www.terre-net.fr/rss/',        10),
  ('agriculture', 'rss', 'Web-agri',           'https://www.web-agri.fr/rss/',         20),
  ('agriculture', 'rss', 'La France Agricole', 'https://www.lafranceagricole.fr/rss',  30),
  ('agriculture', 'rss', 'Reussir',            'https://www.reussir.fr/rss.xml',       40),
  ('agriculture', 'rss', 'Pleinchamp',         'https://www.pleinchamp.com/rss.xml',   50),
  ('agriculture', 'rss', 'Cultivar',           'https://www.cultivar.fr/rss.xml',      60),
  ('agriculture', 'rss', 'Agri-mutuel',        'https://agri-mutuel.com/feed/',        70),
  ('agriculture', 'rss', 'WikiAgri',           'https://wikiagri.fr/feed/',            80),
  ('agriculture', 'recherche', 'IA et agriculture',        'intelligence artificielle agriculture',        110),
  ('agriculture', 'recherche', 'IA et élevage',            'IA elevage bovin lait',                        120),
  ('agriculture', 'recherche', 'IA et viticulture',        'intelligence artificielle viticulture vigne',  130),
  ('agriculture', 'recherche', 'IA et coopératives',       'IA cooperative agricole',                      140),
  ('agriculture', 'recherche', 'Agriculture de précision', 'agriculture de precision robotique IA',        150),

  -- Environnement : flux repérés par Paul le 23/09/2026
  ('environnement', 'rss', 'Actu-Environnement',      'https://www.actu-environnement.com/flux/rss/environnement/',  10),
  ('environnement', 'rss', 'Novethic',                'https://www.novethic.fr/feed',                                20),
  ('environnement', 'rss', 'Vert',                    'https://vert.eco/feed/',                                      30),
  ('environnement', 'rss', 'Enviro2B',                'https://www.enviro2b.com/feed/',                              40),
  ('environnement', 'rss', 'Déchets Infos',           'https://dechets-infos.com/feed',                              50),
  ('environnement', 'rss', 'Recyclage Récupération',  'https://www.recyclage-recuperation.fr/feed',                  60),
  ('environnement', 'rss', 'GreenUnivers',            'https://www.greenunivers.com/feed/',                          70),
  ('environnement', 'rss', 'Décisions durables',      'https://www.decisionsdurables.com/feed/',                     80),
  ('environnement', 'rss', 'Enviscope',               'https://www.enviscope.com/feed/',                             90),
  -- Reporterre bloque les requêtes automatisées : à surveiller au premier
  -- passage (dernier_statut), à désactiver s'il ne remonte jamais rien.
  ('environnement', 'rss', 'Reporterre',              'https://reporterre.net/spip.php?page=backend',               100),

  -- Environnement : requêtes de recherche
  ('environnement', 'recherche', 'IA et déchets',        'intelligence artificielle gestion des dechets recyclage',   110),
  ('environnement', 'recherche', 'IA et eau',            'intelligence artificielle eau assainissement reseau',       120),
  ('environnement', 'recherche', 'IA et qualité de l''air', 'intelligence artificielle qualite de l air capteurs',     130),
  ('environnement', 'recherche', 'IA et biodiversité',   'IA biodiversite teledetection suivi especes',               140),
  ('environnement', 'recherche', 'IA et collectivités',  'intelligence artificielle collectivite transition ecologique', 150),

  -- Logistique : flux repérés par Paul le 23/09/2026. Voxlog, Supply Chain
  -- Magazine et FAQ Logistique n'ont pas de flux exploitable, et
  -- Actu-Transport-Logistique interdit l'accès automatisé : ces titres
  -- resteront couverts par les requêtes de recherche. Pas de flux Google
  -- News par site : ses liens sont des redirections, qui casseraient le
  -- dédoublonnage par URL et la récupération de la page.
  ('logistique', 'rss', 'Transport Info',            'https://www.transportinfo.fr/feed/',                                          10),
  ('logistique', 'rss', 'Truck Editions',            'https://www.truckeditions.com/feed/',                                         20),
  ('logistique', 'rss', 'Stratégies Logistique',     'https://www.strategieslogistique.com/spip.php?page=backend&id_rubrique=6',    30),
  ('logistique', 'rss', 'La Tribune Transport',      'https://www.latribune.fr/rss/sous-rubriques-transports/transport-logistique-24', 40),
  ('logistique', 'rss', 'TRM24',                     'https://feeds.feedburner.com/trm24/ZnsqJXJiEJx',                              50),
  ('logistique', 'rss', 'Ports et corridors',        'https://portsetcorridors.com/feed/',                                          60),
  ('logistique', 'rss', 'La Vie du Rail',            'https://www.laviedurail.com/feed/',                                           70),
  ('logistique', 'rss', 'Actu-Environnement Transport', 'https://www.actu-environnement.com/flux/rss/transport/',                   80),
  ('logistique', 'rss', 'Le Monde Transports',       'https://www.lemonde.fr/transports/rss_full.xml',                              90),

  -- Logistique : requêtes de recherche
  ('logistique', 'recherche', 'IA et supply chain',   'intelligence artificielle supply chain logistique',      110),
  ('logistique', 'recherche', 'IA et transport',      'IA transport routier marchandises optimisation',         120),
  ('logistique', 'recherche', 'IA et entrepôt',       'intelligence artificielle entrepot robotisation',        130),
  ('logistique', 'recherche', 'IA et tournées',       'IA optimisation tournees livraison dernier kilometre',   140),
  ('logistique', 'recherche', 'IA et douane',         'intelligence artificielle douane transitaire fret',      150)
on conflict (marche_code, type, valeur) do nothing;

-- ---------------------------------------------------------------------
--  4. Fonctions appelées par le scénario n8n
--     Réservées au service role : le scénario les appelle par l'accès
--     Supabase, jamais avec la clé publique.
-- ---------------------------------------------------------------------

-- 4.1 Les sources à collecter, avec le contexte de leur marché
create or replace function public.veille_sources_actives()
returns table (
  source_id      uuid,
  marche_code    text,
  marche_libelle text,
  source_type    text,
  source_libelle text,
  source_valeur  text,
  consigne       text,
  filieres       jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id,
         s.marche_code,
         m.libelle,
         s.type,
         s.libelle,
         s.valeur,
         m.veille_consigne,
         coalesce(
           (select jsonb_agg(jsonb_build_object('code', f.code, 'libelle', f.libelle) order by f.ordre)
            from filieres f
            where f.marche_code = m.code and f.actif),
           '[]'::jsonb)
  from sources_veille s
  join marches m on m.code = s.marche_code
  where s.actif and m.actif
  order by m.ordre, s.ordre, s.libelle
$$;

-- 4.2 La mémoire de collecte (news_dedup), pour écarter le déjà-vu
create or replace function public.veille_articles_connus()
returns table (cle_url text, cle_titre text)
language sql
stable
security definer
set search_path = public
as $$
  select url_key, title_key
  from news_dedup
  where first_seen_at > now() - interval '3 years'
$$;

-- 4.3 Mémoriser un article analysé, retenu ou écarté
create or replace function public.veille_memoriser(
  p_cle_url   text,
  p_cle_titre text,
  p_source    text,
  p_titre     text,
  p_decision  text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into news_dedup (url_key, title_key, source, title, decision)
  values (p_cle_url, p_cle_titre, p_source, p_titre, p_decision)
  on conflict (url_key) do update
  set last_seen_at = now(),
      seen_count   = news_dedup.seen_count + 1
$$;

-- 4.4 Enregistrer la news, marquée au marché de sa source
--     published = false : l'arbitrage éditorial reste au super admin.
--     marche_qualifie_le est renseigné : le marché vient de la source, ce
--     n'est plus le marquage par défaut du backfill.
--     Suppression préalable : PostgreSQL refuse de changer le type de
--     retour d'une fonction existante, et la colonne « marche » a été
--     ajoutée au retour le 23/09/2026, après un premier passage du script.
drop function if exists public.veille_enregistrer_news(text, text, text, text, date, jsonb, text);

create or replace function public.veille_enregistrer_news(
  p_titre       text,
  p_description text,
  p_lien        text,
  p_image       text,
  p_date        date,
  p_metadata    jsonb,
  p_marche      text
)
returns table (id uuid, titre text, lien text, marche text)
language sql
security definer
set search_path = public
as $$
  insert into piloterra_resources (
    type, title, description, external_link, image_url, started_at,
    metadata, published, marches, marche_qualifie_le
  )
  values (
    'news', p_titre, p_description, p_lien, p_image, p_date,
    coalesce(p_metadata, '{}'::jsonb), false,
    case when p_marche is null then '{}'::text[] else array[p_marche] end,
    case when p_marche is null then null else now() end
  )
  on conflict do nothing
  returning piloterra_resources.id,
            piloterra_resources.title,
            piloterra_resources.external_link,
            p_marche
$$;

-- 4.5 Journal de collecte d'une source (diagnostic d'un flux mort)
create or replace function public.veille_marquer_collecte(
  p_source_id uuid,
  p_statut    text
)
returns void
language sql
security definer
set search_path = public
as $$
  update sources_veille
  set derniere_collecte_at = now(),
      dernier_statut       = left(coalesce(p_statut, ''), 200)
  where id = p_source_id
$$;

revoke all on function public.veille_sources_actives()                                from public, anon, authenticated;
revoke all on function public.veille_articles_connus()                                from public, anon, authenticated;
revoke all on function public.veille_memoriser(text, text, text, text, text)          from public, anon, authenticated;
revoke all on function public.veille_enregistrer_news(text, text, text, text, date, jsonb, text) from public, anon, authenticated;
revoke all on function public.veille_marquer_collecte(uuid, text)                     from public, anon, authenticated;

grant execute on function public.veille_sources_actives()                                to service_role;
grant execute on function public.veille_articles_connus()                                to service_role;
grant execute on function public.veille_memoriser(text, text, text, text, text)          to service_role;
grant execute on function public.veille_enregistrer_news(text, text, text, text, date, jsonb, text) to service_role;
grant execute on function public.veille_marquer_collecte(uuid, text)                     to service_role;

commit;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
--  5. Vérification — une ligne par contrôle, colonne « ok » attendue à true
-- ---------------------------------------------------------------------

select controle, ok, detail from (
  select 1 as ordre, 'Consigne de veille sur les 3 marchés' as controle,
         count(*) = 3 as ok,
         string_agg(code, ', ' order by ordre) as detail
  from marches where veille_consigne is not null

  union all
  select 2, 'Sources agriculture (13 attendues : 8 flux + 5 requêtes)',
         count(*) = 13,
         count(*) filter (where type = 'rss') || ' flux, ' || count(*) filter (where type = 'recherche') || ' requêtes'
  from sources_veille where marche_code = 'agriculture'

  union all
  select 3, 'Sources environnement (15) et logistique (14)',
         count(*) = 29,
         count(*) filter (where marche_code = 'environnement') || ' environnement, '
      || count(*) filter (where marche_code = 'logistique')    || ' logistique'
  from sources_veille where marche_code in ('environnement', 'logistique')

  union all
  select 4, 'Fonctions de veille (5 attendues)',
         count(*) = 5, string_agg(proname, ', ' order by proname)
  from pg_proc
  where pronamespace = 'public'::regnamespace and proname like 'veille\_%'

  union all
  select 5, 'Fonctions fermées à la clé publique',
         bool_and(not has_function_privilege('anon', p.oid, 'execute')
              and not has_function_privilege('authenticated', p.oid, 'execute')),
         'anon et authenticated'
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname like 'veille\_%'

  union all
  select 6, 'Fonctions ouvertes au service role',
         bool_and(has_function_privilege('service_role', p.oid, 'execute')),
         'service_role'
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname like 'veille\_%'
) v
order by ordre;
