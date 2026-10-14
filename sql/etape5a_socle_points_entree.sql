-- =====================================================================
--  PILOTERRA — MULTI-MARCHÉ · Étape 5a : socle SQL des points d'entrée
--
--  Idempotent, rejouable. À exécuter d'un bloc, dans l'ordre du fichier :
--    1. marche_effectif_utilisateur()  — la règle de priorité, écrite une fois
--    2. current_marche_code()          — réécrite sur la nouvelle règle
--    3. Triggers diagnostics / cas_usage — marché posé à la création
--    4. Trigger utilisateurs            — rattachement à une organisation
--    5. Migration secteur_activite → filiere_code (passage unique, journalisé)
--
--  Peut être déployé avant le front de l'étape 5b : aucune dépendance.
--  Effet visible immédiat : aucun au 14/09/2026 — le seul membre ayant un
--  marché sur son profil a le même que son organisation.
--
--  Décisions arbitrées le 14/09/2026 :
--    - le marché de l'ORGANISATION l'emporte toujours sur celui du profil ;
--      le profil ne s'applique qu'hors organisation (ou organisation sans
--      marché). Inverse l'ancien coalesce(profil, organisation).
--    - rejoindre une organisation efface marché et filière du profil.
--    - défaut des contenus neufs inchangé : '{}' (transverse), rattrapé par
--      la console de qualification.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. La règle de priorité, pour un utilisateur donné
--     Utilisable hors contexte d'authentification : c'est ce qui permet
--     aux triggers de fonctionner quand n8n écrit en service_role, où
--     auth.uid() — et donc current_utilisateur_id() — vaut null.
-- ---------------------------------------------------------------------
create or replace function public.marche_effectif_utilisateur(p_utilisateur_id uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(o.marche_code, u.marche_code)
  from public.utilisateurs u
  left join public.organisations o on o.id = u.organisation_id
  where u.id = p_utilisateur_id
  limit 1;
$$;

comment on function public.marche_effectif_utilisateur(uuid) is
  'Marché effectif d''un utilisateur : celui de son organisation, sinon celui de son profil. Source unique de la règle de priorité (étape 5a).';

-- Réservée aux triggers et à current_marche_code() : pas d'appel RPC direct
-- permettant d'interroger le marché de n'importe quel identifiant.
revoke all on function public.marche_effectif_utilisateur(uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------
--  2. current_marche_code() — même signature, mêmes attributs, nouvelle
--     priorité. CREATE OR REPLACE conserve les droits d'exécution existants.
-- ---------------------------------------------------------------------
create or replace function public.current_marche_code()
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.marche_effectif_utilisateur(public.current_utilisateur_id());
$$;


-- ---------------------------------------------------------------------
--  3. Marché posé à la création des diagnostics et des cas d'usage
--     Ne remplace jamais une valeur fournie explicitement (n8n, front).
--     BEFORE INSERT uniquement : le marché d'une production est figé à sa
--     création, il ne suit pas les changements d'organisation ultérieurs.
-- ---------------------------------------------------------------------
create or replace function public.tg_diagnostics_attach_marche()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.marche_code is null and new.user_id is not null then
    new.marche_code := public.marche_effectif_utilisateur(new.user_id);
  end if;
  return new;
end
$$;

create or replace function public.tg_cas_usage_attach_marche()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.marche_code is null then
    -- Un cas d'usage issu d'une Fiche Défi hérite du marché du défi :
    -- le pipeline Fiche Défi → Cas d'usage reste dans un seul marché.
    if new.diagnostic_id is not null then
      select d.marche_code into new.marche_code
      from public.diagnostics d
      where d.id = new.diagnostic_id;
    end if;
    -- Sinon, marché effectif de son auteur.
    if new.marche_code is null and new.user_id is not null then
      new.marche_code := public.marche_effectif_utilisateur(new.user_id);
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists trg_diagnostics_attach_marche on public.diagnostics;
create trigger trg_diagnostics_attach_marche
  before insert on public.diagnostics
  for each row execute function public.tg_diagnostics_attach_marche();

drop trigger if exists trg_cas_usage_attach_marche on public.cas_usage;
create trigger trg_cas_usage_attach_marche
  before insert on public.cas_usage
  for each row execute function public.tg_cas_usage_attach_marche();


-- ---------------------------------------------------------------------
--  4. Rattachement à une organisation : marché et filière du profil effacés
--     Un seul point pour les quatre chemins de rattachement côté client
--     (invitation dans App.tsx, super admin, admin d'organisation).
--     Ne se déclenche que si organisation_id change vers une valeur non
--     nulle : un membre qui modifie ensuite son profil n'est pas effacé.
-- ---------------------------------------------------------------------
create or replace function public.tg_utilisateur_rattachement_orga()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.organisation_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.organisation_id is not distinct from old.organisation_id then
      return new;
    end if;
  end if;
  new.marche_code := null;
  new.filiere_code := null;
  return new;
end
$$;

drop trigger if exists trg_utilisateurs_rattachement_orga on public.utilisateurs;
create trigger trg_utilisateurs_rattachement_orga
  before insert or update of organisation_id on public.utilisateurs
  for each row execute function public.tg_utilisateur_rattachement_orga();


-- ---------------------------------------------------------------------
--  5. Migration secteur_activite → filiere_code  (passage unique)
--     Correspondances sans ambiguïté uniquement, pour les utilisateurs dont
--     le marché effectif est agriculture (toutes les filières visées le
--     sont). secteur_activite est conservé tel quel.
--     Volontairement exclus : valeurs de marché (« agriculture »,
--     « agricole »), mixtes (« polyculture élevage », « viticulture/btp »),
--     incertaines (« scav », « apiculture », « pépinières », « drone »),
--     hors filière (DSI, enseignement, commerce…).
-- ---------------------------------------------------------------------
do $$
declare
  v_nb integer;
begin
  if exists (select 1 from public.migrations_marche where cle = 'filiere_depuis_secteur_v1') then
    raise notice 'filiere_depuis_secteur_v1 déjà appliquée : ignorée.';
    return;
  end if;

  with correspondance(secteur, filiere) as (
    values
      -- Viticulture
      ('viticulture', 'viticulture'), ('viticole', 'viticulture'), ('vinicole', 'viticulture'),
      ('vin', 'viticulture'), ('vigne', 'viticulture'), ('viti oeno', 'viticulture'),
      ('viticulture oenologie', 'viticulture'), ('oenologie', 'viticulture'),
      ('production viti vinicole', 'viticulture'), ('agriculture - vin - oenologie', 'viticulture'),
      ('cave coopérative', 'viticulture'), ('cave cooperative', 'viticulture'),
      ('cave coopérative viticole', 'viticulture'), ('cooperative viticole', 'viticulture'),
      -- Grandes cultures
      ('grandes cultures', 'grandes-cultures'), ('grande culture', 'grandes-cultures'),
      ('garndes cultures agricoles', 'grandes-cultures'), ('céréales', 'grandes-cultures'),
      ('cereale', 'grandes-cultures'), ('céréalier grande culture', 'grandes-cultures'),
      ('producteur grande culture', 'grandes-cultures'), ('cooperative cerealieres', 'grandes-cultures'),
      -- Élevage
      ('elevage', 'elevage'), ('élevage', 'elevage'), ('eleveurs', 'elevage'),
      ('élevage bovin', 'elevage'), ('élevage bovin allaitant', 'elevage'),
      ('élevage ovin', 'elevage'), ('élevage porcin', 'elevage'),
      ('bovin lait', 'elevage'), ('bovin lait, viande et caprin', 'elevage'),
      ('bovins lait agriculture biologique', 'elevage'), ('vache laitière', 'elevage'),
      ('vaches laitières', 'elevage'), ('lait', 'elevage'),
      -- Arboriculture et maraîchage
      ('arboriculture', 'arboriculture-maraichage'), ('maraichage', 'arboriculture-maraichage'),
      ('maraîchage', 'arboriculture-maraichage'), ('maraîchage bio', 'arboriculture-maraichage'),
      ('maraîchers', 'arboriculture-maraichage'), ('fruits et légumes', 'arboriculture-maraichage'),
      ('production fruits', 'arboriculture-maraichage'), ('pomme', 'arboriculture-maraichage'),
      -- Agroalimentaire
      ('agroalimentaire', 'agroalimentaire'), ('agro-alimentaire', 'agroalimentaire'),
      ('agro alimentaire', 'agroalimentaire'), ('agro alimentaires', 'agroalimentaire'),
      -- Conseil et accompagnement
      ('conseil agricole', 'conseil-agricole'), ('conseil en agriculture', 'conseil-agricole'),
      -- Agroéquipement et agrofourniture
      ('matériel agricole', 'agroequipement'), ('commerce de machinisme agricole', 'agroequipement'),
      ('robotique agicole', 'agroequipement'), ('biostimulants', 'agroequipement'),
      ('nutrition animale', 'agroequipement')
  )
  update public.utilisateurs u
     set filiere_code = c.filiere
    from correspondance c
   where lower(trim(u.secteur_activite)) = c.secteur
     and u.filiere_code is null
     and public.marche_effectif_utilisateur(u.id) = 'agriculture';

  get diagnostics v_nb = row_count;

  insert into public.migrations_marche (cle, applique_le, commentaire)
  values (
    'filiere_depuis_secteur_v1',
    now(),
    format('Migration secteur_activite → filiere_code : correspondances sans ambiguïté, marché effectif agriculture, %s utilisateurs. secteur_activite conservé.', v_nb)
  );

  raise notice 'filiere_depuis_secteur_v1 : % utilisateurs mis à jour.', v_nb;
end
$$;


-- =====================================================================
--  Vérifications (lecture seule) — à lancer après exécution
-- =====================================================================
-- Répartition des filières migrées :
--   select filiere_code, count(*) from utilisateurs where filiere_code is not null group by 1 order by 2 desc;
--
-- Journal :
--   select * from migrations_marche order by applique_le;
--
-- Triggers posés :
--   select event_object_table, trigger_name from information_schema.triggers
--   where trigger_name in ('trg_diagnostics_attach_marche','trg_cas_usage_attach_marche','trg_utilisateurs_rattachement_orga');
