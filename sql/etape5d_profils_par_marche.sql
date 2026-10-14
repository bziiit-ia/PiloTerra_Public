-- =====================================================================
--  PILOTERRA — MULTI-MARCHÉ · Étape 5d : profils par marché
--
--  Idempotent, rejouable. À exécuter d'un bloc, sur le DEV d'abord
--  (supabase.piloterra.me).
--
--  La liste « Votre profil » (portail : Profile.tsx ; formulaire Fiche Défi
--  n8n) dépend désormais du marché. Elle est rangée dans le référentiel
--  `marches`, à côté des filières : une seule source, lue par le portail et
--  par n8n, modifiable sans redéploiement.
--
--  Arbitré le 17/09/2026 : agriculture inchangée ; libellés environnement
--  et logistique proposés, à valider par Paul.
--
--  Les listes ne sont écrites que si elles sont encore vides : une liste
--  retouchée ensuite en base n'est jamais écrasée par une réexécution.
-- =====================================================================

alter table public.marches
  add column if not exists profils text[] not null default '{}';

comment on column public.marches.profils is
  'Profils proposés à l''utilisateur de ce marché (portail et formulaire Fiche Défi), dans l''ordre d''affichage. Les libellés servent aussi de clés au prompt d''analyse n8n : renommer un profil suppose d''adapter le bloc marché du workflow.';

update public.marches
   set profils = array['Agriculteur', 'Conseiller', 'Acheteur', 'Financeur', 'Fournisseur', 'Direction']
 where code = 'agriculture' and profils = '{}';

update public.marches
   set profils = array['Exploitant / technicien de terrain', 'Bureau d''études / conseil', 'Collectivité / donneur d''ordre', 'Financeur', 'Fournisseur de solutions', 'Direction']
 where code = 'environnement' and profils = '{}';

update public.marches
   set profils = array['Exploitant (entrepôt, transport)', 'Chargeur / donneur d''ordre', 'Conseil supply chain', 'Financeur', 'Fournisseur de solutions', 'Direction']
 where code = 'logistique' and profils = '{}';

-- Rechargement du cache de l'API (instance auto-hébergée)
notify pgrst, 'reload schema';


-- =====================================================================
--  Vérifications (lecture seule)
-- =====================================================================
-- Listes en place :
--   select code, profils from marches order by ordre;
--
-- Utilisateurs dont le profil n'existe pas dans la liste de leur marché
-- effectif (ils devront le rechoisir au prochain enregistrement du profil) :
--   select m.code as marche, u.fonction_profil, count(*)
--   from utilisateurs u
--   left join organisations o on o.id = u.organisation_id
--   join marches m on m.code = coalesce(o.marche_code, u.marche_code)
--   where u.fonction_profil is not null
--     and not (u.fonction_profil = any (m.profils))
--   group by 1, 2 order by 1, 3 desc;
