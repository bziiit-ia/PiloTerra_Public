// =====================================================================
//  PILOTERRA — MULTI-MARCHÉ · Socle partagé
//  Types, constantes et helpers du contexte de marché.
//  Même rôle que promptShared.ts et sessionShared.ts.
//
//  À placer dans : components/marcheShared.ts
// =====================================================================

import { RUBRIQUES_PUBLIQUES } from '../seoUrl';

export const CLE_STOCKAGE_MARCHE = 'piloterra.marche';
export const PARAM_URL_MARCHE = 'marche';

// ---------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------

export interface Marche {
  code: string;
  libelle: string;
  baseline: string;
  couleur_accent: string;
  /** Étape 10 — couleur secondaire ; vide = brun doré de la marque.
   *  Absente tant que sql/etape10_accent_visuel_marche.sql n'est pas passé. */
  couleur_secondaire?: string | null;
  ordre: number;
  actif: boolean;
  /** Profils proposés dans ce marché (étape 5d). Absent tant que le SQL
   *  sql/etape5d_profils_par_marche.sql n'est pas passé. */
  profils?: string[];
  /** Étape 6 — absents tant que sql/etape6_vitrine_tri_marche.sql n'est pas passé. */
  /** Mot tournant de l'accroche : « l'agriculture », « la logistique »… */
  mot_accroche?: string | null;
  /** Introduction de la section « À qui est destiné ce portail IA ? ». */
  publics_intro?: string | null;
  /** Publics visés, dans l'ordre d'affichage. */
  publics?: PublicMarche[] | null;
}

export interface PublicMarche {
  libelle: string;
  /** Clé de pictogramme, traduite par le front (voir PICTOS_PUBLICS dans About.tsx). */
  icone?: string;
}

/** Début commun de l'accroche vitrine, complété par le mot du marché. */
export const DEBUT_ACCROCHE = 'Votre portail IA open source pour';

export interface Filiere {
  code: string;
  marche_code: string;
  libelle: string;
  ordre: number;
  actif: boolean;
}

/**
 * D'où vient le marché actif. Utile pour l'affichage et pour décider
 * si le choix mérite d'être mémorisé.
 */
export type OrigineMarche =
  | 'url'      // ?marche=... — partage de lien, pages d'atterrissage SEO
  | 'choix'    // l'utilisateur a cliqué dans le sélecteur
  | 'assigne'  // marché de l'utilisateur connecté — verrouillé, non contournable
  | 'profil'   // marché de l'utilisateur, mais surchargeable (super_admin)
  | 'vitrine'; // aucun marché déterminé : on montre les trois

// ---------------------------------------------------------------------
//  La règle de visibilité
//  Miroir exact de la fonction SQL public.est_visible_pour().
//  Un tableau vide signifie « transverse » : visible partout.
//  Un marché actif nul signifie « vitrine » : tout est visible.
// ---------------------------------------------------------------------

export const estVisiblePour = (
  marches: string[] | null | undefined,
  marcheActif: string | null
): boolean => {
  if (!marches || marches.length === 0) return true;
  if (!marcheActif) return true;
  return marches.includes(marcheActif);
};

/** Vrai si le contenu s'adresse à tous les marchés. */
export const estTransverse = (marches: string[] | null | undefined): boolean =>
  !marches || marches.length === 0;

// ---------------------------------------------------------------------
//  Lecture / écriture du choix utilisateur
// ---------------------------------------------------------------------

/**
 * Marché demandé par l'adresse : `?marche=...` d'abord, sinon le premier
 * segment du chemin — les pages SEO de l'étape 8 vivent en /agriculture
 * et /agriculture/prompts. La valeur n'est qu'un candidat : MarcheContext
 * la rejette si elle ne correspond à aucun code du référentiel, ce qui
 * écarte d'emblée /agents, /prompts et les autres rubriques.
 */
export const lireMarcheDepuisUrl = (): string | null => {
  try {
    const parametre = new URLSearchParams(window.location.search).get(PARAM_URL_MARCHE);
    if (parametre) return parametre;

    const premier = window.location.pathname.split('/').filter(Boolean)[0];
    return premier ? premier.replace(/\.html$/i, '') : null;
  } catch {
    return null;
  }
};

export const lireMarcheMemorise = (): string | null => {
  try {
    return window.localStorage.getItem(CLE_STOCKAGE_MARCHE);
  } catch {
    return null;
  }
};

/**
 * Aligne l'adresse sur le marché choisi, sans recharger la page (étape 8).
 * L'adresse devient partageable et cohérente avec les pages SEO :
 *   /                → /agriculture
 *   /logistique      → /agriculture
 *   /prompts         → /agriculture/prompts
 * Une fiche (/agents/mon-agent) n'est jamais réécrite : son adresse
 * identifie un contenu, pas un marché.
 */
export const ecrireMarcheDansUrl = (code: string | null, codesConnus: string[]): void => {
  try {
    const { pathname, search, hash } = window.location;
    const segments = pathname
      .split('/')
      .filter(Boolean)
      .map((s) => s.replace(/\.html$/i, ''));

    let nouveauChemin: string | null = null;

    if (segments.length === 0) {
      nouveauChemin = code ? `/${code}` : '/';
    } else if (codesConnus.includes(segments[0])) {
      const reste = segments.slice(1);
      nouveauChemin = code
        ? `/${[code, ...reste].join('/')}`
        : reste.length
          ? `/${reste.join('/')}`
          : '/';
    } else if (segments.length === 1 && RUBRIQUES_PUBLIQUES[segments[0]]) {
      nouveauChemin = code ? `/${code}/${segments[0]}` : `/${segments[0]}`;
    }

    if (!nouveauChemin) return;

    // Le chemin porte le marché : garder ?marche= ferait doublon.
    const parametres = new URLSearchParams(search);
    parametres.delete(PARAM_URL_MARCHE);
    const requete = parametres.toString();

    const cible = `${nouveauChemin}${requete ? `?${requete}` : ''}${hash}`;
    if (cible !== `${pathname}${search}${hash}`) window.history.pushState({}, '', cible);
  } catch {
    /* historique indisponible : le choix vaut quand même pour la session */
  }
};

export const memoriserMarche = (code: string | null): void => {
  try {
    if (code) window.localStorage.setItem(CLE_STOCKAGE_MARCHE, code);
    else window.localStorage.removeItem(CLE_STOCKAGE_MARCHE);
  } catch {
    /* navigation privée, quota : on ignore, le choix vaudra pour la session */
  }
};

// ---------------------------------------------------------------------
//  Helpers d'affichage
// ---------------------------------------------------------------------

export const filieresDuMarche = (filieres: Filiere[], marcheCode: string | null): Filiere[] =>
  marcheCode ? filieres.filter((f) => f.marche_code === marcheCode) : [];

export const libelleMarche = (marches: Marche[], code: string | null): string =>
  marches.find((m) => m.code === code)?.libelle ?? 'Tous les marchés';

/** Baseline à afficher : celle du marché actif, ou la promesse tri-marché.
 *  Phrase fixe : la vitrine animée passe par AccrocheMarche. */
export const baselineMarche = (marches: Marche[], code: string | null): string =>
  marches.find((m) => m.code === code)?.baseline ??
  // Un seul marché actif (prod avant l'ouverture groupée) : sa phrase.
  (marches.length === 1 ? marches[0].baseline : 'Votre portail IA open source');

/** Mot du marché actif pour compléter une phrase (« l'agriculture »,
 *  « la logistique »…), lu dans marches.mot_accroche. null en vitrine :
 *  la phrase reste alors neutre. Un seul marché actif (prod avant
 *  l'ouverture groupée) : son mot. */
export const motMarcheActif = (marches: Marche[], code: string | null): string | null => {
  const marche = marches.find((m) => m.code === code) ?? (marches.length === 1 ? marches[0] : null);
  return marche?.mot_accroche?.trim() || null;
};

/** Couleur d'accent du marché actif, avec repli sur le vert PiloTerra. */
export const accentMarche = (marches: Marche[], code: string | null): string =>
  marches.find((m) => m.code === code)?.couleur_accent ?? '#1b5e1f';