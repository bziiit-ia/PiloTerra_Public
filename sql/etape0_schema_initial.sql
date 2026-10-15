-- =====================================================================
--  PILOTERRA — ÉTAPE 0 · Schéma initial
--
--  À exécuter UNE SEULE FOIS, sur une base Supabase vierge, en une fois
--  dans l'éditeur SQL. Le script refuse de tourner si public.utilisateurs
--  existe déjà : il n'est pas rejouable sur une base en service.
--  Ordre : avant sql/etape1a3_socle_multi_marche.sql.
--
--  Reconstitué le 15/10/2026 à partir de la base Supabase Cloud, prise
--  dans son état d'avant le chantier multi-marché : on en a retiré ce
--  qu'apportent les scripts suivants (colonnes et tables de marché,
--  étapes 4 et 5a). Joué avec les scripts suivants, dans l'ordre, il
--  redonne le schéma public du dev (supabase.piloterra.me).
--
--  Contenu :
--    1. extension pg_trgm (recherche plein texte des prompts) ;
--    2. tables, vues, fonctions, triggers, index et politiques RLS du
--       schéma public ;
--    3. trigger de création du profil à l'inscription (auth.users) ;
--    4. buckets de stockage et leurs politiques ;
--    5. questions du diagnostic de maturité (référentiel).
--
--  Hors script : le trigger nouvel_utilisateur_piloterra sur auth.users,
--  qui prévient n8n d'une inscription. Son adresse dépend de
--  l'environnement ; à créer à la main, par exemple :
--    create trigger nouvel_utilisateur_piloterra after insert on auth.users
--      for each row execute function supabase_functions.http_request(
--        'https://n8n.example.com/webhook/nouvel_utilisateur_piloterra',
--        'POST', '{"Content-type":"application/json"}', '{}', '5000');
--
--  Les politiques RLS sont celles d'origine, y compris des politiques
--  trop larges : sql/securite_rls_utilisateurs_invitations_diagnostics.sql
--  et sql/etape5c_organisations.sql les remplacent. Ne pas s'arrêter à
--  ce script.
-- =====================================================================

begin;

do $$
begin
  if to_regclass('public.utilisateurs') is not null then
    raise exception 'Base non vierge : public.utilisateurs existe déjà. Ce script ne s''applique qu''à une base neuve.';
  end if;
end;
$$;

-- Les fonctions SQL citent des tables créées plus bas.
set local check_function_bodies = false;


-- ---------------------------------------------------------------------
--  1. Extension
-- ---------------------------------------------------------------------
create extension if not exists pg_trgm with schema extensions;


-- ---------------------------------------------------------------------
--  2. Schéma public
-- ---------------------------------------------------------------------

-- function : active_session_id()
CREATE FUNCTION public.active_session_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT s.id
  FROM sessions_formation s
  JOIN session_participants sp ON sp.session_id = s.id
  WHERE sp.user_id = current_utilisateur_id()
    AND s.statut = 'en_cours'
  ORDER BY s.date_debut DESC NULLS LAST, s.created_at DESC
  LIMIT 1
$$;

-- function : current_org_id()
CREATE FUNCTION public.current_org_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select organisation_id from utilisateurs where auth_id = auth.uid() limit 1
$$;

-- function : current_organisation_id()
CREATE FUNCTION public.current_organisation_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select organisation_id from utilisateurs where auth_id = auth.uid() limit 1
$$;

-- function : current_utilisateur_id()
CREATE FUNCTION public.current_utilisateur_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select id from utilisateurs where auth_id = auth.uid() limit 1
$$;

-- function : generate_session_code()
CREATE FUNCTION public.generate_session_code() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  i int;
BEGIN
  LOOP
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM sessions_formation WHERE code_acces = v_code);
  END LOOP;
  RETURN v_code;
END $$;

-- function : get_public_prompts_total()
CREATE FUNCTION public.get_public_prompts_total() RETURNS integer
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select count(*)::integer
  from prompts
  where (author_type = 'piloterra' and visibility = 'public' and status = 'published')
     or (author_type = 'organisation' and visibility = 'public' and moderation_status = 'approved' and status = 'published');
$$;

-- function : handle_new_auth_user()
CREATE FUNCTION public.handle_new_auth_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  existing_user_id UUID;
BEGIN
  -- 1. Vérifier si un utilisateur avec cet email existe déjà dans la table publique
  SELECT id INTO existing_user_id 
  FROM public.utilisateurs 
  WHERE email = NEW.email;

  IF existing_user_id IS NOT NULL THEN
    -- CAS A : L'utilisateur existait (venu via n8n). On fait la RÉCONCILIATION.
    UPDATE public.utilisateurs
    SET 
      auth_id = NEW.id,
      updated_at = NOW(),
      -- On met à jour le prénom/nom seulement s'ils sont vides dans la table publique
      prenom = COALESCE(prenom, (NEW.raw_user_meta_data->>'first_name')),
      nom = COALESCE(nom, (NEW.raw_user_meta_data->>'last_name'))
    WHERE id = existing_user_id;
    
  ELSE
    -- CAS B : Nouvel utilisateur (inscription directe sans diagnostic préalable)
    INSERT INTO public.utilisateurs (
      auth_id, 
      email, 
      prenom, 
      nom, 
      created_at, 
      updated_at
    )
    VALUES (
      NEW.id, 
      NEW.email, 
      (NEW.raw_user_meta_data->>'first_name'), 
      (NEW.raw_user_meta_data->>'last_name'), 
      NOW(), 
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$$;

-- function : handle_new_user()
CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  invitation_record RECORD;
BEGIN
  -- Vérifier s'il y a une invitation en attente pour cet email
  SELECT * INTO invitation_record 
  FROM public.invitations 
  WHERE email = NEW.email AND status = 'pending' 
  LIMIT 1;

  IF FOUND THEN
    -- Créer le profil avec le rôle et l'organisation de l'invitation
    INSERT INTO public.utilisateurs (id, auth_id, email, role, organisation_id, entreprise, provenance)
    VALUES (NEW.id, NEW.id, NEW.email, invitation_record.role, invitation_record.organisation_id, invitation_record.entreprise, 'piloterra');
    
    -- Mettre à jour le statut de l'invitation
    UPDATE public.invitations SET status = 'accepted' WHERE id = invitation_record.id;
  ELSE
    -- Créer un profil standard
    INSERT INTO public.utilisateurs (id, auth_id, email, role, provenance)
    VALUES (NEW.id, NEW.id, NEW.email, 'user', 'piloterra');
  END IF;
  
  RETURN NEW;
END;
$$;

-- function : handle_new_user_role()
CREATE FUNCTION public.handle_new_user_role() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  -- Si l'ancien auth_id était NULL ET que le nouveau ne l'est pas
  if old.auth_id is null and new.auth_id is not null then
    -- On force le role à 'user'
    new.role := 'user';
  end if;
  return new;
end;
$$;

-- function : increment_prompt_usage(uuid)
CREATE FUNCTION public.increment_prompt_usage(p_prompt_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update public.prompts set usage_count = usage_count + 1 where id = p_prompt_id;
$$;

-- function : is_org_admin()
CREATE FUNCTION public.is_org_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(
    (select role in ('admin_coop','super_admin') from utilisateurs where auth_id = auth.uid() limit 1),
    false)
$$;

-- function : is_piloterra_admin()
CREATE FUNCTION public.is_piloterra_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(
    (select role = 'super_admin' from utilisateurs where auth_id = auth.uid() limit 1),
    false)
$$;

-- function : is_session_formateur(uuid)
CREATE FUNCTION public.is_session_formateur(p_session_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT true
     FROM sessions_formation s
     WHERE s.id = p_session_id
       AND s.formateur_id = current_utilisateur_id()
     LIMIT 1),
    (SELECT true
     FROM session_participants sp
     WHERE sp.session_id = p_session_id
       AND sp.user_id = current_utilisateur_id()
       AND sp.role = 'formateur'
     LIMIT 1),
    false)
$$;

-- function : is_super_admin()
CREATE FUNCTION public.is_super_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(
    (select role = 'super_admin' from utilisateurs where auth_id = auth.uid() limit 1),
    false)
$$;

-- function : join_session_by_code(text)
CREATE FUNCTION public.join_session_by_code(p_code text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_session sessions_formation%ROWTYPE;
  v_user    uuid;
BEGIN
  v_user := current_utilisateur_id();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;

  SELECT * INTO v_session
  FROM sessions_formation
  WHERE upper(code_acces) = upper(trim(p_code))
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Code de session invalide';
  END IF;

  IF v_session.statut NOT IN ('planifiee','en_cours') THEN
    RAISE EXCEPTION 'Cette session n''accepte plus d''inscription';
  END IF;

  INSERT INTO session_participants (session_id, user_id, role, statut_inscription, date_arrivee)
  VALUES (v_session.id, v_user, 'apprenant', 'present', now())
  ON CONFLICT (session_id, user_id)
    DO UPDATE SET statut_inscription = 'present',
                  date_arrivee = COALESCE(session_participants.date_arrivee, now());

  INSERT INTO session_evenements (session_id, user_id, type_evenement)
  VALUES (v_session.id, v_user, 'session_rejointe');

  RETURN v_session.id;
END $$;

-- function : log_session_event(text, uuid, text, uuid, jsonb)
CREATE FUNCTION public.log_session_event(p_type text, p_session_id uuid DEFAULT NULL::uuid, p_objet_type text DEFAULT NULL::text, p_objet_id uuid DEFAULT NULL::uuid, p_payload jsonb DEFAULT '{}'::jsonb) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_session uuid;
  v_user    uuid;
  v_id      bigint;
BEGIN
  v_user    := current_utilisateur_id();
  v_session := COALESCE(p_session_id, active_session_id());

  IF v_session IS NULL THEN
    RETURN NULL;   -- hors session : on ne journalise pas, ce n'est pas une erreur
  END IF;

  INSERT INTO session_evenements (session_id, user_id, type_evenement, objet_type, objet_id, payload)
  VALUES (v_session, v_user, p_type, p_objet_type, p_objet_id, COALESCE(p_payload, '{}'::jsonb))
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

-- function : my_session_ids()
CREATE FUNCTION public.my_session_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT sp.session_id
  FROM session_participants sp
  WHERE sp.user_id = current_utilisateur_id()
$$;

-- function : normalize_news_title(text)
CREATE FUNCTION public.normalize_news_title(t text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select nullif(
    regexp_replace(
      lower(translate(coalesce(t, ''),
        'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ',
        'aaaaaaceeeeiiiinooooouuuuyy')),
      '[^a-z0-9]+', '', 'g'                         -- ne garde que lettres et chiffres
    ),
    ''
  )
$$;

-- function : normalize_news_url(text)
CREATE FUNCTION public.normalize_news_url(u text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $_$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            lower(btrim(coalesce(u, ''))),
            '^https?://(www\.)?', '', 'i'          -- retire le schéma et www.
          ),
          '([?&])(utm_[a-z_]+|fbclid|gclid|mc_cid|mc_eid|xtor|ref|source)=[^&]*',
          '\1', 'gi'                                -- retire les paramètres de tracking
        ),
        '[?&#]+($|[?&#])', '\2', 'g'                -- nettoie les séparateurs orphelins
      ),
      '[/?&#]+$', ''                                -- retire la ponctuation finale
    ),
    ''
  )
$_$;

-- function : piloterra_slugify(text)
CREATE FUNCTION public.piloterra_slugify(v_input text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select nullif(
    trim(both '-' from
      regexp_replace(
        regexp_replace(
          translate(
            replace(
              replace(
                replace(lower(coalesce(v_input, '')), '&', ' et '),
                'œ', 'oe'),
              'æ', 'ae'),
            'àáâãäåòóôõöøèéêëçìíîïùúûüÿñ',
            'aaaaaaooooooeeeeciiiiuuuuyn'
          ),
          '[^a-z0-9]+', '-', 'g'),
        '-{2,}', '-', 'g')
    ),
  '');
$$;

-- function : prompts_after_write_cleanup_pins()
CREATE FUNCTION public.prompts_after_write_cleanup_pins() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  -- Cas 1 : le prompt n'est plus publié (retour en brouillon).
  --         Un brouillon ne doit jamais rester recommandé, y compris pour
  --         l'organisation qui en est propriétaire.
  if new.status <> 'published' then
    delete from public.prompt_org_pins where prompt_id = new.id;
    return null;
  end if;

  -- Cas 2 : prompt publié mais dont le partage communautaire n'est plus
  --         approuvé (rejeté, ou remis en attente après modification).
  --         Les autres organisations perdent leur épingle ; l'organisation
  --         propriétaire garde la sienne, le prompt lui restant visible.
  if new.visibility = 'public' and new.moderation_status <> 'approved' then
    delete from public.prompt_org_pins
     where prompt_id = new.id
       and organisation_id is distinct from new.organisation_id;
  end if;

  return null;
end;
$$;

-- function : prompts_before_write()
CREATE FUNCTION public.prompts_before_write() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_admin_pilo boolean := public.is_piloterra_admin();
  v_admin_org  boolean := public.is_org_admin();
  v_org        uuid    := public.current_org_id();
  v_me         uuid    := public.current_utilisateur_id();
begin
  new.updated_at := now();

  -- (a) Contexte backend / éditeur SQL / seeds : aucune contrainte.
  if auth.uid() is null then
    return new;
  end if;

  -- (b) Auteur = utilisateur courant, à la création.
  if tg_op = 'INSERT' then
    new.created_by := coalesce(v_me, new.created_by);
  end if;

  if v_admin_pilo then
    -- (c) Catalogue officiel : de confiance, pas de modération.
    if new.author_type = 'piloterra' then
      new.scope             := 'organisation';
      new.organisation_id   := null;
      new.visibility        := 'public';
      new.moderation_status := 'approved';
      new.proposed_to_org   := false;
      return new;
    end if;
    -- Sinon, il agit comme un administrateur d'organisation.
  else
    new.author_type := 'organisation';
    -- Paternité forcée sur l'organisation de l'utilisateur, s'il en a une.
    new.organisation_id := v_org;
    -- (d) Un non-admin d'organisation ne peut créer que du personnel.
    if not v_admin_org then
      new.scope := 'personal';
    end if;
  end if;

  -- (e) Prompt d'ORGANISATION sans organisation rattachée : impossible.
  --     On le bascule en personnel (cas d'un admin sans organisation).
  --     NB : un prompt PERSONNEL sans organisation est légitime -> voir (f).
  if new.scope = 'organisation' and new.organisation_id is null then
    new.scope := 'personal';
  end if;

  -- (f) Prompt personnel.
  if new.scope = 'personal' then
    -- Un prompt personnel RATTACHÉ À UNE ORGANISATION reste strictement privé.
    if new.organisation_id is not null then
      new.visibility := 'private';
      if new.moderation_status = 'pending' then
        new.moderation_status := 'not_submitted';
      end if;
      return new;
    end if;

    -- Un prompt personnel SANS organisation = prompt INDIVIDUEL (utilisateur
    -- plateforme). Il peut être proposé à la communauté, avec modération.
    new.proposed_to_org := false;   -- notion réservée aux membres d'une organisation
    if new.visibility = 'public' then
      if tg_op = 'INSERT' or old.visibility is distinct from 'public' then
        new.moderation_status := 'pending';
      elsif tg_op = 'UPDATE'
            and old.moderation_status = 'approved'
            and not v_admin_pilo
            and (new.content is distinct from old.content
                 or new.title is distinct from old.title) then
        new.moderation_status := 'pending';
        new.moderation_note   := null;
      end if;
    else
      if new.moderation_status = 'pending' then
        new.moderation_status := 'not_submitted';
      end if;
    end if;
    return new;
  end if;

  -- Prompt d'organisation
  new.proposed_to_org := false;   -- notion réservée aux prompts personnels

  if new.visibility = 'public' then
    if tg_op = 'INSERT' or old.visibility is distinct from 'public' then
      -- (g) Passage privé -> public : entrée en file de validation.
      new.moderation_status := 'pending';
    elsif tg_op = 'UPDATE'
          and old.moderation_status = 'approved'
          and not v_admin_pilo
          and (new.content is distinct from old.content
               or new.title  is distinct from old.title) then
      -- (h) Un prompt public déjà validé dont le fond change repasse en file.
      new.moderation_status := 'pending';
      new.moderation_note   := null;
    end if;
  else
    if new.moderation_status = 'pending' then
      new.moderation_status := 'not_submitted';
    end if;
  end if;

  return new;
end;
$$;

-- function : rattacher_productions_session(uuid)
CREATE FUNCTION public.rattacher_productions_session(p_session_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_session   sessions_formation%ROWTYPE;
  v_debut     timestamptz;
  v_fin       timestamptz;
  n_defis     int := 0;
  n_cas       int := 0;
  n_chartes   int := 0;
  n_prompts   int := 0;
BEGIN
  SELECT * INTO v_session FROM sessions_formation WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session introuvable';
  END IF;

  -- Droits : super admin, admin de l'organisation, ou formateur de la session
  IF NOT (
    is_super_admin()
    OR (is_org_admin() AND v_session.organisation_id = current_organisation_id())
    OR is_session_formateur(p_session_id)
  ) THEN
    RAISE EXCEPTION 'Droits insuffisants pour rattacher les productions de cette session';
  END IF;

  -- Fenêtre : du début de la session (ou de la première arrivée) à la fin
  -- de la dernière journée. Session en cours -> borne haute = maintenant.
  v_debut := COALESCE(
    v_session.date_debut::timestamptz,
    (SELECT MIN(date_arrivee) FROM session_participants WHERE session_id = p_session_id),
    v_session.created_at
  );

  v_fin := CASE
    WHEN v_session.statut = 'en_cours' THEN now()
    ELSE COALESCE((v_session.date_fin + 1)::timestamptz, now())
  END;

  -- Participants concernés
  CREATE TEMP TABLE IF NOT EXISTS _parts (user_id uuid PRIMARY KEY) ON COMMIT DROP;
  DELETE FROM _parts;
  INSERT INTO _parts (user_id)
  SELECT user_id FROM session_participants WHERE session_id = p_session_id;

  -- Fiches Défi
  WITH maj AS (
    UPDATE diagnostics d SET session_id = p_session_id
    WHERE d.session_id IS NULL
      AND d.user_id IN (SELECT user_id FROM _parts)
      AND d.created_at BETWEEN v_debut AND v_fin
    RETURNING 1)
  SELECT count(*) INTO n_defis FROM maj;

  -- Cas d'usage
  WITH maj AS (
    UPDATE cas_usage c SET session_id = p_session_id
    WHERE c.session_id IS NULL
      AND c.user_id IN (SELECT user_id FROM _parts)
      AND c.created_at BETWEEN v_debut AND v_fin
    RETURNING 1)
  SELECT count(*) INTO n_cas FROM maj;

  -- Chartes IA (rattachées via leur auteur)
  WITH maj AS (
    UPDATE chartes ch SET session_id = p_session_id
    WHERE ch.session_id IS NULL
      AND ch.created_by IN (SELECT user_id FROM _parts)
      AND ch.created_at BETWEEN v_debut AND v_fin
    RETURNING 1)
  SELECT count(*) INTO n_chartes FROM maj;

  -- Prompts
  WITH maj AS (
    UPDATE prompts p SET session_id = p_session_id
    WHERE p.session_id IS NULL
      AND p.created_by IN (SELECT user_id FROM _parts)
      AND p.created_at BETWEEN v_debut AND v_fin
    RETURNING 1)
  SELECT count(*) INTO n_prompts FROM maj;

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'fenetre_debut', v_debut,
    'fenetre_fin', v_fin,
    'defis', n_defis,
    'cas_usage', n_cas,
    'chartes', n_chartes,
    'prompts', n_prompts
  );
END $$;

-- comment : FUNCTION rattacher_productions_session(p_session_id uuid)
COMMENT ON FUNCTION public.rattacher_productions_session(p_session_id uuid) IS 'Rattache a posteriori les productions des participants créées pendant la fenêtre de la session. Nécessaire car les workflows n8n écrivent en service_role, hors contexte auth.';

-- function : repair_news_metadata(jsonb)
CREATE FUNCTION public.repair_news_metadata(m jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
  brut  text;
  cle   text;
  vals  text;
  liste text[];
  res   jsonb := '{}'::jsonb;
begin
  if m is null then
    return null;
  end if;

  if jsonb_typeof(m) = 'object' then
    return m;
  end if;

  brut := m #>> '{}';

  foreach cle in array array['tagsMetiers', 'tagsOutilsIA', 'tagsOutilsMetiers'] loop
    vals := (regexp_match(brut, cle || '''?\s*:\s*\[([^\]]*)\]'))[1];

    if vals is null or btrim(vals) = '' then
      liste := array[]::text[];
    else
      liste := array(
        select btrim(x, ' ''"')
        from unnest(string_to_array(vals, ',')) as x
        where btrim(x, ' ''"') <> ''
      );
    end if;

    res := res || jsonb_build_object(cle, to_jsonb(liste));
  end loop;

  return res;
end
$$;

-- function : resolve_org_proposal(uuid)
CREATE FUNCTION public.resolve_org_proposal(p_prompt_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.is_org_admin() then
    raise exception 'Reserve aux administrateurs de l''organisation';
  end if;
  update public.prompts
     set proposed_to_org = false
   where id = p_prompt_id
     and scope = 'personal'
     and organisation_id = public.current_org_id();
end;
$$;

-- function : same_org_utilisateur_ids()
CREATE FUNCTION public.same_org_utilisateur_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select u.id
  from utilisateurs u
  where u.organisation_id is not null
    and u.organisation_id = (
      select organisation_id from utilisateurs where auth_id = auth.uid() limit 1
    )
$$;

-- function : tg_attach_active_session()
CREATE FUNCTION public.tg_attach_active_session() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.session_id IS NULL THEN
    NEW.session_id := active_session_id();
  END IF;
  RETURN NEW;
END $$;

-- function : tg_sessions_set_code()
CREATE FUNCTION public.tg_sessions_set_code() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.code_acces IS NULL THEN
    NEW.code_acces := public.generate_session_code();
  END IF;
  RETURN NEW;
END $$;

-- function : tg_sessions_set_updated_at()
CREATE FUNCTION public.tg_sessions_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- function : tg_sessions_sync_formateur()
CREATE FUNCTION public.tg_sessions_sync_formateur() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.formateur_id IS NOT NULL THEN
    INSERT INTO session_participants (session_id, user_id, role, statut_inscription)
    VALUES (NEW.id, NEW.formateur_id, 'formateur', 'inscrit')
    ON CONFLICT (session_id, user_id)
      DO UPDATE SET role = 'formateur';
  END IF;
  RETURN NEW;
END $$;

-- function : tg_slug_piloterra_resources()
CREATE FUNCTION public.tg_slug_piloterra_resources() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  v_base text;
  v_slug text;
  v_i    int := 1;
begin
  v_base := coalesce(
    public.piloterra_slugify(new.slug),
    public.piloterra_slugify(new.title),
    'ressource-' || left(replace(new.id::text, '-', ''), 8)
  );
  v_base := left(v_base, 80);
  v_slug := v_base;

  while exists (
    select 1 from public.piloterra_resources r
    where r.slug = v_slug and r.id <> new.id
  ) loop
    v_i := v_i + 1;
    v_slug := v_base || '-' || v_i;
  end loop;

  new.slug := v_slug;
  return new;
end;
$$;

-- function : tg_slug_prompts()
CREATE FUNCTION public.tg_slug_prompts() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  v_base text;
  v_slug text;
  v_i    int := 1;
begin
  v_base := coalesce(
    public.piloterra_slugify(new.slug),
    public.piloterra_slugify(new.title),
    'prompt-' || left(replace(new.id::text, '-', ''), 8)
  );
  v_base := left(v_base, 80);
  v_slug := v_base;

  while exists (
    select 1 from public.prompts p
    where p.slug = v_slug and p.id <> new.id
  ) loop
    v_i := v_i + 1;
    v_slug := v_base || '-' || v_i;
  end loop;

  new.slug := v_slug;
  return new;
end;
$$;

-- function : update_chartes_updated_at()
CREATE FUNCTION public.update_chartes_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  -- Si on passe en published, enregistrer la date
  IF NEW.status = 'published' AND OLD.status != 'published' THEN
    NEW.published_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;

-- function : update_user_provenance_from_diagnostic()
CREATE FUNCTION public.update_user_provenance_from_diagnostic() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- On met à jour la table utilisateurs
  UPDATE utilisateurs
  SET provenance = NEW.provenance
  WHERE id = NEW.user_id
    AND NEW.provenance IS NOT NULL; -- On ne met à jour que si une provenance est fournie
  
  RETURN NEW;
END;
$$;


-- table : cas_usage
CREATE TABLE public.cas_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    diagnostic_id uuid,
    organisation_id uuid,
    user_id uuid,
    status text DEFAULT 'draft'::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    titre text,
    inputs_user jsonb,
    output_agent jsonb,
    solution_reco jsonb,
    proto_prompt text,
    frugalite jsonb,
    proto_prompts jsonb DEFAULT '{}'::jsonb,
    proto_url text,
    session_id uuid
);

-- table : chartes
CREATE TABLE public.chartes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    published_at timestamp with time zone,
    status text DEFAULT 'draft'::text NOT NULL,
    version text DEFAULT '1.0'::text NOT NULL,
    title text NOT NULL,
    content jsonb,
    raw_markdown text,
    linked_challenges uuid[],
    charter_config jsonb,
    generation_metadata jsonb,
    session_id uuid,
    CONSTRAINT chartes_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
);

-- table : organisations
CREATE TABLE public.organisations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nom text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- table : utilisateurs
CREATE TABLE public.utilisateurs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    email text NOT NULL,
    prenom text,
    nom text,
    entreprise text,
    secteur_activite text,
    site_web text,
    fonction_profil text,
    auth_id uuid,
    role text DEFAULT 'visitor'::text NOT NULL,
    maturity_results jsonb,
    provenance text DEFAULT 'piloterra'::text,
    organisation_id uuid,
    last_seen timestamp with time zone DEFAULT now(),
    CONSTRAINT utilisateurs_role_check CHECK ((role = ANY (ARRAY['user'::text, 'member_orga'::text, 'super_admin'::text, 'visitor'::text, 'admin_coop'::text])))
);

-- view : chartes_summary
CREATE VIEW public.chartes_summary AS
 SELECT c.id,
    c.organisation_id,
    o.nom AS organisation_nom,
    c.title,
    c.version,
    c.status,
    c.created_at,
    c.published_at,
    ((u.nom || ' '::text) || u.prenom) AS auteur,
    array_length(c.linked_challenges, 1) AS nb_defis
   FROM ((public.chartes c
     LEFT JOIN public.organisations o ON ((o.id = c.organisation_id)))
     LEFT JOIN public.utilisateurs u ON ((u.id = c.created_by)));

-- table : communications_log
CREATE TABLE public.communications_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    user_id uuid NOT NULL,
    email_address text NOT NULL,
    campaign_type text NOT NULL,
    brevo_message_id text,
    status text DEFAULT 'sent'::text,
    opened_at timestamp with time zone,
    clicked_at timestamp with time zone,
    ai_prompt_used text,
    ai_content_generated text
);

-- table : diagnostics
CREATE TABLE public.diagnostics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    user_id uuid NOT NULL,
    inputs_client jsonb,
    output_agent_defi jsonb,
    output_agent_matrice jsonb,
    enrichissement_scraper jsonb,
    provenance text DEFAULT 'piloterra'::text,
    session_id uuid
);

-- comment : COLUMN diagnostics.session_id
COMMENT ON COLUMN public.diagnostics.session_id IS 'Session de formation d''origine. NULL = usage hors formation (cas majoritaire à terme).';

-- table : diagnostics_custom_matrices
CREATE TABLE public.diagnostics_custom_matrices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    diagnostic_id uuid NOT NULL,
    charge_de_compte_id uuid,
    entreprise_cible text,
    politique_interne text NOT NULL,
    resultat_matrice jsonb NOT NULL
);

-- comment : TABLE diagnostics_custom_matrices
COMMENT ON TABLE public.diagnostics_custom_matrices IS 'Stocke les évaluations IA sur-mesure basées sur les politiques internes des entreprises cibles.';

-- table : invitations
CREATE TABLE public.invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    organisation_id uuid,
    entreprise text,
    role text DEFAULT 'user'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- table : maturity_questions
CREATE TABLE public.maturity_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question_text text NOT NULL,
    category text,
    order_index integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    question_type text DEFAULT 'text'::text,
    options jsonb DEFAULT '[]'::jsonb
);

-- table : news_dedup
CREATE TABLE public.news_dedup (
    url_key text NOT NULL,
    title_key text,
    source text,
    title text,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    seen_count integer DEFAULT 1 NOT NULL,
    decision text DEFAULT 'pending'::text NOT NULL,
    resource_id uuid
);

-- comment : TABLE news_dedup
COMMENT ON TABLE public.news_dedup IS 'Mémoire de collecte des news. Empêche la recollecte d''articles déjà vus, y compris après purge de piloterra_resources.';

-- comment : COLUMN news_dedup.decision
COMMENT ON COLUMN public.news_dedup.decision IS 'pending = collecté, en attente d''arbitrage | published = publié sur le portail | rejected = écarté manuellement | purged = supprimé lors du nettoyage initial';

-- table : piloterra_agent_metrics
CREATE TABLE public.piloterra_agent_metrics (
    trace_id character varying NOT NULL,
    created_at timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    session_id text,
    auth_user_id uuid,
    agent_id uuid,
    model text,
    input_tokens bigint,
    output_tokens bigint,
    total_tokens bigint,
    total_cost_usd numeric,
    latency_s numeric,
    emissions_gco2eq numeric,
    equivalence_water_liters double precision,
    equivalence_car_km double precision,
    equivalence_tgv_km double precision,
    equivalence_smartphone double precision,
    metadata jsonb,
    started_at timestamp with time zone
);

-- table : piloterra_bookmarks
CREATE TABLE public.piloterra_bookmarks (
    user_id uuid NOT NULL,
    resource_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

-- table : piloterra_platform_metrics
CREATE TABLE public.piloterra_platform_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_user_id uuid,
    page_path text NOT NULL,
    bytes_transferred bigint NOT NULL,
    co2_grams double precision NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

-- table : piloterra_resources
CREATE TABLE public.piloterra_resources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    type text NOT NULL,
    title text NOT NULL,
    description text,
    image_url text,
    external_link text,
    metadata jsonb DEFAULT '{}'::jsonb,
    published boolean DEFAULT false,
    started_at timestamp without time zone DEFAULT now(),
    slug text,
    seo_title text,
    seo_description text,
    contenu_long text,
    seo_indexable boolean DEFAULT false NOT NULL,
    seo_updated_at timestamp with time zone,
    CONSTRAINT piloterra_resources_type_check CHECK ((type = ANY (ARRAY['tool'::text, 'news'::text, 'usecase'::text, 'elearning'::text, 'learning'::text, 'data'::text, 'agent'::text])))
);

-- table : prompt_favorites
CREATE TABLE public.prompt_favorites (
    user_id uuid NOT NULL,
    prompt_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- comment : TABLE prompt_favorites
COMMENT ON TABLE public.prompt_favorites IS 'Favoris personnels (user_id = utilisateurs.id). Distinct des recommandations d''organisation.';

-- table : prompt_org_pins
CREATE TABLE public.prompt_org_pins (
    organisation_id uuid NOT NULL,
    prompt_id uuid NOT NULL,
    pinned_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- comment : TABLE prompt_org_pins
COMMENT ON TABLE public.prompt_org_pins IS 'Prompts épinglés par une organisation (recommandations visibles de tous ses membres).';

-- table : prompts
CREATE TABLE public.prompts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    title text NOT NULL,
    description text,
    content text NOT NULL,
    target_tool text NOT NULL,
    category text NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    variables jsonb DEFAULT '[]'::jsonb NOT NULL,
    frugality_level smallint DEFAULT 2 NOT NULL,
    recommended_model text,
    frugality_tip text,
    author_type text DEFAULT 'organisation'::text NOT NULL,
    organisation_id uuid,
    created_by uuid,
    status text DEFAULT 'draft'::text NOT NULL,
    visibility text DEFAULT 'private'::text NOT NULL,
    moderation_status text DEFAULT 'not_submitted'::text NOT NULL,
    moderation_note text,
    usage_count integer DEFAULT 0 NOT NULL,
    source_cas_usage_id uuid,
    scope text DEFAULT 'organisation'::text NOT NULL,
    proposed_to_org boolean DEFAULT false NOT NULL,
    slug text,
    seo_title text,
    seo_description text,
    contenu_long text,
    seo_indexable boolean DEFAULT false NOT NULL,
    seo_updated_at timestamp with time zone,
    session_id uuid,
    CONSTRAINT prompts_author_type_check CHECK ((author_type = ANY (ARRAY['piloterra'::text, 'organisation'::text]))),
    CONSTRAINT prompts_frugality_level_check CHECK (((frugality_level >= 1) AND (frugality_level <= 3))),
    CONSTRAINT prompts_moderation_status_check CHECK ((moderation_status = ANY (ARRAY['not_submitted'::text, 'pending'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT prompts_scope_check CHECK ((scope = ANY (ARRAY['personal'::text, 'organisation'::text]))),
    CONSTRAINT prompts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text]))),
    CONSTRAINT prompts_visibility_check CHECK ((visibility = ANY (ARRAY['private'::text, 'public'::text])))
);

-- comment : TABLE prompts
COMMENT ON TABLE public.prompts IS 'Bibliothèque de prompts : catalogue PiloTerra, prompts d''organisation, prompts personnels.';

-- table : session_etapes
CREATE TABLE public.session_etapes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    session_id uuid NOT NULL,
    titre text NOT NULL,
    module_id uuid,
    ordre integer DEFAULT 0 NOT NULL,
    jour text,
    demi_journee text,
    duree_prevue_min integer,
    statut text DEFAULT 'a_venir'::text NOT NULL,
    debut_reel timestamp with time zone,
    fin_reelle timestamp with time zone,
    action_attendue text,
    CONSTRAINT session_etapes_action_chk CHECK (((action_attendue IS NULL) OR (action_attendue = ANY (ARRAY['creer_compte'::text, 'positionnement'::text, 'lancer_defi'::text, 'creer_cas_usage'::text, 'generer_proto_prompt'::text, 'audit_frugalite'::text, 'generer_charte'::text, 'consulter_module'::text, 'exercice_libre'::text])))),
    CONSTRAINT session_etapes_demi_journee_chk CHECK (((demi_journee IS NULL) OR (demi_journee = ANY (ARRAY['matin'::text, 'apres_midi'::text])))),
    CONSTRAINT session_etapes_statut_chk CHECK ((statut = ANY (ARRAY['a_venir'::text, 'en_cours'::text, 'terminee'::text, 'sautee'::text])))
);

-- comment : TABLE session_etapes
COMMENT ON TABLE public.session_etapes IS 'Déroulé ordonné d''une session. Instancié depuis un parcours-type à l''étape 1.';

-- table : session_evenements
CREATE TABLE public.session_evenements (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    session_id uuid NOT NULL,
    user_id uuid,
    etape_id uuid,
    type_evenement text NOT NULL,
    objet_type text,
    objet_id uuid,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT session_evenements_type_chk CHECK ((type_evenement = ANY (ARRAY['session_rejointe'::text, 'compte_cree'::text, 'positionnement_fait'::text, 'defi_lance'::text, 'defi_termine'::text, 'cas_usage_cree'::text, 'proto_prompt_genere'::text, 'audit_frugalite_fait'::text, 'charte_generee'::text, 'prompt_cree'::text, 'module_consulte'::text, 'etape_ouverte'::text, 'etape_terminee'::text])))
);

-- comment : TABLE session_evenements
COMMENT ON TABLE public.session_evenements IS 'Journal d''activité de la session. Source de vérité de la console animateur et du dossier de preuve.';

-- sequence : session_evenements_id_seq
ALTER TABLE public.session_evenements ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.session_evenements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

-- table : session_participants
CREATE TABLE public.session_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    session_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'apprenant'::text NOT NULL,
    statut_inscription text DEFAULT 'inscrit'::text NOT NULL,
    date_arrivee timestamp with time zone,
    date_sortie timestamp with time zone,
    presence jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT session_participants_role_chk CHECK ((role = ANY (ARRAY['apprenant'::text, 'formateur'::text, 'observateur'::text]))),
    CONSTRAINT session_participants_statut_chk CHECK ((statut_inscription = ANY (ARRAY['invite'::text, 'inscrit'::text, 'present'::text, 'absent'::text, 'annule'::text])))
);

-- comment : TABLE session_participants
COMMENT ON TABLE public.session_participants IS 'Rattachement d''un utilisateur à une session, avec son rôle et sa présence.';

-- table : sessions_formation
CREATE TABLE public.sessions_formation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    organisation_id uuid NOT NULL,
    titre text NOT NULL,
    description text,
    formateur_id uuid,
    formateur_externe text,
    date_debut date,
    date_fin date,
    modalite text DEFAULT 'presentiel'::text NOT NULL,
    lieu text,
    statut text DEFAULT 'brouillon'::text NOT NULL,
    code_acces text,
    parcours_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT sessions_formation_dates_chk CHECK (((date_fin IS NULL) OR (date_debut IS NULL) OR (date_fin >= date_debut))),
    CONSTRAINT sessions_formation_modalite_chk CHECK ((modalite = ANY (ARRAY['presentiel'::text, 'distanciel'::text, 'mixte'::text]))),
    CONSTRAINT sessions_formation_statut_chk CHECK ((statut = ANY (ARRAY['brouillon'::text, 'planifiee'::text, 'en_cours'::text, 'terminee'::text, 'archivee'::text])))
);

-- comment : TABLE sessions_formation
COMMENT ON TABLE public.sessions_formation IS 'Session de formation : un moment collectif rattachant une organisation, un formateur, des apprenants et un déroulé.';

-- comment : COLUMN sessions_formation.code_acces
COMMENT ON COLUMN public.sessions_formation.code_acces IS 'Code court unique saisi par l''apprenant pour rejoindre la session.';

-- comment : COLUMN sessions_formation.parcours_id
COMMENT ON COLUMN public.sessions_formation.parcours_id IS 'Parcours-type modèle. FK vers parcours_types ajoutée à l''étape 1.';

-- table : solutions_catalogue
CREATE TABLE public.solutions_catalogue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    nom text NOT NULL,
    description text,
    categorie text,
    tags text[],
    fiche jsonb,
    actif boolean DEFAULT true
);

-- view : v_seo_pages
CREATE VIEW public.v_seo_pages AS
 SELECT 'agent'::text AS source_type,
    r.id,
    'agents'::text AS rubrique,
    ('/agents/'::text || r.slug) AS url_path,
    r.slug,
    COALESCE(NULLIF(r.seo_title, ''::text), r.title) AS seo_title,
    COALESCE(NULLIF(r.seo_description, ''::text), r.description) AS seo_description,
    r.title AS titre,
    r.description AS description_courte,
    r.contenu_long,
    r.image_url,
    r.external_link,
    COALESCE(r.seo_updated_at, r.created_at) AS lastmod,
    COALESCE(r.metadata, '{}'::jsonb) AS extra
   FROM public.piloterra_resources r
  WHERE ((r.type = 'agent'::text) AND (r.published IS TRUE) AND (r.seo_indexable IS TRUE) AND (r.slug IS NOT NULL))
UNION ALL
 SELECT 'formation'::text AS source_type,
    r.id,
    'formations'::text AS rubrique,
    ('/formations/'::text || r.slug) AS url_path,
    r.slug,
    COALESCE(NULLIF(r.seo_title, ''::text), r.title) AS seo_title,
    COALESCE(NULLIF(r.seo_description, ''::text), r.description) AS seo_description,
    r.title AS titre,
    r.description AS description_courte,
    r.contenu_long,
    r.image_url,
    r.external_link,
    COALESCE(r.seo_updated_at, r.created_at) AS lastmod,
    COALESCE(r.metadata, '{}'::jsonb) AS extra
   FROM public.piloterra_resources r
  WHERE ((r.type = 'learning'::text) AND (r.published IS TRUE) AND (r.seo_indexable IS TRUE) AND (r.slug IS NOT NULL))
UNION ALL
 SELECT 'source_donnees'::text AS source_type,
    r.id,
    'sources-de-donnees'::text AS rubrique,
    ('/sources-de-donnees/'::text || r.slug) AS url_path,
    r.slug,
    COALESCE(NULLIF(r.seo_title, ''::text), r.title) AS seo_title,
    COALESCE(NULLIF(r.seo_description, ''::text), r.description) AS seo_description,
    r.title AS titre,
    r.description AS description_courte,
    r.contenu_long,
    r.image_url,
    r.external_link,
    COALESCE(r.seo_updated_at, r.created_at) AS lastmod,
    COALESCE(r.metadata, '{}'::jsonb) AS extra
   FROM public.piloterra_resources r
  WHERE ((r.type = 'data'::text) AND (r.published IS TRUE) AND (r.seo_indexable IS TRUE) AND (r.slug IS NOT NULL))
UNION ALL
 SELECT 'prompt'::text AS source_type,
    p.id,
    'prompts'::text AS rubrique,
    ('/prompts/'::text || p.slug) AS url_path,
    p.slug,
    COALESCE(NULLIF(p.seo_title, ''::text), p.title) AS seo_title,
    COALESCE(NULLIF(p.seo_description, ''::text), p.description) AS seo_description,
    p.title AS titre,
    p.description AS description_courte,
    p.contenu_long,
    NULL::text AS image_url,
    NULL::text AS external_link,
    COALESCE(p.seo_updated_at, p.updated_at, p.created_at) AS lastmod,
    jsonb_build_object('category', p.category, 'target_tool', p.target_tool, 'tags', p.tags, 'recommended_model', p.recommended_model, 'frugality_level', p.frugality_level, 'frugality_tip', p.frugality_tip, 'content', p.content) AS extra
   FROM public.prompts p
  WHERE ((p.visibility = 'public'::text) AND (p.status = 'published'::text) AND (p.moderation_status = 'approved'::text) AND (p.seo_indexable IS TRUE) AND (p.slug IS NOT NULL));

-- view : v_session_progression
CREATE VIEW public.v_session_progression WITH (security_invoker='on') AS
 SELECT sp.session_id,
    sp.user_id,
    u.prenom,
    u.nom,
    u.email,
    u.fonction_profil,
    sp.role,
    sp.statut_inscription,
    sp.date_arrivee,
    (u.maturity_results IS NOT NULL) AS positionnement_fait,
    count(DISTINCT d.id) AS nb_defis,
    count(DISTINCT c.id) AS nb_cas_usage,
    count(DISTINCT c.id) FILTER (WHERE (c.proto_prompts <> '{}'::jsonb)) AS nb_proto_prompts,
    count(DISTINCT c.id) FILTER (WHERE (c.frugalite IS NOT NULL)) AS nb_audits_frugalite,
    max(e.created_at) AS derniere_activite
   FROM ((((public.session_participants sp
     JOIN public.utilisateurs u ON ((u.id = sp.user_id)))
     LEFT JOIN public.diagnostics d ON (((d.session_id = sp.session_id) AND (d.user_id = sp.user_id))))
     LEFT JOIN public.cas_usage c ON (((c.session_id = sp.session_id) AND (c.user_id = sp.user_id))))
     LEFT JOIN public.session_evenements e ON (((e.session_id = sp.session_id) AND (e.user_id = sp.user_id))))
  GROUP BY sp.session_id, sp.user_id, u.prenom, u.nom, u.email, u.fonction_profil, sp.role, sp.statut_inscription, sp.date_arrivee, u.maturity_results;

-- view : v_sessions_synthese
CREATE VIEW public.v_sessions_synthese WITH (security_invoker='on') AS
 SELECT s.id,
    s.titre,
    s.statut,
    s.date_debut,
    s.date_fin,
    s.code_acces,
    o.nom AS organisation,
    count(*) FILTER (WHERE (sp.role = 'apprenant'::text)) AS nb_apprenants,
    count(*) FILTER (WHERE (sp.statut_inscription = 'present'::text)) AS nb_presents,
    ( SELECT count(*) AS count
           FROM public.diagnostics d
          WHERE (d.session_id = s.id)) AS nb_defis,
    ( SELECT count(*) AS count
           FROM public.cas_usage c
          WHERE (c.session_id = s.id)) AS nb_cas_usage,
    ( SELECT count(*) AS count
           FROM public.chartes ch
          WHERE (ch.session_id = s.id)) AS nb_chartes,
    s.organisation_id
   FROM ((public.sessions_formation s
     JOIN public.organisations o ON ((o.id = s.organisation_id)))
     LEFT JOIN public.session_participants sp ON ((sp.session_id = s.id)))
  GROUP BY s.id, s.titre, s.statut, s.date_debut, s.date_fin, s.code_acces, o.nom, s.organisation_id;

-- constraint : cas_usage cas_usage_pkey
ALTER TABLE ONLY public.cas_usage
    ADD CONSTRAINT cas_usage_pkey PRIMARY KEY (id);

-- constraint : chartes chartes_pkey
ALTER TABLE ONLY public.chartes
    ADD CONSTRAINT chartes_pkey PRIMARY KEY (id);

-- constraint : communications_log communications_log_pkey
ALTER TABLE ONLY public.communications_log
    ADD CONSTRAINT communications_log_pkey PRIMARY KEY (id);

-- constraint : diagnostics_custom_matrices diagnostics_custom_matrices_pkey
ALTER TABLE ONLY public.diagnostics_custom_matrices
    ADD CONSTRAINT diagnostics_custom_matrices_pkey PRIMARY KEY (id);

-- constraint : diagnostics diagnostics_pkey
ALTER TABLE ONLY public.diagnostics
    ADD CONSTRAINT diagnostics_pkey PRIMARY KEY (id);

-- constraint : invitations invitations_pkey
ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);

-- constraint : maturity_questions maturity_questions_pkey
ALTER TABLE ONLY public.maturity_questions
    ADD CONSTRAINT maturity_questions_pkey PRIMARY KEY (id);

-- constraint : news_dedup news_dedup_pkey
ALTER TABLE ONLY public.news_dedup
    ADD CONSTRAINT news_dedup_pkey PRIMARY KEY (url_key);

-- constraint : organisations organisations_nom_key
ALTER TABLE ONLY public.organisations
    ADD CONSTRAINT organisations_nom_key UNIQUE (nom);

-- constraint : organisations organisations_pkey
ALTER TABLE ONLY public.organisations
    ADD CONSTRAINT organisations_pkey PRIMARY KEY (id);

-- constraint : piloterra_agent_metrics piloterra_agent_metrics_pkey
ALTER TABLE ONLY public.piloterra_agent_metrics
    ADD CONSTRAINT piloterra_agent_metrics_pkey PRIMARY KEY (trace_id);

-- constraint : piloterra_bookmarks piloterra_bookmarks_pkey
ALTER TABLE ONLY public.piloterra_bookmarks
    ADD CONSTRAINT piloterra_bookmarks_pkey PRIMARY KEY (user_id, resource_id);

-- constraint : piloterra_platform_metrics piloterra_platform_metrics_pkey
ALTER TABLE ONLY public.piloterra_platform_metrics
    ADD CONSTRAINT piloterra_platform_metrics_pkey PRIMARY KEY (id);

-- constraint : piloterra_resources piloterra_resources_pkey
ALTER TABLE ONLY public.piloterra_resources
    ADD CONSTRAINT piloterra_resources_pkey PRIMARY KEY (id);

-- constraint : prompt_favorites prompt_favorites_pkey
ALTER TABLE ONLY public.prompt_favorites
    ADD CONSTRAINT prompt_favorites_pkey PRIMARY KEY (user_id, prompt_id);

-- constraint : prompt_org_pins prompt_org_pins_pkey
ALTER TABLE ONLY public.prompt_org_pins
    ADD CONSTRAINT prompt_org_pins_pkey PRIMARY KEY (organisation_id, prompt_id);

-- constraint : prompts prompts_pkey
ALTER TABLE ONLY public.prompts
    ADD CONSTRAINT prompts_pkey PRIMARY KEY (id);

-- constraint : session_etapes session_etapes_pkey
ALTER TABLE ONLY public.session_etapes
    ADD CONSTRAINT session_etapes_pkey PRIMARY KEY (id);

-- constraint : session_evenements session_evenements_pkey
ALTER TABLE ONLY public.session_evenements
    ADD CONSTRAINT session_evenements_pkey PRIMARY KEY (id);

-- constraint : session_participants session_participants_pkey
ALTER TABLE ONLY public.session_participants
    ADD CONSTRAINT session_participants_pkey PRIMARY KEY (id);

-- constraint : session_participants session_participants_unique
ALTER TABLE ONLY public.session_participants
    ADD CONSTRAINT session_participants_unique UNIQUE (session_id, user_id);

-- constraint : sessions_formation sessions_formation_code_acces_key
ALTER TABLE ONLY public.sessions_formation
    ADD CONSTRAINT sessions_formation_code_acces_key UNIQUE (code_acces);

-- constraint : sessions_formation sessions_formation_pkey
ALTER TABLE ONLY public.sessions_formation
    ADD CONSTRAINT sessions_formation_pkey PRIMARY KEY (id);

-- constraint : solutions_catalogue solutions_catalogue_pkey
ALTER TABLE ONLY public.solutions_catalogue
    ADD CONSTRAINT solutions_catalogue_pkey PRIMARY KEY (id);

-- constraint : utilisateurs utilisateurs_auth_id_key
ALTER TABLE ONLY public.utilisateurs
    ADD CONSTRAINT utilisateurs_auth_id_key UNIQUE (auth_id);

-- constraint : utilisateurs utilisateurs_email_key
ALTER TABLE ONLY public.utilisateurs
    ADD CONSTRAINT utilisateurs_email_key UNIQUE (email);

-- constraint : utilisateurs utilisateurs_pkey
ALTER TABLE ONLY public.utilisateurs
    ADD CONSTRAINT utilisateurs_pkey PRIMARY KEY (id);

-- index : idx_cas_usage_diag
CREATE INDEX idx_cas_usage_diag ON public.cas_usage USING btree (diagnostic_id);

-- index : idx_cas_usage_org
CREATE INDEX idx_cas_usage_org ON public.cas_usage USING btree (organisation_id);

-- index : idx_cas_usage_session_id
CREATE INDEX idx_cas_usage_session_id ON public.cas_usage USING btree (session_id);

-- index : idx_cas_usage_status
CREATE INDEX idx_cas_usage_status ON public.cas_usage USING btree (status);

-- index : idx_chartes_created_at
CREATE INDEX idx_chartes_created_at ON public.chartes USING btree (created_at DESC);

-- index : idx_chartes_organisation
CREATE INDEX idx_chartes_organisation ON public.chartes USING btree (organisation_id);

-- index : idx_chartes_session_id
CREATE INDEX idx_chartes_session_id ON public.chartes USING btree (session_id);

-- index : idx_chartes_status
CREATE INDEX idx_chartes_status ON public.chartes USING btree (status);

-- index : idx_custom_matrices_charge_compte
CREATE INDEX idx_custom_matrices_charge_compte ON public.diagnostics_custom_matrices USING btree (charge_de_compte_id);

-- index : idx_custom_matrices_diagnostic_id
CREATE INDEX idx_custom_matrices_diagnostic_id ON public.diagnostics_custom_matrices USING btree (diagnostic_id);

-- index : idx_diagnostics_session_id
CREATE INDEX idx_diagnostics_session_id ON public.diagnostics USING btree (session_id);

-- index : idx_diagnostics_user
CREATE INDEX idx_diagnostics_user ON public.diagnostics USING btree (user_id);

-- index : idx_invitations_email
CREATE INDEX idx_invitations_email ON public.invitations USING btree (email);

-- index : idx_invitations_org
CREATE INDEX idx_invitations_org ON public.invitations USING btree (organisation_id);

-- index : idx_piloterra_resources_slug
CREATE UNIQUE INDEX idx_piloterra_resources_slug ON public.piloterra_resources USING btree (slug) WHERE (slug IS NOT NULL);

-- index : idx_platform_metrics_date
CREATE INDEX idx_platform_metrics_date ON public.piloterra_platform_metrics USING btree (created_at);

-- index : idx_platform_metrics_user
CREATE INDEX idx_platform_metrics_user ON public.piloterra_platform_metrics USING btree (auth_user_id);

-- index : idx_prompts_session_id
CREATE INDEX idx_prompts_session_id ON public.prompts USING btree (session_id);

-- index : idx_prompts_slug
CREATE UNIQUE INDEX idx_prompts_slug ON public.prompts USING btree (slug) WHERE (slug IS NOT NULL);

-- index : idx_session_etapes_session_ordre
CREATE INDEX idx_session_etapes_session_ordre ON public.session_etapes USING btree (session_id, ordre);

-- index : idx_session_evenements_session_date
CREATE INDEX idx_session_evenements_session_date ON public.session_evenements USING btree (session_id, created_at DESC);

-- index : idx_session_evenements_type
CREATE INDEX idx_session_evenements_type ON public.session_evenements USING btree (type_evenement);

-- index : idx_session_evenements_user
CREATE INDEX idx_session_evenements_user ON public.session_evenements USING btree (user_id);

-- index : idx_session_participants_session
CREATE INDEX idx_session_participants_session ON public.session_participants USING btree (session_id);

-- index : idx_session_participants_user
CREATE INDEX idx_session_participants_user ON public.session_participants USING btree (user_id);

-- index : idx_sessions_formation_dates
CREATE INDEX idx_sessions_formation_dates ON public.sessions_formation USING btree (date_debut, date_fin);

-- index : idx_sessions_formation_formateur
CREATE INDEX idx_sessions_formation_formateur ON public.sessions_formation USING btree (formateur_id);

-- index : idx_sessions_formation_org
CREATE INDEX idx_sessions_formation_org ON public.sessions_formation USING btree (organisation_id);

-- index : idx_sessions_formation_statut
CREATE INDEX idx_sessions_formation_statut ON public.sessions_formation USING btree (statut);

-- index : idx_utilisateurs_auth_id
CREATE INDEX idx_utilisateurs_auth_id ON public.utilisateurs USING btree (auth_id);

-- index : news_dedup_seen_idx
CREATE INDEX news_dedup_seen_idx ON public.news_dedup USING btree (last_seen_at DESC);

-- index : news_dedup_title_key_idx
CREATE INDEX news_dedup_title_key_idx ON public.news_dedup USING btree (title_key);

-- index : piloterra_resources_news_url_uniq
CREATE UNIQUE INDEX piloterra_resources_news_url_uniq ON public.piloterra_resources USING btree (public.normalize_news_url(external_link)) WHERE ((type = 'news'::text) AND (external_link IS NOT NULL));

-- index : prompt_org_pins_org_idx
CREATE INDEX prompt_org_pins_org_idx ON public.prompt_org_pins USING btree (organisation_id);

-- index : prompts_author_idx
CREATE INDEX prompts_author_idx ON public.prompts USING btree (author_type, status);

-- index : prompts_category_idx
CREATE INDEX prompts_category_idx ON public.prompts USING btree (category);

-- index : prompts_org_idx
CREATE INDEX prompts_org_idx ON public.prompts USING btree (organisation_id);

-- index : prompts_proposed_idx
CREATE INDEX prompts_proposed_idx ON public.prompts USING btree (organisation_id, proposed_to_org) WHERE (proposed_to_org = true);

-- index : prompts_scope_creator_idx
CREATE INDEX prompts_scope_creator_idx ON public.prompts USING btree (scope, created_by);

-- index : prompts_search_idx
CREATE INDEX prompts_search_idx ON public.prompts USING gin ((((((COALESCE(title, ''::text) || ' '::text) || COALESCE(description, ''::text)) || ' '::text) || COALESCE(content, ''::text))) extensions.gin_trgm_ops);

-- index : prompts_source_cas_idx
CREATE INDEX prompts_source_cas_idx ON public.prompts USING btree (source_cas_usage_id);

-- index : prompts_tags_idx
CREATE INDEX prompts_tags_idx ON public.prompts USING gin (tags);

-- index : prompts_tool_idx
CREATE INDEX prompts_tool_idx ON public.prompts USING btree (target_tool);

-- index : prompts_visibility_idx
CREATE INDEX prompts_visibility_idx ON public.prompts USING btree (visibility, moderation_status, status);

-- trigger : utilisateurs on_auth_id_set
CREATE TRIGGER on_auth_id_set BEFORE UPDATE ON public.utilisateurs FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- trigger : diagnostics tr_after_diagnostic_insert
CREATE TRIGGER tr_after_diagnostic_insert AFTER INSERT ON public.diagnostics FOR EACH ROW EXECUTE FUNCTION public.update_user_provenance_from_diagnostic();

-- trigger : cas_usage trg_cas_usage_attach_session
CREATE TRIGGER trg_cas_usage_attach_session BEFORE INSERT ON public.cas_usage FOR EACH ROW EXECUTE FUNCTION public.tg_attach_active_session();

-- trigger : chartes trg_chartes_attach_session
CREATE TRIGGER trg_chartes_attach_session BEFORE INSERT ON public.chartes FOR EACH ROW EXECUTE FUNCTION public.tg_attach_active_session();

-- trigger : chartes trg_chartes_updated_at
CREATE TRIGGER trg_chartes_updated_at BEFORE UPDATE ON public.chartes FOR EACH ROW EXECUTE FUNCTION public.update_chartes_updated_at();

-- trigger : diagnostics trg_diagnostics_attach_session
CREATE TRIGGER trg_diagnostics_attach_session BEFORE INSERT ON public.diagnostics FOR EACH ROW EXECUTE FUNCTION public.tg_attach_active_session();

-- trigger : prompts trg_prompts_attach_session
CREATE TRIGGER trg_prompts_attach_session BEFORE INSERT ON public.prompts FOR EACH ROW EXECUTE FUNCTION public.tg_attach_active_session();

-- trigger : prompts trg_prompts_before_write
CREATE TRIGGER trg_prompts_before_write BEFORE INSERT OR UPDATE ON public.prompts FOR EACH ROW EXECUTE FUNCTION public.prompts_before_write();

-- trigger : prompts trg_prompts_cleanup_pins
CREATE TRIGGER trg_prompts_cleanup_pins AFTER UPDATE ON public.prompts FOR EACH ROW EXECUTE FUNCTION public.prompts_after_write_cleanup_pins();

-- trigger : session_etapes trg_session_etapes_updated_at
CREATE TRIGGER trg_session_etapes_updated_at BEFORE UPDATE ON public.session_etapes FOR EACH ROW EXECUTE FUNCTION public.tg_sessions_set_updated_at();

-- trigger : session_participants trg_session_participants_updated_at
CREATE TRIGGER trg_session_participants_updated_at BEFORE UPDATE ON public.session_participants FOR EACH ROW EXECUTE FUNCTION public.tg_sessions_set_updated_at();

-- trigger : sessions_formation trg_sessions_formation_code
CREATE TRIGGER trg_sessions_formation_code BEFORE INSERT ON public.sessions_formation FOR EACH ROW EXECUTE FUNCTION public.tg_sessions_set_code();

-- trigger : sessions_formation trg_sessions_formation_sync_formateur
CREATE TRIGGER trg_sessions_formation_sync_formateur AFTER INSERT OR UPDATE OF formateur_id ON public.sessions_formation FOR EACH ROW EXECUTE FUNCTION public.tg_sessions_sync_formateur();

-- trigger : sessions_formation trg_sessions_formation_updated_at
CREATE TRIGGER trg_sessions_formation_updated_at BEFORE UPDATE ON public.sessions_formation FOR EACH ROW EXECUTE FUNCTION public.tg_sessions_set_updated_at();

-- trigger : piloterra_resources trg_slug_piloterra_resources
CREATE TRIGGER trg_slug_piloterra_resources BEFORE INSERT OR UPDATE ON public.piloterra_resources FOR EACH ROW EXECUTE FUNCTION public.tg_slug_piloterra_resources();

-- trigger : prompts trg_slug_prompts
CREATE TRIGGER trg_slug_prompts BEFORE INSERT OR UPDATE ON public.prompts FOR EACH ROW EXECUTE FUNCTION public.tg_slug_prompts();

-- fk constraint : cas_usage cas_usage_diagnostic_id_fkey
ALTER TABLE ONLY public.cas_usage
    ADD CONSTRAINT cas_usage_diagnostic_id_fkey FOREIGN KEY (diagnostic_id) REFERENCES public.diagnostics(id) ON DELETE SET NULL;

-- fk constraint : cas_usage cas_usage_organisation_id_fkey
ALTER TABLE ONLY public.cas_usage
    ADD CONSTRAINT cas_usage_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.organisations(id) ON DELETE CASCADE;

-- fk constraint : cas_usage cas_usage_session_id_fkey
ALTER TABLE ONLY public.cas_usage
    ADD CONSTRAINT cas_usage_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions_formation(id) ON DELETE SET NULL;

-- fk constraint : cas_usage cas_usage_user_id_fkey
ALTER TABLE ONLY public.cas_usage
    ADD CONSTRAINT cas_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.utilisateurs(id) ON DELETE SET NULL;

-- fk constraint : chartes chartes_created_by_fkey
ALTER TABLE ONLY public.chartes
    ADD CONSTRAINT chartes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.utilisateurs(id);

-- fk constraint : chartes chartes_organisation_id_fkey
ALTER TABLE ONLY public.chartes
    ADD CONSTRAINT chartes_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.organisations(id) ON DELETE CASCADE;

-- fk constraint : chartes chartes_session_id_fkey
ALTER TABLE ONLY public.chartes
    ADD CONSTRAINT chartes_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions_formation(id) ON DELETE SET NULL;

-- fk constraint : communications_log communications_log_user_id_fkey
ALTER TABLE ONLY public.communications_log
    ADD CONSTRAINT communications_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.utilisateurs(id);

-- fk constraint : diagnostics_custom_matrices diagnostics_custom_matrices_diagnostic_id_fkey
ALTER TABLE ONLY public.diagnostics_custom_matrices
    ADD CONSTRAINT diagnostics_custom_matrices_diagnostic_id_fkey FOREIGN KEY (diagnostic_id) REFERENCES public.diagnostics(id) ON DELETE CASCADE;

-- fk constraint : diagnostics diagnostics_session_id_fkey
ALTER TABLE ONLY public.diagnostics
    ADD CONSTRAINT diagnostics_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions_formation(id) ON DELETE SET NULL;

-- fk constraint : diagnostics diagnostics_user_id_fkey
ALTER TABLE ONLY public.diagnostics
    ADD CONSTRAINT diagnostics_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.utilisateurs(id) ON DELETE CASCADE;

-- fk constraint : invitations invitations_created_by_fkey
ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint : invitations invitations_organisation_id_fkey
ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.organisations(id) ON DELETE CASCADE;

-- fk constraint : piloterra_agent_metrics piloterra_agent_metrics_agent_id_fkey
ALTER TABLE ONLY public.piloterra_agent_metrics
    ADD CONSTRAINT piloterra_agent_metrics_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.piloterra_resources(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- fk constraint : piloterra_agent_metrics piloterra_agent_metrics_auth_user_id_fkey
ALTER TABLE ONLY public.piloterra_agent_metrics
    ADD CONSTRAINT piloterra_agent_metrics_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- fk constraint : piloterra_agent_metrics piloterra_agent_metrics_auth_user_id_fkey1
ALTER TABLE ONLY public.piloterra_agent_metrics
    ADD CONSTRAINT piloterra_agent_metrics_auth_user_id_fkey1 FOREIGN KEY (auth_user_id) REFERENCES public.utilisateurs(auth_id) ON UPDATE CASCADE ON DELETE CASCADE;

-- fk constraint : piloterra_bookmarks piloterra_bookmarks_resource_id_fkey
ALTER TABLE ONLY public.piloterra_bookmarks
    ADD CONSTRAINT piloterra_bookmarks_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.piloterra_resources(id) ON DELETE CASCADE;

-- fk constraint : piloterra_bookmarks piloterra_bookmarks_user_id_fkey
ALTER TABLE ONLY public.piloterra_bookmarks
    ADD CONSTRAINT piloterra_bookmarks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- fk constraint : piloterra_platform_metrics piloterra_platform_metrics_auth_user_id_fkey
ALTER TABLE ONLY public.piloterra_platform_metrics
    ADD CONSTRAINT piloterra_platform_metrics_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- fk constraint : prompt_favorites prompt_favorites_prompt_id_fkey
ALTER TABLE ONLY public.prompt_favorites
    ADD CONSTRAINT prompt_favorites_prompt_id_fkey FOREIGN KEY (prompt_id) REFERENCES public.prompts(id) ON DELETE CASCADE;

-- fk constraint : prompt_favorites prompt_favorites_user_id_fkey
ALTER TABLE ONLY public.prompt_favorites
    ADD CONSTRAINT prompt_favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.utilisateurs(id) ON DELETE CASCADE;

-- fk constraint : prompt_org_pins prompt_org_pins_organisation_id_fkey
ALTER TABLE ONLY public.prompt_org_pins
    ADD CONSTRAINT prompt_org_pins_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.organisations(id) ON DELETE CASCADE;

-- fk constraint : prompt_org_pins prompt_org_pins_pinned_by_fkey
ALTER TABLE ONLY public.prompt_org_pins
    ADD CONSTRAINT prompt_org_pins_pinned_by_fkey FOREIGN KEY (pinned_by) REFERENCES public.utilisateurs(id) ON DELETE SET NULL;

-- fk constraint : prompt_org_pins prompt_org_pins_prompt_id_fkey
ALTER TABLE ONLY public.prompt_org_pins
    ADD CONSTRAINT prompt_org_pins_prompt_id_fkey FOREIGN KEY (prompt_id) REFERENCES public.prompts(id) ON DELETE CASCADE;

-- fk constraint : prompts prompts_created_by_fkey
ALTER TABLE ONLY public.prompts
    ADD CONSTRAINT prompts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.utilisateurs(id) ON DELETE SET NULL;

-- fk constraint : prompts prompts_organisation_id_fkey
ALTER TABLE ONLY public.prompts
    ADD CONSTRAINT prompts_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.organisations(id) ON DELETE CASCADE;

-- fk constraint : prompts prompts_session_id_fkey
ALTER TABLE ONLY public.prompts
    ADD CONSTRAINT prompts_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions_formation(id) ON DELETE SET NULL;

-- fk constraint : session_etapes session_etapes_session_id_fkey
ALTER TABLE ONLY public.session_etapes
    ADD CONSTRAINT session_etapes_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions_formation(id) ON DELETE CASCADE;

-- fk constraint : session_evenements session_evenements_etape_id_fkey
ALTER TABLE ONLY public.session_evenements
    ADD CONSTRAINT session_evenements_etape_id_fkey FOREIGN KEY (etape_id) REFERENCES public.session_etapes(id) ON DELETE SET NULL;

-- fk constraint : session_evenements session_evenements_session_id_fkey
ALTER TABLE ONLY public.session_evenements
    ADD CONSTRAINT session_evenements_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions_formation(id) ON DELETE CASCADE;

-- fk constraint : session_evenements session_evenements_user_id_fkey
ALTER TABLE ONLY public.session_evenements
    ADD CONSTRAINT session_evenements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.utilisateurs(id) ON DELETE SET NULL;

-- fk constraint : session_participants session_participants_session_id_fkey
ALTER TABLE ONLY public.session_participants
    ADD CONSTRAINT session_participants_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions_formation(id) ON DELETE CASCADE;

-- fk constraint : session_participants session_participants_user_id_fkey
ALTER TABLE ONLY public.session_participants
    ADD CONSTRAINT session_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.utilisateurs(id) ON DELETE CASCADE;

-- fk constraint : sessions_formation sessions_formation_formateur_id_fkey
ALTER TABLE ONLY public.sessions_formation
    ADD CONSTRAINT sessions_formation_formateur_id_fkey FOREIGN KEY (formateur_id) REFERENCES public.utilisateurs(id) ON DELETE SET NULL;

-- fk constraint : sessions_formation sessions_formation_organisation_id_fkey
ALTER TABLE ONLY public.sessions_formation
    ADD CONSTRAINT sessions_formation_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.organisations(id) ON DELETE CASCADE;

-- fk constraint : utilisateurs utilisateurs_auth_id_fkey
ALTER TABLE ONLY public.utilisateurs
    ADD CONSTRAINT utilisateurs_auth_id_fkey FOREIGN KEY (auth_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint : utilisateurs utilisateurs_organisation_id_fkey
ALTER TABLE ONLY public.utilisateurs
    ADD CONSTRAINT utilisateurs_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.organisations(id) ON DELETE SET NULL;

-- policy : diagnostics Acces total via API
CREATE POLICY "Acces total via API" ON public.diagnostics USING (true);

-- policy : utilisateurs Acces total via API
CREATE POLICY "Acces total via API" ON public.utilisateurs USING (true);

-- policy : invitations Admin org access own org invitations
CREATE POLICY "Admin org access own org invitations" ON public.invitations TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.utilisateurs
  WHERE ((utilisateurs.id = auth.uid()) AND (utilisateurs.role = 'admin_coop'::text) AND (utilisateurs.organisation_id = invitations.organisation_id)))));

-- policy : invitations Admins can create invitations for their org
CREATE POLICY "Admins can create invitations for their org" ON public.invitations FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.utilisateurs
  WHERE ((utilisateurs.auth_id = auth.uid()) AND (utilisateurs.role = ANY (ARRAY['admin_coop'::text, 'super_admin'::text])) AND (utilisateurs.organisation_id = utilisateurs.organisation_id)))));

-- policy : invitations Admins can create invitations for their organization
CREATE POLICY "Admins can create invitations for their organization" ON public.invitations FOR INSERT WITH CHECK ((auth.uid() IN ( SELECT utilisateurs.auth_id
   FROM public.utilisateurs
  WHERE ((utilisateurs.organisation_id = invitations.organisation_id) AND (utilisateurs.role = ANY (ARRAY['admin_coop'::text, 'super_admin'::text]))))));

-- policy : invitations Admins can delete invitations of their org
CREATE POLICY "Admins can delete invitations of their org" ON public.invitations FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.utilisateurs
  WHERE ((utilisateurs.auth_id = auth.uid()) AND (utilisateurs.role = ANY (ARRAY['admin_coop'::text, 'super_admin'::text])) AND (utilisateurs.organisation_id = invitations.organisation_id)))));

-- policy : invitations Admins can view invitations of their org
CREATE POLICY "Admins can view invitations of their org" ON public.invitations FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.utilisateurs
  WHERE ((utilisateurs.auth_id = auth.uid()) AND (utilisateurs.role = ANY (ARRAY['admin_coop'::text, 'super_admin'::text])) AND (utilisateurs.organisation_id = invitations.organisation_id)))));

-- policy : invitations Admins can view invitations of their organization
CREATE POLICY "Admins can view invitations of their organization" ON public.invitations FOR SELECT USING ((auth.uid() IN ( SELECT utilisateurs.auth_id
   FROM public.utilisateurs
  WHERE ((utilisateurs.organisation_id = invitations.organisation_id) AND (utilisateurs.role = ANY (ARRAY['admin_coop'::text, 'super_admin'::text]))))));

-- policy : organisations Enable insert for authenticated users only
CREATE POLICY "Enable insert for authenticated users only" ON public.organisations FOR INSERT TO authenticated WITH CHECK (true);

-- policy : diagnostics Enable read access for all users
CREATE POLICY "Enable read access for all users" ON public.diagnostics FOR SELECT USING (true);

-- policy : utilisateurs L'utilisateur modifie son propre profil
CREATE POLICY "L'utilisateur modifie son propre profil" ON public.utilisateurs FOR UPDATE USING ((auth.uid() = auth_id));

-- policy : utilisateurs L'utilisateur voit son propre profil
CREATE POLICY "L'utilisateur voit son propre profil" ON public.utilisateurs FOR SELECT USING ((auth.uid() = auth_id));

-- policy : invitations Lecture invitation par email
CREATE POLICY "Lecture invitation par email" ON public.invitations FOR SELECT TO authenticated USING ((lower(email) = lower((auth.jwt() ->> 'email'::text))));

-- policy : organisations Les organisations sont visibles par tous les utilisateurs authe
CREATE POLICY "Les organisations sont visibles par tous les utilisateurs authe" ON public.organisations FOR SELECT TO authenticated USING (true);

-- policy : invitations Les utilisateurs peuvent accepter leurs propres invitations
CREATE POLICY "Les utilisateurs peuvent accepter leurs propres invitations" ON public.invitations FOR UPDATE TO authenticated USING ((lower(email) = lower((auth.jwt() ->> 'email'::text)))) WITH CHECK ((lower(email) = lower((auth.jwt() ->> 'email'::text))));

-- policy : invitations Les utilisateurs peuvent voir leurs propres invitations
CREATE POLICY "Les utilisateurs peuvent voir leurs propres invitations" ON public.invitations FOR SELECT TO authenticated USING ((lower(email) = lower((auth.jwt() ->> 'email'::text))));

-- policy : invitations Mise à jour invitation par email
CREATE POLICY "Mise à jour invitation par email" ON public.invitations FOR UPDATE TO authenticated USING ((lower(email) = lower((auth.jwt() ->> 'email'::text))));

-- policy : chartes Permettre aux Super Admins de supprimer les chartes
CREATE POLICY "Permettre aux Super Admins de supprimer les chartes" ON public.chartes FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.utilisateurs
  WHERE ((utilisateurs.auth_id = auth.uid()) AND (utilisateurs.role = 'super_admin'::text)))));

-- policy : invitations Permettre aux Super Admins de supprimer les invitations
CREATE POLICY "Permettre aux Super Admins de supprimer les invitations" ON public.invitations FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.utilisateurs
  WHERE ((utilisateurs.auth_id = auth.uid()) AND (utilisateurs.role = 'super_admin'::text)))));

-- policy : organisations Permettre la suppression des organisations aux Super Admins
CREATE POLICY "Permettre la suppression des organisations aux Super Admins" ON public.organisations FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.utilisateurs
  WHERE ((utilisateurs.auth_id = auth.uid()) AND (utilisateurs.role = 'super_admin'::text)))));

-- policy : organisations Seuls les super_admin peuvent modifier les organisations
CREATE POLICY "Seuls les super_admin peuvent modifier les organisations" ON public.organisations TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.utilisateurs
  WHERE ((utilisateurs.id = auth.uid()) AND (utilisateurs.role = 'super_admin'::text)))));

-- policy : invitations Super admin full access invitations
CREATE POLICY "Super admin full access invitations" ON public.invitations TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.utilisateurs
  WHERE ((utilisateurs.id = auth.uid()) AND (utilisateurs.role = 'super_admin'::text)))));

-- policy : piloterra_platform_metrics Users can insert their own platform metrics
CREATE POLICY "Users can insert their own platform metrics" ON public.piloterra_platform_metrics FOR INSERT WITH CHECK ((auth.uid() = auth_user_id));

-- policy : invitations Users can read their own invitations
CREATE POLICY "Users can read their own invitations" ON public.invitations FOR SELECT TO authenticated USING ((email = (( SELECT users.email
   FROM auth.users
  WHERE (users.id = auth.uid())))::text));

-- policy : piloterra_platform_metrics Users can view their own platform metrics
CREATE POLICY "Users can view their own platform metrics" ON public.piloterra_platform_metrics FOR SELECT USING ((auth.uid() = auth_user_id));

-- row security : cas_usage
ALTER TABLE public.cas_usage ENABLE ROW LEVEL SECURITY;

-- policy : cas_usage cas_usage_delete_admin
CREATE POLICY cas_usage_delete_admin ON public.cas_usage FOR DELETE USING ((organisation_id IN ( SELECT utilisateurs.organisation_id
   FROM public.utilisateurs
  WHERE ((utilisateurs.auth_id = auth.uid()) AND (utilisateurs.role = ANY (ARRAY['admin_coop'::text, 'super_admin'::text]))))));

-- policy : cas_usage cas_usage_insert_admin
CREATE POLICY cas_usage_insert_admin ON public.cas_usage FOR INSERT WITH CHECK ((organisation_id IN ( SELECT utilisateurs.organisation_id
   FROM public.utilisateurs
  WHERE ((utilisateurs.auth_id = auth.uid()) AND (utilisateurs.role = ANY (ARRAY['admin_coop'::text, 'super_admin'::text]))))));

-- policy : cas_usage cas_usage_select_org
CREATE POLICY cas_usage_select_org ON public.cas_usage FOR SELECT USING ((organisation_id IN ( SELECT utilisateurs.organisation_id
   FROM public.utilisateurs
  WHERE (utilisateurs.auth_id = auth.uid()))));

-- policy : cas_usage cas_usage_update_admin
CREATE POLICY cas_usage_update_admin ON public.cas_usage FOR UPDATE USING ((organisation_id IN ( SELECT utilisateurs.organisation_id
   FROM public.utilisateurs
  WHERE ((utilisateurs.auth_id = auth.uid()) AND (utilisateurs.role = ANY (ARRAY['admin_coop'::text, 'super_admin'::text]))))));

-- row security : chartes
ALTER TABLE public.chartes ENABLE ROW LEVEL SECURITY;

-- policy : chartes chartes_admin_all
CREATE POLICY chartes_admin_all ON public.chartes USING ((organisation_id IN ( SELECT utilisateurs.organisation_id
   FROM public.utilisateurs
  WHERE ((utilisateurs.auth_id = auth.uid()) AND (utilisateurs.role = ANY (ARRAY['admin_coop'::text, 'super_admin'::text])))))) WITH CHECK ((organisation_id IN ( SELECT utilisateurs.organisation_id
   FROM public.utilisateurs
  WHERE ((utilisateurs.auth_id = auth.uid()) AND (utilisateurs.role = ANY (ARRAY['admin_coop'::text, 'super_admin'::text]))))));

-- policy : chartes chartes_read_published
CREATE POLICY chartes_read_published ON public.chartes FOR SELECT USING (((status = 'published'::text) AND (organisation_id IN ( SELECT utilisateurs.organisation_id
   FROM public.utilisateurs
  WHERE (utilisateurs.auth_id = auth.uid())))));

-- policy : chartes chartes_superadmin
CREATE POLICY chartes_superadmin ON public.chartes USING ((EXISTS ( SELECT 1
   FROM public.utilisateurs
  WHERE ((utilisateurs.auth_id = auth.uid()) AND (utilisateurs.role = 'super_admin'::text)))));

-- row security : diagnostics
ALTER TABLE public.diagnostics ENABLE ROW LEVEL SECURITY;

-- policy : diagnostics diagnostics_delete_scoped
CREATE POLICY diagnostics_delete_scoped ON public.diagnostics FOR DELETE TO authenticated USING ((public.is_super_admin() OR (user_id = public.current_utilisateur_id())));

-- policy : diagnostics diagnostics_insert_own
CREATE POLICY diagnostics_insert_own ON public.diagnostics FOR INSERT TO authenticated WITH CHECK ((user_id = public.current_utilisateur_id()));

-- policy : diagnostics diagnostics_select_scoped
CREATE POLICY diagnostics_select_scoped ON public.diagnostics FOR SELECT TO authenticated USING ((public.is_super_admin() OR (user_id = public.current_utilisateur_id()) OR (user_id IN ( SELECT public.same_org_utilisateur_ids() AS same_org_utilisateur_ids))));

-- policy : diagnostics diagnostics_update_scoped
CREATE POLICY diagnostics_update_scoped ON public.diagnostics FOR UPDATE TO authenticated USING ((public.is_super_admin() OR (user_id = public.current_utilisateur_id()) OR (public.is_org_admin() AND (user_id IN ( SELECT public.same_org_utilisateur_ids() AS same_org_utilisateur_ids))))) WITH CHECK ((public.is_super_admin() OR (user_id = public.current_utilisateur_id()) OR (public.is_org_admin() AND (user_id IN ( SELECT public.same_org_utilisateur_ids() AS same_org_utilisateur_ids)))));

-- policy : prompt_favorites favorites_all
CREATE POLICY favorites_all ON public.prompt_favorites TO authenticated USING ((user_id = public.current_utilisateur_id())) WITH CHECK ((user_id = public.current_utilisateur_id()));

-- policy : prompt_org_pins org_pins_delete
CREATE POLICY org_pins_delete ON public.prompt_org_pins FOR DELETE TO authenticated USING (((organisation_id = public.current_org_id()) AND public.is_org_admin()));

-- policy : prompt_org_pins org_pins_insert
CREATE POLICY org_pins_insert ON public.prompt_org_pins FOR INSERT TO authenticated WITH CHECK (((organisation_id = public.current_org_id()) AND public.is_org_admin()));

-- policy : prompt_org_pins org_pins_select
CREATE POLICY org_pins_select ON public.prompt_org_pins FOR SELECT TO authenticated USING ((organisation_id = public.current_org_id()));

-- row security : organisations
ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;

-- row security : piloterra_platform_metrics
ALTER TABLE public.piloterra_platform_metrics ENABLE ROW LEVEL SECURITY;

-- row security : prompt_favorites
ALTER TABLE public.prompt_favorites ENABLE ROW LEVEL SECURITY;

-- row security : prompt_org_pins
ALTER TABLE public.prompt_org_pins ENABLE ROW LEVEL SECURITY;

-- row security : prompts
ALTER TABLE public.prompts ENABLE ROW LEVEL SECURITY;

-- policy : prompts prompts_delete
CREATE POLICY prompts_delete ON public.prompts FOR DELETE TO authenticated USING ((public.is_piloterra_admin() OR ((scope = 'personal'::text) AND (created_by = public.current_utilisateur_id())) OR ((scope = 'organisation'::text) AND (organisation_id = public.current_org_id()) AND public.is_org_admin())));

-- policy : prompts prompts_insert
CREATE POLICY prompts_insert ON public.prompts FOR INSERT TO authenticated WITH CHECK ((public.is_piloterra_admin() OR (scope = 'personal'::text) OR ((scope = 'organisation'::text) AND public.is_org_admin())));

-- policy : prompts prompts_select
CREATE POLICY prompts_select ON public.prompts FOR SELECT TO authenticated USING ((((author_type = 'piloterra'::text) AND (status = 'published'::text)) OR ((scope = 'organisation'::text) AND (organisation_id = public.current_org_id())) OR ((scope = 'personal'::text) AND (created_by = public.current_utilisateur_id())) OR ((scope = 'personal'::text) AND (proposed_to_org = true) AND (organisation_id = public.current_org_id()) AND public.is_org_admin()) OR ((visibility = 'public'::text) AND (moderation_status = 'approved'::text) AND (status = 'published'::text)) OR public.is_piloterra_admin()));

-- policy : prompts prompts_update
CREATE POLICY prompts_update ON public.prompts FOR UPDATE TO authenticated USING ((public.is_piloterra_admin() OR ((scope = 'personal'::text) AND (created_by = public.current_utilisateur_id())) OR ((scope = 'organisation'::text) AND (organisation_id = public.current_org_id()) AND public.is_org_admin()))) WITH CHECK ((public.is_piloterra_admin() OR ((scope = 'personal'::text) AND (created_by = public.current_utilisateur_id())) OR ((scope = 'organisation'::text) AND (organisation_id = public.current_org_id()) AND public.is_org_admin())));

-- row security : session_etapes
ALTER TABLE public.session_etapes ENABLE ROW LEVEL SECURITY;

-- policy : session_etapes session_etapes_select
CREATE POLICY session_etapes_select ON public.session_etapes FOR SELECT TO authenticated USING ((public.is_super_admin() OR (session_id IN ( SELECT public.my_session_ids() AS my_session_ids)) OR public.is_org_admin()));

-- policy : session_etapes session_etapes_write
CREATE POLICY session_etapes_write ON public.session_etapes TO authenticated USING ((public.is_super_admin() OR public.is_org_admin() OR public.is_session_formateur(session_id))) WITH CHECK ((public.is_super_admin() OR public.is_org_admin() OR public.is_session_formateur(session_id)));

-- row security : session_evenements
ALTER TABLE public.session_evenements ENABLE ROW LEVEL SECURITY;

-- policy : session_evenements session_evenements_insert
CREATE POLICY session_evenements_insert ON public.session_evenements FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR ((user_id = public.current_utilisateur_id()) AND (session_id IN ( SELECT public.my_session_ids() AS my_session_ids))) OR public.is_session_formateur(session_id)));

-- policy : session_evenements session_evenements_select
CREATE POLICY session_evenements_select ON public.session_evenements FOR SELECT TO authenticated USING ((public.is_super_admin() OR (session_id IN ( SELECT public.my_session_ids() AS my_session_ids)) OR public.is_org_admin()));

-- row security : session_participants
ALTER TABLE public.session_participants ENABLE ROW LEVEL SECURITY;

-- policy : session_participants session_participants_delete
CREATE POLICY session_participants_delete ON public.session_participants FOR DELETE TO authenticated USING ((public.is_super_admin() OR public.is_org_admin() OR public.is_session_formateur(session_id)));

-- policy : session_participants session_participants_insert
CREATE POLICY session_participants_insert ON public.session_participants FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR public.is_org_admin() OR public.is_session_formateur(session_id)));

-- policy : session_participants session_participants_select
CREATE POLICY session_participants_select ON public.session_participants FOR SELECT TO authenticated USING ((public.is_super_admin() OR (user_id = public.current_utilisateur_id()) OR (session_id IN ( SELECT public.my_session_ids() AS my_session_ids)) OR public.is_org_admin()));

-- policy : session_participants session_participants_update
CREATE POLICY session_participants_update ON public.session_participants FOR UPDATE TO authenticated USING ((public.is_super_admin() OR public.is_org_admin() OR public.is_session_formateur(session_id))) WITH CHECK ((public.is_super_admin() OR public.is_org_admin() OR public.is_session_formateur(session_id)));

-- row security : sessions_formation
ALTER TABLE public.sessions_formation ENABLE ROW LEVEL SECURITY;

-- policy : sessions_formation sessions_formation_delete
CREATE POLICY sessions_formation_delete ON public.sessions_formation FOR DELETE TO authenticated USING ((public.is_super_admin() OR (public.is_org_admin() AND (organisation_id = public.current_organisation_id()))));

-- policy : sessions_formation sessions_formation_insert
CREATE POLICY sessions_formation_insert ON public.sessions_formation FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR (public.is_org_admin() AND (organisation_id = public.current_organisation_id()))));

-- policy : sessions_formation sessions_formation_select
CREATE POLICY sessions_formation_select ON public.sessions_formation FOR SELECT TO authenticated USING ((public.is_super_admin() OR (id IN ( SELECT public.my_session_ids() AS my_session_ids)) OR (public.is_org_admin() AND (organisation_id = public.current_organisation_id()))));

-- policy : sessions_formation sessions_formation_update
CREATE POLICY sessions_formation_update ON public.sessions_formation FOR UPDATE TO authenticated USING ((public.is_super_admin() OR (public.is_org_admin() AND (organisation_id = public.current_organisation_id())) OR public.is_session_formateur(id))) WITH CHECK ((public.is_super_admin() OR (public.is_org_admin() AND (organisation_id = public.current_organisation_id())) OR public.is_session_formateur(id)));

-- row security : utilisateurs
ALTER TABLE public.utilisateurs ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
--  3. Profil créé à l'inscription
-- ---------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();


-- ---------------------------------------------------------------------
--  4. Stockage
--     PiloTerra : logos, portraits, documents publics.
--     documents_organisations : un dossier par organisation (son id).
--     subventions : privé.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('PiloTerra', 'PiloTerra', true),
  ('documents_organisations', 'documents_organisations', true),
  ('subventions', 'subventions', false)
on conflict (id) do nothing;

drop policy if exists "Enable read access for all users" on storage.buckets;
create policy "Enable read access for all users" on storage.buckets as PERMISSIVE for SELECT to public
  using (true);

drop policy if exists "Enable read access for all users" on storage.objects;
create policy "Enable read access for all users" on storage.objects as PERMISSIVE for SELECT to public
  using (true);

drop policy if exists "Lecture documents organisation" on storage.objects;
create policy "Lecture documents organisation" on storage.objects as PERMISSIVE for SELECT to authenticated
  using (((bucket_id = 'documents_organisations'::text) AND ((storage.foldername(name))[1] = ( SELECT (utilisateurs.organisation_id)::text AS organisation_id
   FROM public.utilisateurs
  WHERE (utilisateurs.id = auth.uid())
 LIMIT 1))));

drop policy if exists "Mise à jour documents organisation" on storage.objects;
create policy "Mise à jour documents organisation" on storage.objects as PERMISSIVE for UPDATE to authenticated
  using (((bucket_id = 'documents_organisations'::text) AND ((storage.foldername(name))[1] = ( SELECT (utilisateurs.organisation_id)::text AS organisation_id
   FROM public.utilisateurs
  WHERE (utilisateurs.id = auth.uid())
 LIMIT 1))));

drop policy if exists "Suppression documents organisation" on storage.objects;
create policy "Suppression documents organisation" on storage.objects as PERMISSIVE for DELETE to authenticated
  using (((bucket_id = 'documents_organisations'::text) AND ((storage.foldername(name))[1] = ( SELECT (utilisateurs.organisation_id)::text AS organisation_id
   FROM public.utilisateurs
  WHERE (utilisateurs.id = auth.uid())
 LIMIT 1)) AND (( SELECT utilisateurs.role
   FROM public.utilisateurs
  WHERE (utilisateurs.id = auth.uid())
 LIMIT 1) = ANY (ARRAY['admin_coop'::text, 'super_admin'::text]))));

drop policy if exists "Upload documents organisation" on storage.objects;
create policy "Upload documents organisation" on storage.objects as PERMISSIVE for INSERT to authenticated
  with check (((bucket_id = 'documents_organisations'::text) AND ((storage.foldername(name))[1] = ( SELECT (utilisateurs.organisation_id)::text AS organisation_id
   FROM public.utilisateurs
  WHERE (utilisateurs.id = auth.uid())
 LIMIT 1))));


-- ---------------------------------------------------------------------
--  5. Questions du diagnostic de maturité
--     Retouchées ensuite par sql/etape10_questions_maturite_tri_marche.sql.
-- ---------------------------------------------------------------------
insert into public.maturity_questions (id, question_text, category, order_index, is_active, created_at, question_type, options) VALUES ('64755728-6619-444b-ad4c-e3f9ac5f0053', 'Utilisez-vous déjà des outils d''aide à la décision (OAD) ou des capteurs connectés ?', NULL, 6, true, '2026-02-05 16:52:14.705157+00', 'choice', '["Non, je me fie à mon observation terrain et mon expérience.", "Oui, j''ai une station météo ou un GPS tracteur (usage basique).", "Oui, j''utilise des OAD (maladies, irrigation) avec alertes.", "Oui, nous avons un écosystème connecté (IoT, imagerie sat, modulation intra-parcellaire)."]');
insert into public.maturity_questions (id, question_text, category, order_index, is_active, created_at, question_type, options) VALUES ('a74a4a4a-e6e0-4cc0-9011-64621a8cefd9', 'Avez-vous déjà utilisé des outils d''IA générative (ChatGPT, Copilot, Midjourney...) ?', NULL, 1, true, '2026-02-05 16:52:47.509429+00', 'choice', '["Jamais ou je ne sais pas ce que c''est.", "J''ai testé une ou deux fois pour m''amuser.", "Je l''utilise parfois pour rédiger des mails ou synthétiser des textes.", "Je l''utilise quotidiennement dans mes process métier."]');
insert into public.maturity_questions (id, question_text, category, order_index, is_active, created_at, question_type, options) VALUES ('2ff9eb4e-076f-4760-9d34-0e483c89d181', 'Quelle place occupe le numérique dans votre stratégie actuelle ?', NULL, 2, true, '2026-02-05 16:43:02.283643+00', 'choice', '["C''est un mal nécessaire, on l''utilise pour l''administratif obligatoire.", "On a quelques outils (logiciel parcellaire, météo) mais peu connectés.", "C''est un levier de performance, nous testons régulièrement de nouveaux outils.", "C''est central : nos décisions sont pilotées par la donnée."]');
insert into public.maturity_questions (id, question_text, category, order_index, is_active, created_at, question_type, options) VALUES ('24995d59-8543-45b4-a0d9-40857cbd36ee', 'Si nous devions analyser vos données demain, comment qualifieriez-vous leur qualité ?', NULL, 5, true, '2026-02-05 16:51:04.241894+00', 'choice', '["Inexistantes ou incomplètes.", "Hétérogènes (unités différentes, erreurs de saisie, doublons).", "Correctes, mais demandent un nettoyage manuel.", "Standardisées, propres et mises à jour en temps réel."]');
insert into public.maturity_questions (id, question_text, category, order_index, is_active, created_at, question_type, options) VALUES ('c8d7b215-25c5-4319-a2c1-971149cedd95', 'Comment sont stockées vos données aujourd''hui (historique cultural, clients, stocks...) ?', NULL, 4, true, '2026-02-05 16:50:25.809533+00', 'choice', '["Papier, carnet de plaine manuscrit ou mémoire humaine.", "Excel, fichiers éparpillés sur plusieurs ordinateurs.", "Logiciels métiers (ERP, FMIS, CRM) mais qui ne se parlent pas (silos).", "Cloud centralisé, API ou Data Warehouse structuré."]');
insert into public.maturity_questions (id, question_text, category, order_index, is_active, created_at, question_type, options) VALUES ('3c1d3456-0ac4-45ae-a7c7-b583d698a783', 'Concernant l''Intelligence Artificielle, quel est votre sentiment dominant ?', NULL, 3, true, '2026-02-05 16:49:44.206219+00', 'choice', '["Scepticisme (c''est du marketing / ça fait peur).", "Curiosité (j''en entends parler, je veux comprendre).", "Opportunisme (je cherche des cas d''usage pour gagner du temps/argent).", "Conviction (c''est l''avenir inévitable de l''agriculture)."]');
insert into public.maturity_questions (id, question_text, category, order_index, is_active, created_at, question_type, options) VALUES ('68888c1f-8d81-490f-b817-690ad0200f07', 'En toute franchise, qu''est-ce qui vous a empêché jusqu''à maintenant d''aller plus loin sur le numérique ou l''IA ?', NULL, 9, true, '2026-02-05 16:56:04.42744+00', 'text', '[]');
insert into public.maturity_questions (id, question_text, category, order_index, is_active, created_at, question_type, options) VALUES ('44fbbd68-935a-41a0-97e2-382bd002e7e1', 'Concrètement, quelle est la tâche (administrative ou technique) qui vous pèse le plus au quotidien et que vous rêveriez de voir disparaître ?', NULL, 9, true, '2026-02-05 16:55:55.300605+00', 'text', '[]');

commit;

notify pgrst, 'reload schema';
