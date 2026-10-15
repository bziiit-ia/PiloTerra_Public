-- =====================================================================
--  PILOTERRA — MULTI-MARCHÉ · Étapes 1 à 3 : socle multi-marché
--
--  Idempotent, rejouable. À exécuter en une fois dans l'éditeur SQL.
--  Ordre : après sql/etape0_schema_initial.sql, avant
--  sql/etape4_qualification_marche.sql.
--
--  Ces étapes ont été appliquées à la main sur les bases en septembre
--  2026, sans script versionné. Ce fichier les reconstitue le 15/10/2026
--  à partir du schéma en service, dans l'ordre du fichier :
--    1. Référentiels marches et filieres, journal migrations_marche
--    2. Marché sur les profils, organisations et productions
--       (diagnostics, cas d'usage), marchés sur les contenus
--       (piloterra_resources, prompts)
--    3. Fonctions est_visible_pour() et current_marche_code()
--    4. Lecture publique des référentiels, écriture super admin
--    5. Marchés et filières de départ
--    6. Backfill agriculture (passage unique, journalisé)
--
--  Règles posées par ce socle :
--    - contenus : tableau marches, VIDE = transverse (visible partout) ;
--    - productions : un seul marché_code, celui de l'auteur ;
--    - profil : marche_code est une surcharge, NULL = marché de
--      l'organisation. L'étape 5a inverse ensuite la priorité
--      (l'organisation l'emporte) et réécrit current_marche_code().
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
--  1. Référentiels et journal
-- ---------------------------------------------------------------------
create table if not exists public.marches (
  code text primary key,
  libelle text not null,
  baseline text not null,
  couleur_accent text not null default '#1b5e1f',
  ordre integer not null default 0,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.marches is
  'Les marchés adressés par PiloTerra. Référentiel fermé, édité par le super admin.';
comment on column public.marches.baseline is
  'Phrase d''accroche du portail pour ce marché. Alimente le hero et le SEO.';
comment on column public.marches.actif is
  'Levier de retrait d''un marché du référentiel. L''ouverture publique du multi-marché est pilotée côté front.';

create table if not exists public.filieres (
  code text primary key,
  marche_code text not null
    references public.marches(code) on update cascade,
  libelle text not null,
  ordre integer not null default 0,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.filieres is
  'Sous-catégories d''un marché. Liste ouverte, éditable sans migration.';

create index if not exists idx_filieres_marche on public.filieres (marche_code);

create table if not exists public.migrations_marche (
  cle text primary key,
  applique_le timestamptz not null default now(),
  commentaire text
);

comment on table public.migrations_marche is
  'Journal des opérations de migration à passage unique du chantier multi-marché. Ne jamais vider : sert de garde-fou aux backfills.';


-- ---------------------------------------------------------------------
--  2. Colonnes de marché
-- ---------------------------------------------------------------------
alter table public.utilisateurs  add column if not exists marche_code text;
alter table public.utilisateurs  add column if not exists filiere_code text;
alter table public.organisations add column if not exists marche_code text;
alter table public.organisations add column if not exists filiere_code text;
alter table public.diagnostics   add column if not exists marche_code text;
alter table public.cas_usage     add column if not exists marche_code text;

alter table public.piloterra_resources
  add column if not exists marches text[] not null default '{}';
alter table public.prompts
  add column if not exists marches text[] not null default '{}';

comment on column public.utilisateurs.marche_code is
  'Surcharge individuelle. NULL = hérite du marché de l''organisation.';
comment on column public.utilisateurs.filiere_code is
  'Remplace à terme le champ texte libre `secteur_activite`, conservé tel quel pour l''instant.';
comment on column public.piloterra_resources.marches is
  'Marchés auxquels ce contenu s''adresse. Tableau VIDE = transverse (visible sur tous les marchés, présents et futurs).';
comment on column public.prompts.marches is
  'Marchés auxquels ce prompt s''adresse. Tableau VIDE = transverse.';

-- Clés étrangères : ajoutées seulement si absentes.
do $$
declare
  v record;
begin
  for v in
    select * from (values
      ('utilisateurs',  'utilisateurs_marche_code_fkey',  'marche_code',  'marches'),
      ('utilisateurs',  'utilisateurs_filiere_code_fkey', 'filiere_code', 'filieres'),
      ('organisations', 'organisations_marche_code_fkey',  'marche_code',  'marches'),
      ('organisations', 'organisations_filiere_code_fkey', 'filiere_code', 'filieres'),
      ('diagnostics',   'diagnostics_marche_code_fkey',   'marche_code',  'marches'),
      ('cas_usage',     'cas_usage_marche_code_fkey',     'marche_code',  'marches')
    ) as t(tbl, nom, col, ref)
  loop
    if not exists (
      select 1 from pg_constraint
      where conname = v.nom and conrelid = format('public.%I', v.tbl)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (%I) references public.%I(code) on update cascade',
        v.tbl, v.nom, v.col, v.ref);
    end if;
  end loop;
end;
$$;

create index if not exists idx_utilisateurs_marche  on public.utilisateurs (marche_code);
create index if not exists idx_organisations_marche on public.organisations (marche_code);
create index if not exists idx_diagnostics_marche   on public.diagnostics (marche_code);
create index if not exists idx_cas_usage_marche     on public.cas_usage (marche_code);
create index if not exists idx_resources_marches    on public.piloterra_resources using gin (marches);
create index if not exists idx_prompts_marches      on public.prompts using gin (marches);


-- ---------------------------------------------------------------------
--  3. Fonctions
-- ---------------------------------------------------------------------
create or replace function public.est_visible_pour(p_marches text[], p_marche text)
returns boolean
language sql
immutable
as $$
  select p_marches is null
      or cardinality(p_marches) = 0
      or p_marche is null
      or p_marche = any(p_marches);
$$;

comment on function public.est_visible_pour(text[], text) is
  'Vrai si un contenu marqué p_marches doit apparaître dans le contexte du marché p_marche. Tableau vide = transverse.';

-- Règle d'origine : surcharge du profil, sinon marché de l'organisation.
-- Créée seulement si absente : l'étape 5a la réécrit sur la règle
-- actuelle, qu'il ne faut pas écraser en rejouant ce script.
do $$
begin
  if to_regprocedure('public.current_marche_code()') is null then
    create function public.current_marche_code()
    returns text
    language sql
    stable
    security definer
    set search_path to 'public'
    as $f$
      select coalesce(u.marche_code, o.marche_code)
      from public.utilisateurs u
      left join public.organisations o on o.id = u.organisation_id
      where u.id = public.current_utilisateur_id();
    $f$;

    comment on function public.current_marche_code() is
      'Marché effectif de l''utilisateur connecté : surcharge profil, à défaut marché de son organisation, à défaut NULL (mode vitrine).';
  end if;
end;
$$;


-- ---------------------------------------------------------------------
--  4. Droits sur les référentiels
-- ---------------------------------------------------------------------
alter table public.marches enable row level security;
alter table public.filieres enable row level security;
alter table public.migrations_marche enable row level security;

drop policy if exists marches_lecture_publique on public.marches;
create policy marches_lecture_publique on public.marches
  for select to authenticated, anon using (true);

drop policy if exists marches_ecriture_admin on public.marches;
create policy marches_ecriture_admin on public.marches
  to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists filieres_lecture_publique on public.filieres;
create policy filieres_lecture_publique on public.filieres
  for select to authenticated, anon using (true);

drop policy if exists filieres_ecriture_admin on public.filieres;
create policy filieres_ecriture_admin on public.filieres
  to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists migrations_lecture_admin on public.migrations_marche;
create policy migrations_lecture_admin on public.migrations_marche
  for select to authenticated using (public.is_super_admin());


-- ---------------------------------------------------------------------
--  5. Marchés et filières de départ
--     Les étapes 5d, 6, 8, 9 et 10 complètent ensuite les marchés
--     (profils, vitrine, SEO, couleurs).
-- ---------------------------------------------------------------------
insert into public.marches (code, libelle, baseline, couleur_accent, ordre) values
  ('agriculture',   'Agriculture',   'Votre portail IA agricole open source',      '#1b5e1f', 1),
  ('environnement', 'Environnement', 'Votre portail IA environnement open source', '#0e7490', 2),
  ('logistique',    'Logistique',    'Votre portail IA logistique open source',    '#a16207', 3)
on conflict (code) do nothing;

insert into public.filieres (code, marche_code, libelle, ordre) values
  ('grandes-cultures',            'agriculture',   'Grandes cultures',                 1),
  ('viticulture',                 'agriculture',   'Viticulture',                      2),
  ('elevage',                     'agriculture',   'Élevage',                          3),
  ('arboriculture-maraichage',    'agriculture',   'Arboriculture et maraîchage',      4),
  ('agroalimentaire',             'agriculture',   'Agroalimentaire',                  5),
  ('foret-bois',                  'agriculture',   'Forêt et bois',                    6),
  ('agroequipement',              'agriculture',   'Agroéquipement et agrofourniture', 7),
  ('conseil-agricole',            'agriculture',   'Conseil et accompagnement',        8),
  ('eau-assainissement',          'environnement', 'Eau et assainissement',            1),
  ('dechets-economie-circulaire', 'environnement', 'Déchets et économie circulaire',   2),
  ('biodiversite-milieux',        'environnement', 'Biodiversité et milieux naturels', 3),
  ('energie-climat',              'environnement', 'Énergie et climat',                4),
  ('qualite-air',                 'environnement', 'Qualité de l''air',                5),
  ('risques-naturels',            'environnement', 'Risques naturels',                 6),
  ('amenagement-territoire',      'environnement', 'Aménagement du territoire',        7),
  ('transport-routier',           'logistique',    'Transport routier',                1),
  ('entreposage',                 'logistique',    'Entreposage et stockage',          2),
  ('dernier-kilometre',           'logistique',    'Dernier kilomètre',                3),
  ('logistique-froid',            'logistique',    'Logistique du froid',              4),
  ('multimodal',                  'logistique',    'Transport multimodal',             5),
  ('achats-approvisionnement',    'logistique',    'Achats et approvisionnement',      6),
  ('supply-chain-industrielle',   'logistique',    'Supply chain industrielle',        7)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
--  6. Backfill agriculture
--     Avant le chantier, tout PiloTerra parlait d'agriculture : contenus,
--     organisations et productions existants y sont rattachés une fois.
--     Les profils restent à NULL (ils héritent de leur organisation).
--     Sur une base neuve, les tables sont vides : seul le journal bouge.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.migrations_marche where cle = 'backfill_agriculture_v1') then
    raise notice 'backfill_agriculture_v1 déjà appliquée : ignorée.';
    return;
  end if;

  update public.piloterra_resources set marches = '{agriculture}' where marches = '{}';
  update public.prompts             set marches = '{agriculture}' where marches = '{}';
  update public.organisations set marche_code = 'agriculture' where marche_code is null;
  update public.diagnostics   set marche_code = 'agriculture' where marche_code is null;
  update public.cas_usage     set marche_code = 'agriculture' where marche_code is null;

  insert into public.migrations_marche (cle, commentaire) values (
    'backfill_agriculture_v1',
    'Marquage initial : tout le contenu et toutes les productions existantes affectés au marché agriculture.'
  );
end;
$$;

commit;

notify pgrst, 'reload schema';
