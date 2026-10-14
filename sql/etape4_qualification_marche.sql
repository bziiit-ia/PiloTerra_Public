-- =====================================================================
--  PILOTERRA — MULTI-MARCHÉ · Étape 4 : console de qualification
--
--  Ajoute une colonne de traçabilité sur les deux tables marquées au
--  backfill (piloterra_resources, prompts) : elle distingue un contenu
--  jamais qualifié manuellement (encore au marquage par défaut du
--  backfill_agriculture_v1) d'un contenu dont le marché a été confirmé
--  ou corrigé depuis la console super admin.
--
--  NULL = jamais qualifié manuellement → candidat par défaut de la
--  console. Rempli à chaque qualification (transverse ou assignation).
--
--  Idempotent, rejouable sans risque.
-- =====================================================================

alter table public.piloterra_resources
  add column if not exists marche_qualifie_le timestamptz;

alter table public.prompts
  add column if not exists marche_qualifie_le timestamptz;

comment on column public.piloterra_resources.marche_qualifie_le is
  'Horodatage de la dernière qualification manuelle du marché (console super admin, étape 4 du chantier multi-marché). NULL = jamais qualifié, encore au marquage par défaut du backfill.';

comment on column public.prompts.marche_qualifie_le is
  'Horodatage de la dernière qualification manuelle du marché (console super admin, étape 4 du chantier multi-marché). NULL = jamais qualifié, encore au marquage par défaut du backfill.';
