// =====================================================================
//  Adresses des workflows n8n
//  Source unique des chemins appelés par le front : plus aucune URL n8n
//  en dur dans les composants.
//
//  Convention arbitrée le 15/09/2026 : les copies de dev des scénarios
//  vivent dans un dossier n8n dédié, sur la même instance, avec le
//  chemin d'origine préfixé par « dev- » (n8n refuse d'activer deux
//  workflows sur le même chemin).
//      prod : /webhook/charte-ia        dev : /webhook/dev-charte-ia
//
//  VITE_N8N_ENVIRONNEMENT = dev | prod, obligatoire. Pas de défaut : une
//  variable oubliée ne doit jamais renvoyer le dev vers les workflows de
//  prod, qui écrivent dans le Supabase de prod.
//
//  Tant qu'un scénario n'est pas dupliqué côté n8n, son appel échoue en
//  dev (404) : c'est voulu, rien ne part en prod.
// =====================================================================

// VITE_N8N_URL : autre instance n8n, par exemple celle de la pile locale
// (docker-compose.yml). Absente : l'instance de bziiit.
const N8N_BASE = (import.meta.env.VITE_N8N_URL?.trim() || 'https://n8n.bziiit.com').replace(/\/+$/, '');

const environnement = import.meta.env.VITE_N8N_ENVIRONNEMENT?.trim();

if (environnement !== 'dev' && environnement !== 'prod') {
  throw new Error(
    'Configuration n8n manquante : définir VITE_N8N_ENVIRONNEMENT=dev ou prod ' +
    "dans .env.local (en local) ou dans les variables d'environnement de l'hébergeur, " +
    'puis relancer le serveur.'
  );
}

export const ENVIRONNEMENT_N8N: 'dev' | 'prod' = environnement;

const prefixe = environnement === 'dev' ? 'dev-' : '';
const webhook = (chemin: string) => `${N8N_BASE}/webhook/${prefixe}${chemin}`;
const formulaire = (chemin: string) => `${N8N_BASE}/form/${prefixe}${chemin}`;

/** Workflows appelés par le front. Chemins de PROD ; préfixe « dev- » ajouté en dev. */
export const N8N = {
  /** Formulaire Fiche Défi, hébergé par n8n — gardé pour bziiit.com et les
   *  liens existants (QR codes, e-mails). Le portail passe par la modale. */
  ficheDefi: formulaire('defIAPiloTerra'),
  /** Fiche Défi envoyée par la modale du portail (FicheDefiModal) — même
   *  scénario n8n que le formulaire, deuxième entrée. */
  ficheDefiPortail: webhook('fiche_defi_piloterra'),
  /** Génération des cas d'usage — CasUsageIA */
  casUsage: webhook('cas_usage_piloterra'),
  /** Prompt de prototype — CasUsageIA */
  protoPrompt: webhook('proto_prompt_piloterra'),
  /** Code de prototype — CasUsageIA */
  protoCode: webhook('proto_code_piloterra'),
  /** Audit de frugalité — CasUsageIA */
  frugalite: webhook('frugalite_piloterra'),
  /** Charte IA — CharteIA */
  charte: webhook('charte-ia'),
  /** Test de maturité — Assessment, enchaîné en fin d'onboarding */
  maturite: webhook('maturité'),
  /** Invitation d'un membre — AdminOrganisation */
  invitation: webhook('invit_piloterra'),
  /** Invitation acceptée, à la connexion — App.tsx */
  majStatutInvitation: webhook('maj_statut_invit_piloterra'),
  /** Matrice d'alignement stratégique — SuperAdminDashboard */
  matriceAlignement: webhook('matrice_alignement'),
  /** Demande de support — SupportModal */
  support: webhook('support_piloterra'),
} as const;
