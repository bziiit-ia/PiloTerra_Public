// =====================================================================
//  PILOTERRA — MULTI-MARCHÉ · Étape 10 : palette du marché
//
//  Tout le portail prend la couleur du marché actif, sans toucher aux
//  composants : dans index.html, la palette Tailwind « emerald » (la
//  couleur de marque, ~1 100 usages) et les couleurs pilo-green / dark /
//  light / brown pointent vers des variables CSS. Ce module calcule ces
//  variables à partir des couleurs du marché, rangées en base
//  (marches.couleur_accent, marches.couleur_secondaire), et les pose sur
//  <html>. Changer une couleur en base suffit : tout suit.
//
//  Règles (arbitrées le 30/09/2026) :
//    - la couleur de marque (#1b5e1f) garde la palette historique exacte :
//      vitrine et agriculture ne changent pas d'un pixel ;
//    - une autre couleur produit onze nuances (50 à 950) de même teinte,
//      sur l'échelle de clarté de la palette emerald de Tailwind : une
//      classe text-emerald-600 garde la même lisibilité sur tous les
//      marchés ;
//    - secondaire vide = brun doré de la marque.
//
//  Les états (publié, enregistré, présent, succès…) n'utilisent PAS
//  emerald mais « succes » (index.html), figé sur les valeurs de
//  l'emerald historique : un « publié » ne doit pas changer de sens avec
//  le marché (en logistique, il se confondrait avec l'ambre des
//  brouillons). Tout nouvel indicateur d'état : succes-*, jamais emerald.
//
//  Calcul en OKLCH : la clarté y est perçue de façon régulière d'une
//  teinte à l'autre, ce qui n'est pas le cas en HSL (un jaune à 50 % de
//  clarté HSL paraît bien plus clair qu'un bleu à 50 %).
// =====================================================================

export const COULEUR_MARQUE = '#1b5e1f';
export const SECONDAIRE_MARQUE = '#a77a15';

export const NUANCES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type Nuance = typeof NUANCES[number];

/** Clarté OKLCH de chaque nuance de la palette emerald de Tailwind v3. */
const CLARTES: Record<Nuance, number> = {
  50: 0.979, 100: 0.950, 200: 0.905, 300: 0.845, 400: 0.765, 500: 0.696,
  600: 0.596, 700: 0.508, 800: 0.432, 900: 0.378, 950: 0.262,
};

/** Part de la saturation du marché gardée par chaque nuance : faible aux
 *  extrêmes (fonds très clairs, textes très foncés), pleine au milieu. */
const SATURATIONS: Record<Nuance, number> = {
  50: 0.15, 100: 0.30, 200: 0.55, 300: 0.80, 400: 0.95, 500: 1.0,
  600: 0.95, 700: 0.85, 800: 0.72, 900: 0.62, 950: 0.45,
};

type Rgb = [number, number, number];

// ---------------------------------------------------------------------
//  Conversions
// ---------------------------------------------------------------------

export const estCouleurValide = (hex: string | null | undefined): hex is string =>
  !!hex && /^#[0-9a-fA-F]{6}$/.test(hex.trim());

export const normaliserCouleur = (hex: string): string => hex.trim().toLowerCase();

const hexVersRgb = (hex: string): Rgb => {
  const h = normaliserCouleur(hex).slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
};

const rgbVersHex = (rgb: Rgb): string =>
  '#' + rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('');

const versLineaire = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

interface Oklch { l: number; c: number; h: number }

const rgbVersOklch = (rgb: Rgb): Oklch => {
  const [r, g, b] = rgb.map(versLineaire);
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
  return { l: L, c: Math.hypot(A, B), h: Math.atan2(B, A) };
};

/** Canaux linéaires (hors gamut possible : sert au contrôle). */
const oklchVersLineaire = ({ l, c, h }: Oklch): Rgb => {
  const A = c * Math.cos(h);
  const B = c * Math.sin(h);
  const l_ = l + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = l - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = l - 0.0894841775 * A - 1.2914855480 * B;
  const L3 = l_ ** 3, M3 = m_ ** 3, S3 = s_ ** 3;
  return [
    4.0767416621 * L3 - 3.3077115913 * M3 + 0.2309699292 * S3,
    -1.2684380046 * L3 + 2.6097574011 * M3 - 0.3413193965 * S3,
    -0.0041960863 * L3 - 0.7034186147 * M3 + 1.7076147010 * S3,
  ];
};

const dansLeGamut = (lin: Rgb): boolean => lin.every((v) => v >= -0.0005 && v <= 1.0005);

/** Couleur affichable la plus proche : on garde clarté et teinte, on
 *  réduit la saturation jusqu'à rentrer dans l'écran (sRGB). */
const oklchVersRgb = (couleur: Oklch): Rgb => {
  let lin = oklchVersLineaire(couleur);
  if (!dansLeGamut(lin)) {
    let bas = 0, haut = couleur.c;
    for (let i = 0; i < 24; i++) {
      const milieu = (bas + haut) / 2;
      if (dansLeGamut(oklchVersLineaire({ ...couleur, c: milieu }))) bas = milieu; else haut = milieu;
    }
    lin = oklchVersLineaire({ ...couleur, c: bas });
  }
  return lin.map((v) => {
    const x = Math.min(1, Math.max(0, v));
    return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
  }) as Rgb;
};

// ---------------------------------------------------------------------
//  Palettes
// ---------------------------------------------------------------------

/** Palette historique : emerald de Tailwind v3 + couleurs PiloTerra. */
const PALETTE_MARQUE: Record<Nuance, string> = {
  50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399', 500: '#10b981',
  600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b', 950: '#022c22',
};

export interface PaletteMarche {
  nuances: Record<Nuance, string>;
  /** pilo-green : la couleur du marché elle-même (boutons pleins, titres). */
  principale: string;
  /** pilo-dark : fonds très sombres. */
  sombre: string;
  /** pilo-light : fonds très clairs. */
  claire: string;
  /** pilo-brown : accents secondaires. */
  secondaire: string;
  /** Vrai si c'est la palette historique, inchangée. */
  estMarque: boolean;
}

const estCouleurMarque = (hex: string | null | undefined): boolean =>
  !estCouleurValide(hex) || normaliserCouleur(hex) === COULEUR_MARQUE;

export const calculerPalette = (
  principale: string | null | undefined,
  secondaire?: string | null,
): PaletteMarche => {
  const sec = estCouleurValide(secondaire) ? normaliserCouleur(secondaire) : SECONDAIRE_MARQUE;

  if (estCouleurMarque(principale)) {
    return {
      nuances: { ...PALETTE_MARQUE },
      principale: COULEUR_MARQUE,
      sombre: '#0d3310',
      claire: '#f2fcf3',
      secondaire: sec,
      estMarque: true,
    };
  }

  const base = rgbVersOklch(hexVersRgb(principale as string));
  // Une couleur presque grise garde une légère teinte, sinon toute la
  // palette tombe dans le gris.
  const saturation = Math.max(base.c, 0.06) * 1.1;

  const nuances = {} as Record<Nuance, string>;
  for (const n of NUANCES) {
    nuances[n] = rgbVersHex(oklchVersRgb({ l: CLARTES[n], c: saturation * SATURATIONS[n], h: base.h }));
  }

  return {
    nuances,
    principale: normaliserCouleur(principale as string),
    sombre: rgbVersHex(oklchVersRgb({ l: 0.29, c: base.c * 0.6, h: base.h })),
    claire: rgbVersHex(oklchVersRgb({ l: 0.985, c: Math.min(0.025, base.c * 0.25), h: base.h })),
    secondaire: sec,
    estMarque: false,
  };
};

// ---------------------------------------------------------------------
//  Application à la page
// ---------------------------------------------------------------------

const canaux = (hex: string): string => hexVersRgb(hex).join(' ');

/** Pose la palette sur <html>. Couleur de marque : les variables sont
 *  retirées et les valeurs par défaut d'index.html s'appliquent. */
export const appliquerPalette = (
  principale: string | null | undefined,
  secondaire?: string | null,
): void => {
  if (typeof document === 'undefined') return;
  const style = document.documentElement.style;
  const palette = calculerPalette(principale, secondaire);

  if (palette.estMarque) {
    for (const n of NUANCES) style.removeProperty(`--accent-${n}`);
    style.removeProperty('--pilo-green');
    style.removeProperty('--pilo-dark');
    style.removeProperty('--pilo-light');
  } else {
    for (const n of NUANCES) style.setProperty(`--accent-${n}`, canaux(palette.nuances[n]));
    style.setProperty('--pilo-green', canaux(palette.principale));
    style.setProperty('--pilo-dark', canaux(palette.sombre));
    style.setProperty('--pilo-light', canaux(palette.claire));
  }

  if (palette.secondaire === SECONDAIRE_MARQUE) style.removeProperty('--pilo-brown');
  else style.setProperty('--pilo-brown', canaux(palette.secondaire));
};

/** Couleurs de la palette active, en hexadécimal, pour les documents
 *  exportés (charte, cas d'usage) qui ne passent pas par Tailwind. */
export const couleursDocument = (): Record<Nuance, string> => {
  const resultat = { ...PALETTE_MARQUE };
  if (typeof document === 'undefined') return resultat;
  const style = document.documentElement.style;
  for (const n of NUANCES) {
    const v = style.getPropertyValue(`--accent-${n}`).trim();
    if (v) {
      const [r, g, b] = v.split(/\s+/).map(Number);
      if ([r, g, b].every(Number.isFinite)) resultat[n] = rgbVersHex([r, g, b]);
    }
  }
  return resultat;
};

// ---------------------------------------------------------------------
//  Lisibilité (WCAG 2.1)
// ---------------------------------------------------------------------

const luminance = (hex: string): number => {
  const [r, g, b] = hexVersRgb(hex).map(versLineaire);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Rapport de contraste entre deux couleurs, de 1 à 21.
 *  4,5 = minimum pour un texte courant ; 3 = gros texte ou pictogramme. */
export const contraste = (a: string, b: string): number => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};
