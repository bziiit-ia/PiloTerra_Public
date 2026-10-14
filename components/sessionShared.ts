// =====================================================================
//  PILOTERRA — SESSIONS DE FORMATION · MODULE PARTAGÉ
//  Source unique des types, métadonnées et helpers, utilisée par :
//    - GestionSessions   (espace admin d'organisation)
//    - RejoindreSession  (côté apprenant)
//  Objectif : aucune divergence possible entre les écrans.
// =====================================================================

import { FileEdit, CalendarClock, PlayCircle, CheckCircle2, Archive } from 'lucide-react';

// ---------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------
export type SessionStatut = 'brouillon' | 'planifiee' | 'en_cours' | 'terminee' | 'archivee';
export type SessionModalite = 'presentiel' | 'distanciel' | 'mixte';
export type ParticipantRole = 'apprenant' | 'formateur' | 'observateur';
export type StatutInscription = 'invite' | 'inscrit' | 'present' | 'absent' | 'annule';
export type EtapeStatut = 'a_venir' | 'en_cours' | 'terminee' | 'sautee';
export type DemiJournee = 'matin' | 'apres_midi';

export type ActionAttendue =
  | 'creer_compte' | 'positionnement' | 'lancer_defi' | 'creer_cas_usage'
  | 'generer_proto_prompt' | 'audit_frugalite' | 'generer_charte'
  | 'consulter_module' | 'exercice_libre';

export interface SessionFormation {
  id: string;
  created_at: string;
  updated_at: string;
  organisation_id: string;
  titre: string;
  description: string | null;
  formateur_id: string | null;
  formateur_externe: string | null;
  date_debut: string | null;
  date_fin: string | null;
  modalite: SessionModalite;
  lieu: string | null;
  statut: SessionStatut;
  code_acces: string | null;
  parcours_id: string | null;
  metadata: Record<string, any>;
}

export interface SessionSynthese {
  id: string;
  titre: string;
  statut: SessionStatut;
  date_debut: string | null;
  date_fin: string | null;
  code_acces: string | null;
  organisation: string;
  nb_apprenants: number;
  nb_presents: number;
  nb_defis: number;
  nb_cas_usage: number;
  nb_chartes: number;
}

export interface SessionProgression {
  session_id: string;
  user_id: string;
  prenom: string | null;
  nom: string | null;
  email: string;
  fonction_profil: string | null;
  role: ParticipantRole;
  statut_inscription: StatutInscription;
  date_arrivee: string | null;
  positionnement_fait: boolean;
  nb_defis: number;
  nb_cas_usage: number;
  nb_proto_prompts: number;
  nb_audits_frugalite: number;
  derniere_activite: string | null;
}

export interface SessionEtape {
  id: string;
  session_id: string;
  titre: string;
  module_id: string | null;
  ordre: number;
  jour: string | null;
  demi_journee: DemiJournee | null;
  duree_prevue_min: number | null;
  statut: EtapeStatut;
  debut_reel: string | null;
  fin_reelle: string | null;
  action_attendue: ActionAttendue | null;
}

// ---------------------------------------------------------------------
//  Métadonnées d'affichage
// ---------------------------------------------------------------------
export const STATUT_META: Record<SessionStatut, {
  label: string; short: string; badge: string; icon: any; aide: string;
}> = {
  brouillon: {
    label: 'Brouillon', short: 'Brouillon',
    badge: 'bg-slate-50 text-slate-600 ring-slate-200',
    icon: FileEdit,
    aide: "En préparation. Les apprenants ne peuvent pas encore rejoindre.",
  },
  planifiee: {
    label: 'Planifiée', short: 'Planifiée',
    badge: 'bg-sky-50 text-sky-700 ring-sky-200',
    icon: CalendarClock,
    aide: "Les apprenants peuvent rejoindre avec le code d'accès.",
  },
  en_cours: {
    label: 'En cours', short: 'En cours',
    badge: 'bg-succes-50 text-succes-700 ring-succes-200',
    icon: PlayCircle,
    aide: "Tout ce que produisent les apprenants est rattaché à cette session.",
  },
  terminee: {
    label: 'Terminée', short: 'Terminée',
    badge: 'bg-amber-50 text-amber-700 ring-amber-200',
    icon: CheckCircle2,
    aide: "Le rattachement automatique est arrêté. Les productions restent consultables.",
  },
  archivee: {
    label: 'Archivée', short: 'Archivée',
    badge: 'bg-slate-100 text-slate-500 ring-slate-200',
    icon: Archive,
    aide: "Session masquée de la liste principale.",
  },
};

export const MODALITE_LABELS: Record<SessionModalite, string> = {
  presentiel: 'Présentiel',
  distanciel: 'Distanciel',
  mixte: 'Mixte',
};

export const INSCRIPTION_META: Record<StatutInscription, { label: string; badge: string }> = {
  invite:  { label: 'Invité',  badge: 'bg-slate-50 text-slate-600 ring-slate-200' },
  inscrit: { label: 'Inscrit', badge: 'bg-sky-50 text-sky-700 ring-sky-200' },
  present: { label: 'Présent', badge: 'bg-succes-50 text-succes-700 ring-succes-200' },
  absent:  { label: 'Absent',  badge: 'bg-rose-50 text-rose-700 ring-rose-200' },
  annule:  { label: 'Annulé',  badge: 'bg-slate-100 text-slate-500 ring-slate-200' },
};

export const ETAPE_STATUT_META: Record<EtapeStatut, { label: string; badge: string }> = {
  a_venir:  { label: 'À venir',  badge: 'bg-slate-50 text-slate-500 ring-slate-200' },
  en_cours: { label: 'En cours', badge: 'bg-succes-50 text-succes-700 ring-succes-200' },
  terminee: { label: 'Terminée', badge: 'bg-sky-50 text-sky-700 ring-sky-200' },
  sautee:   { label: 'Sautée',   badge: 'bg-amber-50 text-amber-700 ring-amber-200' },
};

export const ACTION_LABELS: Record<ActionAttendue, string> = {
  creer_compte:         'Créer son compte',
  positionnement:       'Test de positionnement',
  lancer_defi:          'Lancer une Fiche Défi IA',
  creer_cas_usage:      "Créer un cas d'usage",
  generer_proto_prompt: 'Générer un prompt prototype',
  audit_frugalite:      'Audit de frugalité',
  generer_charte:       'Générer la Charte IA',
  consulter_module:     'Consulter un module',
  exercice_libre:       'Exercice libre',
};

// ---------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------

/** Transitions de statut autorisées depuis l'interface. */
export const NEXT_STATUTS: Record<SessionStatut, SessionStatut[]> = {
  brouillon: ['planifiee'],
  planifiee: ['en_cours', 'brouillon'],
  en_cours:  ['terminee'],
  terminee:  ['archivee', 'en_cours'],
  archivee:  ['terminee'],
};

/** Une session accepte-t-elle de nouveaux participants par code ? */
export const acceptsJoin = (s: Pick<SessionFormation, 'statut'>) =>
  s.statut === 'planifiee' || s.statut === 'en_cours';

/** Nom affichable d'un participant. */
export const displayName = (p: Pick<SessionProgression, 'prenom' | 'nom' | 'email'>) => {
  const full = [p.prenom, p.nom].filter(Boolean).join(' ').trim();
  return full || p.email;
};

/** Nom du formateur, qu'il soit utilisateur PiloTerra ou intervenant externe. */
export const formateurLabel = (
  s: Pick<SessionFormation, 'formateur_externe'>,
  utilisateur?: { prenom?: string | null; nom?: string | null } | null,
) => {
  if (utilisateur) {
    const full = [utilisateur.prenom, utilisateur.nom].filter(Boolean).join(' ').trim();
    if (full) return full;
  }
  return s.formateur_externe || 'Non renseigné';
};

/** Formatage de plage de dates, tolérant aux valeurs manquantes. */
export const formatPeriode = (debut: string | null, fin: string | null) => {
  if (!debut && !fin) return 'Dates à définir';
  const fmt = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  if (debut && fin && debut !== fin) return `${fmt(debut)} → ${fmt(fin)}`;
  return fmt((debut || fin) as string);
};

/** Date + heure courtes, pour « dernière activité ». */
export const formatMoment = (iso: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
};

/**
 * Score de progression d'un apprenant sur le parcours J1/J2 de référence.
 * Volontairement simple : 4 jalons, un point chacun.
 */
export const progressionScore = (p: SessionProgression) => {
  let n = 0;
  if (p.positionnement_fait) n++;
  if (p.nb_defis > 0) n++;
  if (p.nb_cas_usage > 0) n++;
  if (p.nb_proto_prompts > 0 || p.nb_audits_frugalite > 0) n++;
  return { done: n, total: 4, pct: Math.round((n / 4) * 100) };
};

/**
 * Un apprenant est considéré en difficulté s'il est présent depuis plus de
 * 20 minutes sans aucune activité enregistrée. Signal, pas verdict.
 */
export const isBloque = (p: SessionProgression) => {
  if (p.role !== 'apprenant') return false;
  if (p.statut_inscription !== 'present') return false;
  const ref = p.derniere_activite || p.date_arrivee;
  if (!ref) return false;
  return Date.now() - new Date(ref).getTime() > 20 * 60 * 1000;
};

/** Normalise la saisie d'un code d'accès (alphabet sans caractères ambigus). */
export const normalizeCode = (raw: string) =>
  raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
