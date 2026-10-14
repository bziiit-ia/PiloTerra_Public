// =====================================================================
//  PILOTERRA — BIBLIOTHÈQUE DE PROMPTS · MODULE PARTAGÉ
//  Source unique des types, métadonnées et helpers, utilisée par :
//    - PromptEditor (formulaire de création/édition)
//    - BibliothequePrompts (espace organisation)
//    - GestionPrompts (interface Super Admin)
//  Objectif : aucune divergence possible entre les écrans.
// =====================================================================

import { Library, Building2, Users, User } from 'lucide-react';

// ---------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------
export type VarType = 'text' | 'textarea' | 'select';

export interface PromptVariable {
  key: string;
  label: string;
  type: VarType;
  placeholder?: string;
  options?: string[];
  required?: boolean;
}

export interface Prompt {
  id: string;
  title: string;
  description: string | null;
  content: string;
  target_tool: string;
  category: string;
  tags: string[];
  variables: PromptVariable[];
  frugality_level: 1 | 2 | 3;
  recommended_model: string | null;
  frugality_tip: string | null;
  author_type: 'piloterra' | 'organisation';
  organisation_id: string | null;
  status: 'draft' | 'published';
  visibility: 'private' | 'public';
  moderation_status: 'not_submitted' | 'pending' | 'approved' | 'rejected';
  moderation_note: string | null;
  scope: 'personal' | 'organisation';
  created_by: string | null;
  proposed_to_org: boolean;
  usage_count: number;
  // Chantier multi-marché : codes marché auxquels le prompt s'adresse.
  // Tableau vide ou absent = prompt transverse, visible sur tous les marchés.
  marches?: string[] | null;
  // Horodatage de qualification manuelle (étape 4, console super admin).
  // null = jamais qualifié, encore au marquage par défaut du backfill.
  marche_qualifie_le?: string | null;
}

export type Circle = 'piloterra' | 'org' | 'community' | 'perso';

export interface Draft {
  id?: string;
  title: string;
  description: string;
  content: string;
  target_tool: string;
  category: string;
  tags: string;                 // saisie séparée par virgules
  variables: PromptVariable[];
  frugality_level: 1 | 2 | 3;
  recommended_model: string;
  frugality_tip: string;
}

// ---------------------------------------------------------------------
//  Outils supportés (un seul endroit pour en ajouter)
// ---------------------------------------------------------------------
export const TOOL_META: Record<string, { label: string; url: string }> = {
  claude:      { label: 'Claude',            url: 'https://claude.ai/new' },
  chatgpt:     { label: 'ChatGPT',           url: 'https://chatgpt.com' },
  gemini:      { label: 'Gemini',            url: 'https://gemini.google.com/app' },
  mistral:     { label: 'Mistral',           url: 'https://chat.mistral.ai' },
  notebooklm:  { label: 'NotebookLM',        url: 'https://notebooklm.google.com' },
  claude_code: { label: 'Claude Code',       url: 'https://claude.ai' },
  lovable:     { label: 'Lovable',           url: 'https://lovable.dev' },
  ai_studio:   { label: 'AI Studio',         url: 'https://aistudio.google.com' },
  copilot:     { label: 'Microsoft Copilot', url: 'https://copilot.microsoft.com' },
};
export const TOOL_KEYS = Object.keys(TOOL_META);
export const toolLabel = (t: string) => TOOL_META[t]?.label ?? t;
export const toolUrl = (t: string) => TOOL_META[t]?.url ?? null;

// ---------------------------------------------------------------------
//  Frugalité (SPEC AFNOR 2314) & cercles de visibilité
// ---------------------------------------------------------------------
export const FRUGALITY_META: Record<1 | 2 | 3, { label: string; badge: string }> = {
  1: { label: 'Frugal',   badge: 'bg-succes-50 text-succes-700 ring-succes-200' },
  2: { label: 'Modéré',   badge: 'bg-amber-50 text-amber-700 ring-amber-200' },
  3: { label: 'Intensif', badge: 'bg-orange-50 text-orange-700 ring-orange-200' },
};

export const CIRCLE_META: Record<Circle, { label: string; short: string; badge: string; icon: typeof Library }> = {
  piloterra: { label: 'Catalogue PiloTerra', short: 'PiloTerra',  badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icon: Library },
  org:       { label: "Bibliothèque d'organisation", short: 'Mon org',    badge: 'bg-sky-50 text-sky-700 ring-sky-200',             icon: Building2 },
  community: { label: 'Communauté',          short: 'Communauté', badge: 'bg-violet-50 text-violet-700 ring-violet-200',    icon: Users },
  perso:     { label: 'Mes prompts',         short: 'Mes prompts',badge: 'bg-slate-100 text-slate-700 ring-slate-300',      icon: User },
};

// ---------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------
// Cercle « principal » d'un prompt, utilisé pour le BADGE affiché sur la carte.
export function circleOf(p: Prompt, myOrgId: string | null): Circle {
  if (p.author_type === 'piloterra') return 'piloterra';
  if (p.scope === 'personal') return 'perso';   // le RLS ne me montre que mes prompts perso
  if (myOrgId && p.organisation_id === myOrgId && p.scope === 'organisation') return 'org';
  return 'community';
}

// Appartenance d'un prompt à un cercle donné, utilisée pour le FILTRAGE.
// Un prompt peut appartenir à plusieurs cercles : un prompt de mon organisation
// partagé à la communauté est à la fois dans « Bibliothèque d'organisation » et « Communauté ».
export function belongsToCircle(p: Prompt, circle: Circle, myOrgId: string | null): boolean {
  switch (circle) {
    case 'piloterra': return p.author_type === 'piloterra';
    case 'perso':     return p.scope === 'personal';
    case 'org':       return p.scope === 'organisation' && !!myOrgId && p.organisation_id === myOrgId;
    case 'community': return p.author_type === 'organisation'
                          && p.visibility === 'public'
                          && p.moderation_status === 'approved'
                          && p.status === 'published';
    default:          return false;
  }
}

// Remplace {{cle}} par la valeur saisie ; laisse le marqueur visible si vide.
export function fillTemplate(content: string, values: Record<string, string>): string {
  return content.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    const v = values[key];
    return v && v.trim() !== '' ? v : `{{${key}}}`;
  });
}

// Détecte les {{marqueurs}} présents dans un texte (dédupliqués, ordre d'apparition).
export function detectKeys(content: string): string[] {
  const keys: string[] = [];
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) if (!keys.includes(m[1])) keys.push(m[1]);
  return keys;
}

// jsonb pouvant arriver en tableau ou en chaîne selon le client.
export function parseVariables(raw: any): PromptVariable[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as PromptVariable[];
  if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

export const emptyDraft = (): Draft => ({
  title: '', description: '', content: '', target_tool: 'claude', category: '',
  tags: '', variables: [], frugality_level: 2, recommended_model: '', frugality_tip: '',
});

export const draftFromPrompt = (p: Prompt): Draft => ({
  id: p.id,
  title: p.title,
  description: p.description ?? '',
  content: p.content,
  target_tool: p.target_tool,
  category: p.category,
  tags: (p.tags ?? []).join(', '),
  variables: p.variables ?? [],
  frugality_level: p.frugality_level,
  recommended_model: p.recommended_model ?? '',
  frugality_tip: p.frugality_tip ?? '',
});

// ---------------------------------------------------------------------
//  Frugalité — outils d'évaluation (esprit SPEC AFNOR 2314)
// ---------------------------------------------------------------------

// Tâches typiquement sobres : reformuler, mettre en forme, produire un
// format court et cadré à partir d'un contenu déjà fourni.
const FRUGAL_HINTS = [
  'reformul', 'reecris', 'réécris', 'corrige', 'resume court', 'mets en forme',
  'traduis', 'liste', 'titre', 'accroche', 'post', 'email', 'e-mail', 'mail',
  'compte-rendu', 'compte rendu', 'faq', 'ordre du jour', 'annonce',
];

// Tâches typiquement intensives : raisonnement long, analyse fine,
// enjeu juridique/stratégique, production volumineuse et structurée.
const INTENSIVE_HINTS = [
  'analyse juridique', 'contrat', 'clause', 'strategie', 'stratégie',
  'raisonne', 'demontre', 'démontre', 'compare en profondeur', 'audit',
  'plan detaille', 'plan détaillé', 'etude', 'étude', 'argumentaire complexe',
  'these', 'thèse', 'code', 'refactor', 'architecture',
];

/**
 * Suggère un niveau de frugalité à partir du contenu du prompt.
 * Heuristique volontairement simple et explicable :
 *  - la longueur attendue de la tâche et sa nature priment ;
 *  - en cas de doute, on reste sur « Modéré » (2).
 * L'auteur garde toujours le dernier mot : c'est une suggestion, pas une règle.
 */
export function suggestFrugality(content: string): { level: 1 | 2 | 3; reason: string } {
  const text = (content || '').toLowerCase();
  if (!text.trim()) return { level: 2, reason: '' };

  const words = text.split(/\s+/).filter(Boolean).length;
  const hasIntensive = INTENSIVE_HINTS.some((h) => text.includes(h));
  const hasFrugal = FRUGAL_HINTS.some((h) => text.includes(h));

  if (hasIntensive) {
    return { level: 3, reason: "Cette tâche demande une analyse approfondie : un modèle puissant peut se justifier." };
  }
  if (hasFrugal && words < 160) {
    return { level: 1, reason: "Tâche de rédaction ou de mise en forme à partir d'un contenu fourni : un modèle léger suffit." };
  }
  if (words > 220) {
    return { level: 2, reason: "Consigne longue et structurée : un modèle intermédiaire est adapté." };
  }
  return { level: 2, reason: "Tâche courante : un modèle intermédiaire suffit dans la plupart des cas." };
}

/**
 * Score de sobriété d'un ensemble de prompts, sur 100.
 * 100 = tous les prompts sont frugaux (niveau 1) ; 0 = tous intensifs (niveau 3).
 * Sert d'indicateur agrégé pour une organisation.
 */
export function sobrietyScore(levels: number[]): number | null {
  if (!levels.length) return null;
  const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
  return Math.round(((3 - avg) / 2) * 100);
}

export function sobrietyLabel(score: number): string {
  if (score >= 75) return 'Très sobre';
  if (score >= 50) return 'Sobre';
  if (score >= 25) return 'À surveiller';
  return 'Intensif';
}