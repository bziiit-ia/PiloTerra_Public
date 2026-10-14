-- =====================================================================
--  PILOTERRA — ÉTAPE 10 · Test de maturité valable pour les trois marchés
--
--  Idempotent, rejouable. À exécuter en une fois dans l'éditeur SQL.
--  Ordre : après sql/etape10_accent_visuel_marche.sql. Dev d'abord.
--
--  ⚠ À exécuter EN MÊME TEMPS que la mise à jour du scénario n8n
--  « Analyse maturité DEV » : tant qu'il n'est pas relu, on ne sait pas
--  s'il reconnaît les réponses par leur texte (le front les envoie par
--  identifiant de question, avec le texte de l'option choisie).
--
--  Arbitrage du 30/09/2026 : pas de questions déclinées par marché, un
--  seul questionnaire écrit pour les trois. Quatre questions sur huit
--  étaient agricoles (logiciel parcellaire, carnet de plaine, FMIS, OAD,
--  GPS tracteur, « l'avenir de l'agriculture ») ; les quatre autres
--  étaient déjà neutres et ne bougent pas.
--
--  Mise à jour EN PLACE, par identifiant : les réponses sont envoyées à
--  n8n rangées par identifiant de question, et l'échelle reste la même
--  (quatre options, de la moins à la plus avancée). Les anciens textes
--  sont gardés en commentaire pour revenir en arrière.
-- =====================================================================

begin;

-- Q2 — place du numérique
-- Ancienne option 2 : « On a quelques outils (logiciel parcellaire, météo)
-- mais peu connectés. »
update public.maturity_questions set options = jsonb_build_array(
  'C''est un mal nécessaire, on l''utilise pour l''administratif obligatoire.',
  'On a quelques outils métier (logiciel de gestion, planning, suivi terrain) mais peu connectés.',
  'C''est un levier de performance, nous testons régulièrement de nouveaux outils.',
  'C''est central : nos décisions sont pilotées par la donnée.'
)
where id = '2ff9eb4e-076f-4760-9d34-0e483c89d181';

-- Q3 — sentiment sur l'IA
-- Ancienne option 4 : « Conviction (c'est l'avenir inévitable de
-- l'agriculture). »
update public.maturity_questions set options = jsonb_build_array(
  'Scepticisme (c''est du marketing / ça fait peur).',
  'Curiosité (j''en entends parler, je veux comprendre).',
  'Opportunisme (je cherche des cas d''usage pour gagner du temps/argent).',
  'Conviction (c''est l''avenir inévitable de notre métier).'
)
where id = '3c1d3456-0ac4-45ae-a7c7-b583d698a783';

-- Q4 — stockage des données
-- Ancienne question : « Comment sont stockées vos données aujourd'hui
-- (historique cultural, clients, stocks...) ? » ; options 1, 3, 4 :
-- « Papier, carnet de plaine manuscrit ou mémoire humaine. »,
-- « Logiciels métiers (ERP, FMIS, CRM) mais qui ne se parlent pas
-- (silos). », « Cloud centralisé, API ou Data Warehouse structuré. »
update public.maturity_questions set
  question_text = 'Comment sont stockées vos données aujourd''hui (historique d''activité, clients, stocks, interventions…) ?',
  options = jsonb_build_array(
    'Papier, carnets de terrain ou mémoire des équipes.',
    'Excel, fichiers éparpillés sur plusieurs ordinateurs.',
    'Logiciels métiers (ERP, CRM, logiciel de gestion) mais qui ne se parlent pas (silos).',
    'Cloud centralisé, API ou entrepôt de données structuré.'
  )
where id = 'c8d7b215-25c5-4319-a2c1-971149cedd95';

-- Q6 — outils d'aide à la décision et capteurs
-- Ancienne question : « Utilisez-vous déjà des outils d'aide à la
-- décision (OAD) ou des capteurs connectés ? » ; options :
-- « Non, je me fie à mon observation terrain et mon expérience. »,
-- « Oui, j'ai une station météo ou un GPS tracteur (usage basique). »,
-- « Oui, j'utilise des OAD (maladies, irrigation) avec alertes. »,
-- « Oui, nous avons un écosystème connecté (IoT, imagerie sat,
-- modulation intra-parcellaire). »
update public.maturity_questions set
  question_text = 'Utilisez-vous déjà des outils d''aide à la décision ou des capteurs connectés ?',
  options = jsonb_build_array(
    'Non, on se fie à l''observation terrain et à l''expérience.',
    'Oui, quelques équipements connectés à usage basique (station météo, géolocalisation, télérelève…).',
    'Oui, des outils d''aide à la décision avec alertes (maladies, fuites, retards, niveaux de stock…).',
    'Oui, un écosystème connecté (capteurs, imagerie, suivi en temps réel) qui alimente nos décisions.'
  )
where id = '64755728-6619-444b-ad4c-e3f9ac5f0053';

commit;

-- ---------------------------------------------------------------------
--  Vérification — une ligne par contrôle, colonne « ok » attendue à true
-- ---------------------------------------------------------------------

select controle, ok, detail from (
  select 1 as ordre, 'Questions actives (8 attendues)' as controle,
         count(*) = 8 as ok, count(*)::text as detail
  from maturity_questions where is_active

  union all
  select 2, 'Plus aucun vocabulaire agricole',
         count(*) = 0,
         coalesce(string_agg(left(question_text, 40), ' | '), 'aucune')
  from maturity_questions
  where is_active
    and (question_text || options::text) ~* '(agricult|parcell|cultural|plaine|tracteur|FMIS|OAD|intra-parcell|irrigation)'

  union all
  select 3, 'Quatre options par question à choix',
         bool_and(jsonb_array_length(options) = 4),
         count(*)::text || ' questions à choix'
  from maturity_questions where is_active and question_type = 'choice'
) v
order by ordre;
