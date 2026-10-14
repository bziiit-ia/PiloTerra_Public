/**
 * PiloTerra — Passerelle entre les URL publiques et l'application
 * ---------------------------------------------------------------
 * Les pages générées au build vivent à des adresses réelles :
 *   piloterra.fr/agents/assistant-aides-pac
 *
 * Ce fichier fait le lien dans les deux sens :
 *
 *  - à l'arrivée : on lit l'adresse pour savoir quelle fiche ouvrir
 *    (lireCheminPublic)
 *  - pendant la navigation : on met l'adresse à jour quand une fiche
 *    s'ouvre, sans recharger la page (pousserUrlFiche / retirerUrlFiche)
 *
 * Conséquence utile : un visiteur peut copier l'URL de la pop-up qu'il a
 * sous les yeux et l'envoyer. Le bouton « retour » du navigateur referme
 * la fiche au lieu de quitter le site.
 */

/** Rubriques publiques et page de l'application correspondante. */
export const RUBRIQUES_PUBLIQUES: Record<string, string> = {
  agents: 'agents-ia',
  formations: 'formation-presentiel',
  prompts: 'prompts',
  'sources-de-donnees': 'data-agri'
};

export interface CheminPublic {
  rubrique: string;
  slug: string;
  page: string;
}

/**
 * Lit l'adresse courante et renvoie la fiche à ouvrir, ou null si
 * l'adresse ne correspond à aucune rubrique publique.
 */
export function lireCheminPublic(): CheminPublic | null {
  if (typeof window === 'undefined') return null;

  const segments = window.location.pathname.split('/').filter(Boolean);
  if (segments.length !== 2) return null;

  const [rubrique, slugBrut] = segments;
  const page = RUBRIQUES_PUBLIQUES[rubrique];
  if (!page) return null;

  // Tolère un éventuel .html en fin d'adresse
  const slug = slugBrut.replace(/\.html$/i, '');
  if (!slug) return null;

  return { rubrique, slug, page };
}

/**
 * Page à ouvrir pour une adresse de rubrique, sans fiche (étape 8) :
 *   /prompts              → la bibliothèque de prompts
 *   /agriculture/prompts  → la même, le marché étant lu à part par
 *                           MarcheContext (lireMarcheDepuisUrl)
 * Renvoie null si l'adresse ne désigne aucune rubrique publique.
 */
export function lirePageDepuisChemin(): string | null {
  if (typeof window === 'undefined') return null;

  const segments = window.location.pathname
    .split('/')
    .filter(Boolean)
    .map((s) => s.replace(/\.html$/i, ''));

  if (segments.length === 1) return RUBRIQUES_PUBLIQUES[segments[0]] || null;

  // Deux segments : soit une fiche (traitée par lireCheminPublic), soit
  // une rubrique de marché. Le premier segment n'est alors pas une
  // rubrique publique.
  if (segments.length === 2 && !RUBRIQUES_PUBLIQUES[segments[0]]) {
    return RUBRIQUES_PUBLIQUES[segments[1]] || null;
  }

  return null;
}

/** Met l'adresse à jour à l'ouverture d'une fiche, sans recharger. */
export function pousserUrlFiche(rubrique: string, slug: string): void {
  if (typeof window === 'undefined' || !slug) return;
  const cible = `/${rubrique}/${slug}`;
  if (window.location.pathname === cible) return;
  window.history.pushState({ rubrique, slug }, '', cible);
}

/** Rétablit l'adresse de la rubrique à la fermeture d'une fiche. */
export function retirerUrlFiche(page: string): void {
  if (typeof window === 'undefined') return;
  window.history.pushState({}, '', `/#${page}`);
}
