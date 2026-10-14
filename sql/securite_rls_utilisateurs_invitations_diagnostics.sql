-- =====================================================================
--  PILOTERRA — SÉCURITÉ · Fermeture RLS
--  utilisateurs · invitations · diagnostics · vue chartes_summary
--
--  Idempotent, rejouable. À exécuter en une fois dans l'éditeur SQL.
--
--  ORDRE DE DÉPLOIEMENT (important) :
--    DEV  : 1. copie n8n « Fiche Défi DEV » sur l'accès Supabase (fait
--              le 17/09/2026) — 2. ce script — 3. front de ce dépôt.
--    PROD : 1. front de prod à jour (acceptation d'invitation par
--              accepter_invitation(), compteur par nombre_defis_piloterra())
--           2. nœud « HTTP Request » du workflow Fiche Défi de prod passé
--              sur l'accès « Supabase PiloTerra » (plus de clé anon)
--           3. ce script.
--    Sans l'étape 1, l'acceptation d'invitation et le compteur public de
--    défis cassent. Sans l'étape 2, la Fiche Défi n'enregistre plus
--    l'utilisateur.
--
--  Ce que ferme ce script :
--    - utilisateurs : « Acces total via API » (ALL, public, true) laissait
--      lire et modifier tous les profils, rôle compris, avec la clé anon.
--    - diagnostics : « Acces total via API » et « Enable read access for
--      all users » annulaient les politiques scoped existantes.
--    - invitations : RLS désactivée ; politiques présentes mais inactives,
--      dont plusieurs fausses (utilisateurs.id = auth.uid()).
--    - chartes_summary : vue sans security_invoker, contournait la RLS.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
--  0. Fonctions d'appui
-- ---------------------------------------------------------------------

-- Participants des sessions que l'utilisateur connecté anime (formateur
-- désigné ou participant de rôle formateur), ou des sessions de son
-- organisation s'il en est admin. Sert la vue v_session_progression,
-- qui joint utilisateurs en security_invoker.
create or replace function public.participants_sessions_animees()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select sp.user_id
  from session_participants sp
  join sessions_formation s on s.id = sp.session_id
  where s.formateur_id = current_utilisateur_id()
     or exists (
          select 1 from session_participants f
          where f.session_id = s.id
            and f.user_id = current_utilisateur_id()
            and f.role = 'formateur'
        )
     or (is_org_admin() and s.organisation_id = current_organisation_id())
$$;

revoke all on function public.participants_sessions_animees() from public, anon;
grant execute on function public.participants_sessions_animees() to authenticated;

-- Compteur public des défis (page Fiche Défi, visiteur non connecté).
-- Ne renvoie qu'un nombre : la table diagnostics n'est plus lisible
-- par la clé anon.
create or replace function public.nombre_defis_piloterra()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*) from diagnostics where provenance = 'piloterra'
$$;

revoke all on function public.nombre_defis_piloterra() from public;
grant execute on function public.nombre_defis_piloterra() to anon, authenticated;

-- ---------------------------------------------------------------------
--  1. utilisateurs
-- ---------------------------------------------------------------------

drop policy if exists "Acces total via API" on public.utilisateurs;
drop policy if exists "L'utilisateur voit son propre profil" on public.utilisateurs;
drop policy if exists "L'utilisateur modifie son propre profil" on public.utilisateurs;

drop policy if exists utilisateurs_select_soi on public.utilisateurs;
drop policy if exists utilisateurs_select_organisation on public.utilisateurs;
drop policy if exists utilisateurs_select_sessions on public.utilisateurs;
drop policy if exists utilisateurs_select_super_admin on public.utilisateurs;
drop policy if exists utilisateurs_update_soi on public.utilisateurs;
drop policy if exists utilisateurs_update_admin_organisation on public.utilisateurs;
drop policy if exists utilisateurs_update_super_admin on public.utilisateurs;
drop policy if exists utilisateurs_delete_super_admin on public.utilisateurs;

-- Lecture : soi, les membres de sa propre organisation, les participants
-- des sessions qu'on anime, tout pour le super admin.
create policy utilisateurs_select_soi on public.utilisateurs
  for select to authenticated
  using (auth_id = auth.uid());

create policy utilisateurs_select_organisation on public.utilisateurs
  for select to authenticated
  using (id in (select same_org_utilisateur_ids()));

create policy utilisateurs_select_sessions on public.utilisateurs
  for select to authenticated
  using (id in (select participants_sessions_animees()));

create policy utilisateurs_select_super_admin on public.utilisateurs
  for select to authenticated
  using (is_super_admin());

-- Écriture : son propre profil ; les membres de son organisation pour un
-- admin d'organisation ; tout pour le super admin. Les champs sensibles
-- (rôle, organisation, auth_id, e-mail) sont gardés par le trigger
-- ci-dessous, qu'une politique ne sait pas filtrer colonne par colonne.
create policy utilisateurs_update_soi on public.utilisateurs
  for update to authenticated
  using (auth_id = auth.uid())
  with check (auth_id = auth.uid());

create policy utilisateurs_update_admin_organisation on public.utilisateurs
  for update to authenticated
  using (
    is_org_admin()
    and organisation_id is not null
    and organisation_id = current_organisation_id()
  )
  with check (organisation_id = current_organisation_id());

create policy utilisateurs_update_super_admin on public.utilisateurs
  for update to authenticated
  using (is_super_admin())
  with check (true);

create policy utilisateurs_delete_super_admin on public.utilisateurs
  for delete to authenticated
  using (is_super_admin());

-- Aucune politique INSERT : les profils sont créés par le trigger
-- handle_new_auth_user (SECURITY DEFINER) et par n8n (service role),
-- qui ne passent pas par la RLS.

-- Garde des champs sensibles. SECURITY INVOKER volontairement :
-- current_user vaut 'authenticated' ou 'anon' pour un appel du front,
-- et le propriétaire de la fonction (postgres) quand la modification vient
-- d'une fonction SECURITY DEFINER (accepter_invitation, handle_new_auth_user)
-- ou de n8n en service role — contextes de confiance, laissés passer.
create or replace function public.tg_utilisateurs_garde_champs_sensibles()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if is_super_admin() then
    return new;
  end if;

  if new.auth_id is distinct from old.auth_id then
    raise exception 'Modification du compte de connexion non autorisée'
      using errcode = '42501';
  end if;

  if new.organisation_id is distinct from old.organisation_id then
    raise exception 'Changement d''organisation non autorisé (passer par une invitation)'
      using errcode = '42501';
  end if;

  -- L'e-mail ne peut que se synchroniser sur celui du compte connecté.
  if new.email is distinct from old.email
     and lower(coalesce(new.email, '')) <> lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception 'Modification de l''e-mail non autorisée'
      using errcode = '42501';
  end if;

  -- Rôle : seul un admin de l'organisation du membre, entre les rôles
  -- d'organisation, jamais vers ni depuis super_admin.
  if new.role is distinct from old.role then
    if not (
      is_org_admin()
      and old.organisation_id is not null
      and old.organisation_id = current_organisation_id()
      and coalesce(old.role, 'user') <> 'super_admin'
      and new.role in ('user', 'member_orga', 'admin_coop')
    ) then
      raise exception 'Modification du rôle non autorisée'
        using errcode = '42501';
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists trg_utilisateurs_garde_champs_sensibles on public.utilisateurs;
create trigger trg_utilisateurs_garde_champs_sensibles
  before update on public.utilisateurs
  for each row
  execute function public.tg_utilisateurs_garde_champs_sensibles();

-- ---------------------------------------------------------------------
--  2. Acceptation d'invitation — fonction dédiée
--  Remplace les deux écritures faites par le navigateur (App.tsx) :
--  rattachement du profil puis statut de l'invitation.
-- ---------------------------------------------------------------------

create or replace function public.accepter_invitation()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email       text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_utilisateur utilisateurs%rowtype;
  v_invitation  invitations%rowtype;
  v_role        text;
begin
  if auth.uid() is null or v_email = '' then
    return jsonb_build_object('statut', 'non_connecte');
  end if;

  -- Adresse confirmée obligatoire : sinon, s'inscrire avec l'e-mail d'un
  -- autre suffirait à accepter son invitation.
  if not exists (
    select 1 from auth.users
    where id = auth.uid() and email_confirmed_at is not null
  ) then
    return jsonb_build_object('statut', 'email_non_confirme');
  end if;

  select * into v_utilisateur
  from utilisateurs
  where auth_id = auth.uid()
  limit 1;

  if not found then
    return jsonb_build_object('statut', 'profil_absent');
  end if;

  if v_utilisateur.organisation_id is not null then
    return jsonb_build_object('statut', 'deja_rattache');
  end if;

  select * into v_invitation
  from invitations
  where lower(trim(email)) = v_email
    and status = 'pending'
  order by created_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('statut', 'aucune_invitation');
  end if;

  -- Une invitation ne donne jamais plus qu'un rôle d'organisation, et ne
  -- rétrograde pas un super admin.
  v_role := case
    when v_utilisateur.role = 'super_admin' then 'super_admin'
    when v_invitation.role in ('user', 'member_orga', 'admin_coop') then v_invitation.role
    else 'user'
  end;

  update utilisateurs
  set organisation_id = v_invitation.organisation_id,
      entreprise      = coalesce(v_invitation.entreprise, entreprise),
      role            = v_role,
      updated_at      = now()
  where id = v_utilisateur.id;

  update invitations
  set status = 'accepted'
  where id = v_invitation.id;

  return jsonb_build_object(
    'statut',          'acceptee',
    'invitation_id',   v_invitation.id,
    'utilisateur_id',  v_utilisateur.id,
    'organisation_id', v_invitation.organisation_id,
    'entreprise',      v_invitation.entreprise,
    'role',            v_role
  );
end
$$;

revoke all on function public.accepter_invitation() from public, anon;
grant execute on function public.accepter_invitation() to authenticated;

-- ---------------------------------------------------------------------
--  3. invitations
-- ---------------------------------------------------------------------

drop policy if exists "Admin org access own org invitations" on public.invitations;
drop policy if exists "Admins can create invitations for their org" on public.invitations;
drop policy if exists "Admins can create invitations for their organization" on public.invitations;
drop policy if exists "Admins can delete invitations of their org" on public.invitations;
drop policy if exists "Admins can view invitations of their org" on public.invitations;
drop policy if exists "Admins can view invitations of their organization" on public.invitations;
drop policy if exists "Lecture invitation par email" on public.invitations;
drop policy if exists "Les utilisateurs peuvent accepter leurs propres invitations" on public.invitations;
drop policy if exists "Les utilisateurs peuvent voir leurs propres invitations" on public.invitations;
drop policy if exists "Mise à jour invitation par email" on public.invitations;
drop policy if exists "Permettre aux Super Admins de supprimer les invitations" on public.invitations;
drop policy if exists "Super admin full access invitations" on public.invitations;
drop policy if exists "Users can read their own invitations" on public.invitations;

drop policy if exists invitations_select_admin_organisation on public.invitations;
drop policy if exists invitations_insert_admin_organisation on public.invitations;
drop policy if exists invitations_delete_admin_organisation on public.invitations;
drop policy if exists invitations_super_admin on public.invitations;

-- L'invité ne lit ni ne modifie plus la table : accepter_invitation() s'en
-- charge. Les admins d'organisation gèrent les invitations de leur seule
-- organisation, sans pouvoir inviter au rôle super_admin.
create policy invitations_select_admin_organisation on public.invitations
  for select to authenticated
  using (is_org_admin() and organisation_id = current_organisation_id());

create policy invitations_insert_admin_organisation on public.invitations
  for insert to authenticated
  with check (
    is_org_admin()
    and organisation_id = current_organisation_id()
    and coalesce(role, 'user') in ('user', 'member_orga', 'admin_coop')
    and coalesce(status, 'pending') = 'pending'
  );

create policy invitations_delete_admin_organisation on public.invitations
  for delete to authenticated
  using (is_org_admin() and organisation_id = current_organisation_id());

create policy invitations_super_admin on public.invitations
  for all to authenticated
  using (is_super_admin())
  with check (is_super_admin());

alter table public.invitations enable row level security;

-- ---------------------------------------------------------------------
--  4. diagnostics
--  Les politiques diagnostics_*_scoped / _insert_own existent déjà et
--  deviennent enfin effectives.
-- ---------------------------------------------------------------------

drop policy if exists "Acces total via API" on public.diagnostics;
drop policy if exists "Enable read access for all users" on public.diagnostics;

-- ---------------------------------------------------------------------
--  5. Vue chartes_summary
-- ---------------------------------------------------------------------

alter view public.chartes_summary set (security_invoker = on);

commit;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
--  6. Vérification — une ligne par contrôle, colonne « ok » attendue à true
-- ---------------------------------------------------------------------

select controle, ok, detail from (
  select 1 as ordre, 'RLS active sur les trois tables' as controle,
         bool_and(relrowsecurity) as ok,
         string_agg(relname || '=' || relrowsecurity, ', ') as detail
  from pg_class
  where relnamespace = 'public'::regnamespace
    and relname in ('utilisateurs', 'invitations', 'diagnostics')

  union all
  select 2, 'Aucune politique ouverte (using true) sur les trois tables',
         count(*) = 0,
         coalesce(string_agg(tablename || ' / ' || policyname, ', '), 'aucune')
  from pg_policies
  where schemaname = 'public'
    and tablename in ('utilisateurs', 'invitations', 'diagnostics')
    and (qual = 'true' or with_check = 'true')
    and policyname <> 'utilisateurs_update_super_admin'

  union all
  select 3, 'Politiques utilisateurs (8 attendues)',
         count(*) = 8, string_agg(policyname, ', ' order by policyname)
  from pg_policies
  where schemaname = 'public' and tablename = 'utilisateurs'

  union all
  select 4, 'Politiques invitations (4 attendues)',
         count(*) = 4, string_agg(policyname, ', ' order by policyname)
  from pg_policies
  where schemaname = 'public' and tablename = 'invitations'

  union all
  select 5, 'Politiques diagnostics (4 attendues)',
         count(*) = 4, string_agg(policyname, ', ' order by policyname)
  from pg_policies
  where schemaname = 'public' and tablename = 'diagnostics'

  union all
  select 6, 'Fonctions créées (3 attendues)',
         count(*) = 3, string_agg(proname, ', ' order by proname)
  from pg_proc
  where pronamespace = 'public'::regnamespace
    and proname in ('accepter_invitation', 'nombre_defis_piloterra', 'participants_sessions_animees')

  union all
  select 7, 'Trigger de garde posé',
         count(*) = 1, coalesce(string_agg(tgname, ', '), 'absent')
  from pg_trigger
  where tgrelid = 'public.utilisateurs'::regclass
    and tgname = 'trg_utilisateurs_garde_champs_sensibles'

  union all
  select 8, 'chartes_summary en security_invoker',
         coalesce(array_to_string(reloptions, ',') like '%security_invoker=on%', false),
         coalesce(array_to_string(reloptions, ','), 'aucune option')
  from pg_class
  where oid = 'public.chartes_summary'::regclass
) v
order by ordre;
