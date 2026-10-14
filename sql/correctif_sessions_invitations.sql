-- =====================================================================
--  PILOTERRA — Correctif sessions de formation + historique des invitations
--
--  Idempotent, rejouable. À exécuter en une fois dans l'éditeur SQL.
--
--  PRÉREQUIS : sql/securite_rls_utilisateurs_invitations_diagnostics.sql
--  déjà exécuté (ce script remplace accepter_invitation() et
--  participants_sessions_animees(), créées par lui).
--  ORDRE : dev d'abord ; en prod, juste après le script de sécurité.
--
--  Arbitrages du 18/09/2026 :
--    1. L'admin d'organisation n'a AUCUN droit de gestion sur les sessions
--       de formation : c'est un apprenant, il rejoint par code. Gestion
--       réservée au super admin et au formateur désigné de la session.
--       Au passage : les politiques de lecture des participants, étapes et
--       événements laissaient tout admin_coop lire les sessions de TOUTES
--       les organisations (is_org_admin() sans filtre d'organisation).
--    2. Les invitations acceptées restent dans l'historique, avec leur date
--       d'acceptation (nouvelle colonne invitations.accepted_at).
--    3. Le rôle member_orga (« Manager ») retrouve la lecture des
--       invitations de son organisation, perdue avec le script de sécurité.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
--  0. Fonction d'appui : rôle de l'utilisateur connecté
-- ---------------------------------------------------------------------

create or replace function public.current_utilisateur_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from utilisateurs where auth_id = auth.uid() limit 1
$$;

revoke all on function public.current_utilisateur_role() from public, anon;
grant execute on function public.current_utilisateur_role() to authenticated;

-- ---------------------------------------------------------------------
--  1. Sessions de formation — plus aucun droit pour l'admin d'organisation
-- ---------------------------------------------------------------------

-- sessions_formation
drop policy if exists sessions_formation_select on public.sessions_formation;
drop policy if exists sessions_formation_insert on public.sessions_formation;
drop policy if exists sessions_formation_update on public.sessions_formation;
drop policy if exists sessions_formation_delete on public.sessions_formation;

create policy sessions_formation_select on public.sessions_formation
  for select to authenticated
  using (is_super_admin() or id in (select my_session_ids()));

create policy sessions_formation_insert on public.sessions_formation
  for insert to authenticated
  with check (is_super_admin());

create policy sessions_formation_update on public.sessions_formation
  for update to authenticated
  using (is_super_admin() or is_session_formateur(id))
  with check (is_super_admin() or is_session_formateur(id));

create policy sessions_formation_delete on public.sessions_formation
  for delete to authenticated
  using (is_super_admin());

-- session_participants
-- (l'apprenant s'inscrit par join_session_by_code(), SECURITY DEFINER)
drop policy if exists session_participants_select on public.session_participants;
drop policy if exists session_participants_insert on public.session_participants;
drop policy if exists session_participants_update on public.session_participants;
drop policy if exists session_participants_delete on public.session_participants;

create policy session_participants_select on public.session_participants
  for select to authenticated
  using (
    is_super_admin()
    or user_id = current_utilisateur_id()
    or session_id in (select my_session_ids())
  );

create policy session_participants_insert on public.session_participants
  for insert to authenticated
  with check (is_super_admin() or is_session_formateur(session_id));

create policy session_participants_update on public.session_participants
  for update to authenticated
  using (is_super_admin() or is_session_formateur(session_id))
  with check (is_super_admin() or is_session_formateur(session_id));

create policy session_participants_delete on public.session_participants
  for delete to authenticated
  using (is_super_admin() or is_session_formateur(session_id));

-- session_etapes
drop policy if exists session_etapes_select on public.session_etapes;
drop policy if exists session_etapes_write on public.session_etapes;

create policy session_etapes_select on public.session_etapes
  for select to authenticated
  using (is_super_admin() or session_id in (select my_session_ids()));

create policy session_etapes_write on public.session_etapes
  for all to authenticated
  using (is_super_admin() or is_session_formateur(session_id))
  with check (is_super_admin() or is_session_formateur(session_id));

-- session_evenements (l'insertion, déjà sans admin d'organisation, est conservée)
drop policy if exists session_evenements_select on public.session_evenements;

create policy session_evenements_select on public.session_evenements
  for select to authenticated
  using (is_super_admin() or session_id in (select my_session_ids()));

-- Rattachement des productions : même règle
create or replace function public.rattacher_productions_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session   sessions_formation%rowtype;
  v_debut     timestamptz;
  v_fin       timestamptz;
  n_defis     int := 0;
  n_cas       int := 0;
  n_chartes   int := 0;
  n_prompts   int := 0;
begin
  select * into v_session from sessions_formation where id = p_session_id;
  if not found then
    raise exception 'Session introuvable';
  end if;

  -- Droits : super admin ou formateur de la session (plus l'admin
  -- d'organisation depuis le 18/09/2026)
  if not (is_super_admin() or is_session_formateur(p_session_id)) then
    raise exception 'Droits insuffisants pour rattacher les productions de cette session';
  end if;

  -- Fenêtre : du début de la session (ou de la première arrivée) à la fin
  -- de la dernière journée. Session en cours -> borne haute = maintenant.
  v_debut := coalesce(
    v_session.date_debut::timestamptz,
    (select min(date_arrivee) from session_participants where session_id = p_session_id),
    v_session.created_at
  );

  v_fin := case
    when v_session.statut = 'en_cours' then now()
    else coalesce((v_session.date_fin + 1)::timestamptz, now())
  end;

  -- Participants concernés
  create temp table if not exists _parts (user_id uuid primary key) on commit drop;
  delete from _parts;
  insert into _parts (user_id)
  select user_id from session_participants where session_id = p_session_id;

  -- Fiches Défi
  with maj as (
    update diagnostics d set session_id = p_session_id
    where d.session_id is null
      and d.user_id in (select user_id from _parts)
      and d.created_at between v_debut and v_fin
    returning 1)
  select count(*) into n_defis from maj;

  -- Cas d'usage
  with maj as (
    update cas_usage c set session_id = p_session_id
    where c.session_id is null
      and c.user_id in (select user_id from _parts)
      and c.created_at between v_debut and v_fin
    returning 1)
  select count(*) into n_cas from maj;

  -- Chartes IA (rattachées via leur auteur)
  with maj as (
    update chartes ch set session_id = p_session_id
    where ch.session_id is null
      and ch.created_by in (select user_id from _parts)
      and ch.created_at between v_debut and v_fin
    returning 1)
  select count(*) into n_chartes from maj;

  -- Prompts
  with maj as (
    update prompts p set session_id = p_session_id
    where p.session_id is null
      and p.created_by in (select user_id from _parts)
      and p.created_at between v_debut and v_fin
    returning 1)
  select count(*) into n_prompts from maj;

  return jsonb_build_object(
    'session_id', p_session_id,
    'fenetre_debut', v_debut,
    'fenetre_fin', v_fin,
    'defis', n_defis,
    'cas_usage', n_cas,
    'chartes', n_chartes,
    'prompts', n_prompts
  );
end
$$;

-- Lecture des profils des participants (vue v_session_progression) :
-- formateur de la session ou super admin (déjà couvert par sa politique).
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
$$;

revoke all on function public.participants_sessions_animees() from public, anon;
grant execute on function public.participants_sessions_animees() to authenticated;

-- ---------------------------------------------------------------------
--  2. Invitations — historique avec date d'acceptation
-- ---------------------------------------------------------------------

alter table public.invitations
  add column if not exists accepted_at timestamptz;

comment on column public.invitations.accepted_at is
  'Date d''acceptation, posée par accepter_invitation(). Nulle pour les invitations acceptées avant le 18/09/2026.';

-- Même fonction que dans le script de sécurité, plus accepted_at.
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
  set status      = 'accepted',
      accepted_at = now()
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

-- Le Manager (member_orga) consulte les invitations de son organisation,
-- sans pouvoir en créer ni en supprimer.
drop policy if exists invitations_select_manager on public.invitations;

create policy invitations_select_manager on public.invitations
  for select to authenticated
  using (
    current_utilisateur_role() = 'member_orga'
    and organisation_id = current_organisation_id()
  );

commit;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
--  3. Vérification — une ligne par contrôle, colonne « ok » attendue à true
-- ---------------------------------------------------------------------

select controle, ok, detail from (
  select 1 as ordre,
         'Plus aucune politique de session ne cite is_org_admin()' as controle,
         count(*) = 0 as ok,
         coalesce(string_agg(tablename || ' / ' || policyname, ', '), 'aucune') as detail
  from pg_policies
  where schemaname = 'public'
    and tablename in ('sessions_formation', 'session_participants', 'session_etapes', 'session_evenements')
    and (coalesce(qual, '') ilike '%is_org_admin%' or coalesce(with_check, '') ilike '%is_org_admin%')

  union all
  select 2, 'Politiques de session (12 attendues)',
         count(*) = 12, string_agg(tablename || ' / ' || policyname, ', ' order by tablename, policyname)
  from pg_policies
  where schemaname = 'public'
    and tablename in ('sessions_formation', 'session_participants', 'session_etapes', 'session_evenements')

  union all
  select 3, 'rattacher_productions_session sans admin d''organisation',
         pg_get_functiondef('public.rattacher_productions_session(uuid)'::regprocedure) not ilike '%is_org_admin%',
         'fonction remplacée'

  union all
  select 4, 'participants_sessions_animees sans admin d''organisation',
         pg_get_functiondef('public.participants_sessions_animees()'::regprocedure) not ilike '%is_org_admin%',
         'fonction remplacée'

  union all
  select 5, 'Colonne invitations.accepted_at',
         count(*) = 1, coalesce(string_agg(data_type, ', '), 'absente')
  from information_schema.columns
  where table_schema = 'public' and table_name = 'invitations' and column_name = 'accepted_at'

  union all
  select 6, 'accepter_invitation pose accepted_at',
         pg_get_functiondef('public.accepter_invitation()'::regprocedure) ilike '%accepted_at%',
         'fonction remplacée'

  union all
  select 7, 'Politiques invitations (5 attendues)',
         count(*) = 5, string_agg(policyname, ', ' order by policyname)
  from pg_policies
  where schemaname = 'public' and tablename = 'invitations'
) v
order by ordre;
