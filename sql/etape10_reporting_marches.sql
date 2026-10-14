-- =====================================================================
--  PILOTERRA — ÉTAPE 10 · Reporting segmenté par marché
--
--  Idempotent, rejouable. À exécuter en une fois dans l'éditeur SQL.
--  Ordre : après sql/etape10_questions_maturite_tri_marche.sql. Dev d'abord.
--
--  Alimente le tableau « Activité par marché » de la Tour de Contrôle
--  (console super admin) : une seule fonction, reporting_marches(), qui
--  compte tout côté base, avec la règle du marché effectif
--  (organisation, sinon profil). Le navigateur ne charge plus les tables
--  pour compter.
--
--  Arbitrages du 01/10/2026 :
--    - une action compte pour le MARCHÉ AU MOMENT DE L'ACTION : le marché
--      est gravé sur l'enregistrement à sa création, comme déjà pour les
--      fiches défi et les cas d'usage. Ce script l'ajoute aux chartes, aux
--      appels d'agents IA (piloterra_agent_metrics) et aux pages vues des
--      comptes connectés (piloterra_platform_metrics). L'existant est
--      rattaché une fois au marché actuel de son auteur (journal
--      migrations_marche, clé reporting_marche_v1) ;
--    - les états (utilisateurs, organisations, profils de maturité) sont
--      comptés selon le marché d'aujourd'hui : ce ne sont pas des actions ;
--    - les contenus comptent pour chaque marché de leur tableau marches ;
--      un contenu transverse (tableau vide) est compté à part.
--
--  Lecture : réservée au super admin (contrôle dans la fonction).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
--  1. Marché gravé sur les chartes et les appels d'agents IA
-- ---------------------------------------------------------------------

alter table public.chartes add column if not exists marche_code text;
alter table public.piloterra_agent_metrics add column if not exists marche_code text;
alter table public.piloterra_platform_metrics add column if not exists marche_code text;

comment on column public.chartes.marche_code is
  'Marché de l''auteur au moment de la création (trigger trg_chartes_attach_marche). Sert au reporting.';
comment on column public.piloterra_agent_metrics.marche_code is
  'Marché de l''utilisateur au moment de l''appel (trigger trg_agent_metrics_attach_marche). Sert au reporting.';
comment on column public.piloterra_platform_metrics.marche_code is
  'Marché de l''utilisateur au moment de la page vue (trigger trg_platform_metrics_attach_marche). Sert au reporting.';

create index if not exists chartes_marche_code on public.chartes (marche_code);
create index if not exists agent_metrics_marche_code on public.piloterra_agent_metrics (marche_code);

-- Charte : marché effectif de l'auteur, sinon celui de l'organisation.
-- Dérivé de la ligne elle-même (pas d'auth.uid()) : fonctionne aussi
-- quand n8n écrit.
create or replace function public.tg_chartes_attach_marche()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.marche_code is null then
    if new.created_by is not null then
      new.marche_code := public.marche_effectif_utilisateur(new.created_by);
    end if;
    if new.marche_code is null and new.organisation_id is not null then
      select o.marche_code into new.marche_code from organisations o where o.id = new.organisation_id;
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists trg_chartes_attach_marche on public.chartes;
create trigger trg_chartes_attach_marche
  before insert on public.chartes
  for each row execute function public.tg_chartes_attach_marche();

-- Appel d'agent IA et page vue (empreinte de l'infrastructure) :
-- auth_user_id est l'identifiant de connexion. Même fonction pour les
-- deux tables, qui ont les mêmes colonnes auth_user_id / marche_code.
create or replace function public.tg_agent_metrics_attach_marche()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.marche_code is null and new.auth_user_id is not null then
    select public.marche_effectif_utilisateur(u.id) into new.marche_code
    from utilisateurs u where u.auth_id = new.auth_user_id
    limit 1;
  end if;
  return new;
end
$$;

drop trigger if exists trg_agent_metrics_attach_marche on public.piloterra_agent_metrics;
create trigger trg_agent_metrics_attach_marche
  before insert on public.piloterra_agent_metrics
  for each row execute function public.tg_agent_metrics_attach_marche();

drop trigger if exists trg_platform_metrics_attach_marche on public.piloterra_platform_metrics;
create trigger trg_platform_metrics_attach_marche
  before insert on public.piloterra_platform_metrics
  for each row execute function public.tg_agent_metrics_attach_marche();

create index if not exists platform_metrics_marche_code on public.piloterra_platform_metrics (marche_code);

-- Rattachement de l'existant, une seule fois.
do $$
declare
  v_chartes int;
  v_appels  int;
  v_pages   int;
begin
  if exists (select 1 from public.migrations_marche where cle = 'reporting_marche_v1') then
    raise notice 'reporting_marche_v1 déjà appliquée : ignorée.';
    return;
  end if;

  update public.chartes c
     set marche_code = coalesce(public.marche_effectif_utilisateur(c.created_by),
                                (select o.marche_code from public.organisations o where o.id = c.organisation_id))
   where c.marche_code is null;
  get diagnostics v_chartes = row_count;

  update public.piloterra_agent_metrics m
     set marche_code = (select public.marche_effectif_utilisateur(u.id)
                        from public.utilisateurs u where u.auth_id = m.auth_user_id limit 1)
   where m.marche_code is null and m.auth_user_id is not null;
  get diagnostics v_appels = row_count;

  update public.piloterra_platform_metrics m
     set marche_code = (select public.marche_effectif_utilisateur(u.id)
                        from public.utilisateurs u where u.auth_id = m.auth_user_id limit 1)
   where m.marche_code is null and m.auth_user_id is not null;
  get diagnostics v_pages = row_count;

  insert into public.migrations_marche (cle, applique_le, commentaire)
  values ('reporting_marche_v1', now(),
          format('Marché gravé sur l''existant (marché actuel de l''auteur) : %s chartes, %s appels d''agents IA, %s pages vues.', v_chartes, v_appels, v_pages));
end
$$;

-- ---------------------------------------------------------------------
--  2. Indicateurs d'une période
--     Une ligne par (marché, indicateur). marche = code du marché,
--     'sans_marche' (aucun marché déterminé) ou 'transverse' (contenus
--     sans marché). Bornes nulles = depuis toujours / jusqu'à maintenant.
--     Les états (totaux, profils) sont pris à la fin de la période.
-- ---------------------------------------------------------------------

create or replace function public.reporting_marches_periode(p_debut timestamptz, p_fin timestamptz)
returns table (marche text, indicateur text, valeur numeric)
language sql
stable
security definer
set search_path = public
as $$
  with
  bornes as (
    select coalesce(p_debut, '-infinity'::timestamptz) as debut,
           coalesce(p_fin, now()) as fin
  ),
  -- Utilisateurs et leur marché d'aujourd'hui (organisation, sinon profil)
  util as (
    select u.id, u.auth_id, u.created_at,
           coalesce(o.marche_code, u.marche_code, 'sans_marche') as marche,
           -- jsonb stocké parfois en chaîne ; une chaîne illisible est
           -- ignorée plutôt que de faire échouer tout le reporting.
           case when jsonb_typeof(u.maturity_results) = 'string'
                 and pg_input_is_valid(u.maturity_results #>> '{}', 'jsonb')
                then (u.maturity_results #>> '{}')::jsonb
                when jsonb_typeof(u.maturity_results) = 'object'
                then u.maturity_results
           end as maturite
    from utilisateurs u
    left join organisations o on o.id = u.organisation_id
  ),
  -- Contenus : une ligne par marché du tableau, 'transverse' si vide
  contenus as (
    select r.id, r.type, r.published, r.seo_indexable, r.contenu_long, r.created_at,
           unnest(case when coalesce(cardinality(r.marches), 0) = 0
                       then array['transverse'] else r.marches end) as marche
    from piloterra_resources r
  ),
  prompts_publics as (
    select p.id, p.created_at,
           unnest(case when coalesce(cardinality(p.marches), 0) = 0
                       then array['transverse'] else p.marches end) as marche
    from prompts p
    where p.visibility = 'public' and p.status = 'published' and p.moderation_status = 'approved'
  )

  -- Adoption
  select u.marche, 'utilisateurs_total', count(*)::numeric
  from util u, bornes b where u.created_at <= b.fin group by 1
  union all
  select u.marche, 'utilisateurs_nouveaux', count(*)::numeric
  from util u, bornes b where u.created_at > b.debut and u.created_at <= b.fin group by 1
  union all
  -- Dernière connexion dans la période (auth ne garde que la dernière)
  select u.marche, 'utilisateurs_connectes', count(*)::numeric
  from util u join auth.users a on a.id = u.auth_id, bornes b
  where a.last_sign_in_at > b.debut and a.last_sign_in_at <= b.fin group by 1
  union all
  select coalesce(o.marche_code, 'sans_marche'), 'organisations_total', count(*)::numeric
  from organisations o, bornes b where o.created_at <= b.fin group by 1
  union all
  select coalesce(o.marche_code, 'sans_marche'), 'organisations_nouvelles', count(*)::numeric
  from organisations o, bornes b where o.created_at > b.debut and o.created_at <= b.fin group by 1

  -- Production (marché gravé à la création)
  union all
  select coalesce(d.marche_code, 'sans_marche'), 'fiches_defi', count(*)::numeric
  from diagnostics d, bornes b where d.created_at > b.debut and d.created_at <= b.fin group by 1
  union all
  select coalesce(c.marche_code, 'sans_marche'), 'cas_usage', count(*)::numeric
  from cas_usage c, bornes b where c.created_at > b.debut and c.created_at <= b.fin group by 1
  union all
  select coalesce(c.marche_code, 'sans_marche'), 'chartes', count(*)::numeric
  from chartes c, bornes b where c.created_at > b.debut and c.created_at <= b.fin group by 1

  -- Maturité (état à la fin de la période, comptes existants)
  union all
  select u.marche,
         case
           when u.maturite->>'profil_titre' ilike '%graine%' then 'profil_graine'
           when u.maturite->>'profil_titre' ilike '%pousse%' then 'profil_pousse'
           when u.maturite->>'profil_titre' ilike '%arbre%'  then 'profil_arbre'
           when u.maturite->>'profil_titre' ilike '%semeur%' then 'profil_semeur'
           else 'profil_autre'
         end,
         count(*)::numeric
  from util u, bornes b
  where u.maturite is not null and jsonb_typeof(u.maturite) = 'object' and u.created_at <= b.fin
  group by 1, 2
  union all
  select u.marche, 'maturite_score_moyen', round(avg((u.maturite->>'score_maturite')::numeric), 1)
  from util u, bornes b
  where jsonb_typeof(u.maturite) = 'object'
    and u.maturite->>'score_maturite' ~ '^[0-9]+(\.[0-9]+)?$'
    and u.created_at <= b.fin
  group by 1

  -- Contenus
  union all
  select c.marche, 'ressources_publiees', count(*)::numeric
  from contenus c, bornes b
  where c.published and c.type <> 'news' and c.created_at <= b.fin group by 1
  union all
  select c.marche, 'pages_referencement', count(*)::numeric
  from contenus c, bornes b
  where c.published and c.seo_indexable and c.contenu_long is not null and c.created_at <= b.fin group by 1
  union all
  select c.marche, 'actualites_collectees', count(*)::numeric
  from contenus c, bornes b
  where c.type = 'news' and c.created_at > b.debut and c.created_at <= b.fin group by 1
  union all
  select c.marche, 'actualites_publiees', count(*)::numeric
  from contenus c, bornes b
  where c.type = 'news' and c.published and c.created_at > b.debut and c.created_at <= b.fin group by 1
  union all
  select p.marche, 'prompts_publics', count(*)::numeric
  from prompts_publics p, bornes b where p.created_at <= b.fin group by 1

  -- Usage IA (marché gravé à l'appel)
  union all
  select coalesce(m.marche_code, 'sans_marche'), 'ia_appels', count(*)::numeric
  from piloterra_agent_metrics m, bornes b where m.created_at > b.debut and m.created_at <= b.fin group by 1
  union all
  select coalesce(m.marche_code, 'sans_marche'), 'ia_cout_usd', round(sum(coalesce(m.total_cost_usd, 0))::numeric, 4)
  from piloterra_agent_metrics m, bornes b where m.created_at > b.debut and m.created_at <= b.fin group by 1
  union all
  select coalesce(m.marche_code, 'sans_marche'), 'ia_carbone_g', round(sum(coalesce(m.emissions_gco2eq, 0))::numeric, 2)
  from piloterra_agent_metrics m, bornes b where m.created_at > b.debut and m.created_at <= b.fin group by 1

  -- Navigation des comptes connectés (empreinte de l'infrastructure)
  union all
  select coalesce(p.marche_code, 'sans_marche'), 'pages_vues', count(*)::numeric
  from piloterra_platform_metrics p, bornes b where p.created_at > b.debut and p.created_at <= b.fin group by 1
  union all
  select coalesce(p.marche_code, 'sans_marche'), 'infra_carbone_g', round(sum(coalesce(p.co2_grams, 0))::numeric, 2)
  from piloterra_platform_metrics p, bornes b where p.created_at > b.debut and p.created_at <= b.fin group by 1
$$;

-- ---------------------------------------------------------------------
--  3. Fonction appelée par la console
--     Période courante + période précédente de même durée (si la
--     période a un début), pour les tendances.
-- ---------------------------------------------------------------------

create or replace function public.reporting_marches(p_debut timestamptz default null, p_fin timestamptz default null)
returns table (marche text, indicateur text, valeur numeric, precedent numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fin  timestamptz := coalesce(p_fin, now());
  v_duree interval;
begin
  if not public.is_super_admin() then
    raise exception 'Reporting réservé au super admin';
  end if;

  -- Sans début (« depuis toujours ») : pas de période précédente.
  if p_debut is null then
    return query
    select c.marche, c.indicateur, c.valeur, null::numeric
    from public.reporting_marches_periode(null, v_fin) c;
    return;
  end if;

  v_duree := v_fin - p_debut;

  return query
  with
  courant as (select * from public.reporting_marches_periode(p_debut, v_fin)),
  avant   as (select * from public.reporting_marches_periode(p_debut - v_duree, p_debut))
  select coalesce(c.marche, a.marche), coalesce(c.indicateur, a.indicateur),
         coalesce(c.valeur, 0), a.valeur
  from courant c
  full join avant a on a.marche = c.marche and a.indicateur = c.indicateur;
end
$$;

revoke all on function public.reporting_marches_periode(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.reporting_marches(timestamptz, timestamptz) from public, anon;
grant execute on function public.reporting_marches(timestamptz, timestamptz) to authenticated;

revoke all on function public.tg_chartes_attach_marche() from public, anon, authenticated;
revoke all on function public.tg_agent_metrics_attach_marche() from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
--  4. Vérification — une ligne par contrôle, colonne « ok » attendue à true
-- ---------------------------------------------------------------------

select controle, ok, detail from (
  select 1 as ordre, 'Marché gravé sur chartes, appels IA et pages vues' as controle,
         count(*) = 3 as ok, string_agg(table_name, ', ') as detail
  from information_schema.columns
  where table_schema = 'public' and column_name = 'marche_code'
    and table_name in ('chartes', 'piloterra_agent_metrics', 'piloterra_platform_metrics')

  union all
  select 2, 'Triggers posés (3 attendus)',
         count(distinct trigger_name) = 3, string_agg(distinct trigger_name, ', ')
  from information_schema.triggers
  where trigger_name in ('trg_chartes_attach_marche', 'trg_agent_metrics_attach_marche', 'trg_platform_metrics_attach_marche')

  union all
  select 3, 'Existant rattaché (journal)',
         count(*) = 1, max(commentaire)
  from migrations_marche where cle = 'reporting_marche_v1'

  union all
  select 4, 'Fonction fermée à la clé publique',
         not has_function_privilege('anon', 'public.reporting_marches(timestamptz, timestamptz)', 'execute'),
         'anon'

  union all
  select 5, 'Indicateurs calculés (aperçu sans contrôle de rôle)',
         count(*) > 0, count(*)::text || ' lignes'
  from public.reporting_marches_periode(null, null)
) v
order by ordre;

-- Aperçu lisible, à lancer à part si besoin :
--   select marche, indicateur, valeur
--   from public.reporting_marches_periode(now() - interval '30 days', now())
--   order by indicateur, marche;
