-- =====================================================================
--  PILOTERRA — MULTI-MARCHÉ · Étape 5c : organisations
--
--  Idempotent, rejouable. À exécuter d'un bloc, sur le DEV d'abord
--  (supabase.piloterra.me), dans l'ordre du fichier :
--    1. Droits d'écriture sur organisations (réparation)
--    2. Cohérence filière / marché d'une organisation
--    3. Changement de marché : filières des membres hors marché effacées
--  Puis : notify pgrst, 'reload schema';  (voir en fin de fichier)
--
--  Arbitrages du 16/09/2026 :
--    - marché obligatoire pour une organisation, contrôlé dans l'écran super
--      admin (pas de NOT NULL : une organisation existante n'en a pas) ;
--    - changement de marché : les filières personnelles des membres qui
--      n'appartiennent pas au nouveau marché sont effacées ;
--    - création et modification d'organisation réservées au super admin.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. Droits d'écriture
--
--  Constat (pg_policies, 16/09/2026) :
--  - « Seuls les super_admin peuvent modifier les organisations » (ALL)
--    compare utilisateurs.id à auth.uid(). Ces deux identifiants diffèrent
--    pour tous les comptes : la condition n'est jamais vraie. Toute
--    modification d'organisation est ignorée en silence (0 ligne, sans
--    erreur) — y compris le renommage et la suppression « douce ».
--  - « Enable insert for authenticated users only » laisse n'importe quel
--    utilisateur connecté créer une organisation.
--
--  Inchangées : la lecture (tous les connectés) et la suppression (super
--  admin, condition correcte sur auth_id).
--
--  NB : is_super_admin() lit utilisateurs.role. Tant que la politique
--  « Acces total via API » laisse modifier utilisateurs, ce contrôle reste
--  contournable (voir la tâche dédiée dans CLAUDE.md).
-- ---------------------------------------------------------------------
drop policy if exists "Seuls les super_admin peuvent modifier les organisations" on public.organisations;
drop policy if exists "Enable insert for authenticated users only" on public.organisations;

drop policy if exists organisations_creation_super_admin on public.organisations;
create policy organisations_creation_super_admin on public.organisations
  for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists organisations_modification_super_admin on public.organisations;
create policy organisations_modification_super_admin on public.organisations
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());


-- ---------------------------------------------------------------------
--  2. Cohérence filière / marché d'une organisation
--     Une filière qui n'appartient pas au marché de l'organisation (ou une
--     filière sans marché) est retirée. Couvre aussi le changement de
--     marché : la filière de l'organisation suit.
-- ---------------------------------------------------------------------
create or replace function public.tg_organisations_filiere_coherente()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.filiere_code is not null and not exists (
       select 1
       from public.filieres f
       where f.code = new.filiere_code
         and f.marche_code = new.marche_code
     ) then
    new.filiere_code := null;
  end if;
  return new;
end
$$;

drop trigger if exists trg_organisations_filiere_coherente on public.organisations;
create trigger trg_organisations_filiere_coherente
  before insert or update of marche_code, filiere_code on public.organisations
  for each row execute function public.tg_organisations_filiere_coherente();


-- ---------------------------------------------------------------------
--  3. Changement de marché : filières personnelles des membres
--     Quand une organisation reçoit un marché (nouveau ou différent), les
--     filières de ses membres qui n'appartiennent pas à ce marché sont
--     effacées ; les filières compatibles sont conservées. Rien ne se passe
--     si l'organisation perd son marché : ses membres retombent alors sur
--     celui de leur profil.
--     SECURITY DEFINER : modifie des lignes d'autres utilisateurs, et doit
--     continuer de fonctionner une fois la RLS de utilisateurs resserrée.
-- ---------------------------------------------------------------------
create or replace function public.tg_organisations_changement_marche()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.marche_code is null
     or new.marche_code is not distinct from old.marche_code then
    return null;
  end if;

  update public.utilisateurs u
     set filiere_code = null
   where u.organisation_id = new.id
     and u.filiere_code is not null
     and not exists (
       select 1
       from public.filieres f
       where f.code = u.filiere_code
         and f.marche_code = new.marche_code
     );

  return null;
end
$$;

drop trigger if exists trg_organisations_changement_marche on public.organisations;
create trigger trg_organisations_changement_marche
  after update of marche_code on public.organisations
  for each row execute function public.tg_organisations_changement_marche();


-- ---------------------------------------------------------------------
--  Rechargement du cache de l'API (instance auto-hébergée)
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';


-- =====================================================================
--  Vérifications (lecture seule) — à lancer après exécution
-- =====================================================================
-- Politiques de organisations (attendu : lecture, suppression, et les deux
-- nouvelles organisations_creation_super_admin / _modification_super_admin) :
--   select policyname, cmd, qual, with_check from pg_policies
--   where schemaname = 'public' and tablename = 'organisations';
--
-- Triggers posés :
--   select tgname from pg_trigger
--   where tgname in ('trg_organisations_filiere_coherente', 'trg_organisations_changement_marche');
--
-- Organisations sans marché (à compléter depuis l'écran super admin) :
--   select id, nom from organisations
--   where marche_code is null and nom not like '__DELETED__%';
