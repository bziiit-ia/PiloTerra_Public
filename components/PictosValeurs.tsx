// =====================================================================
//  PILOTERRA — MULTI-MARCHÉ · Étape 10 : pictos des valeurs
//
//  Remplace le bandeau PNG `logo/picto_piloterra_valeurs.png`, dont les
//  couleurs (vert et marron) étaient figées dans l'image. Les cinq pictos
//  sont des SVG exportés de Canva en noir (stockage, `logo/v2/`) : seule
//  leur forme compte. Le noir devient `currentColor`, donc la couleur du
//  texte, donc la palette du marché affiché (paletteMarche.ts) : changer
//  une couleur dans la console suffit, aucun fichier à refaire.
//
//  Règles (30/09/2026) :
//    - une couleur par picto, en alternance principale / secondaire, comme
//      les libellés : même rythme que l'ancien bandeau, et robuste à un
//      nouvel export (pas de coloriage morceau par morceau) ;
//    - ce qui n'est pas noir garde sa couleur : le drapeau de
//      « Souverain » (image intégrée), le blanc du pingouin d'« Open
//      Source » ;
//    - libellés en vrai texte : lisibles par les moteurs, modifiables ici.
//
//  Les SVG sont lus une fois par visite (cache du module), nettoyés
//  (aucun script, aucun attribut on…), puis insérés dans la page : une
//  balise <img> ne permettrait pas de les recolorer.
// =====================================================================

import React, { useEffect, useState } from 'react';

const BASE = 'https://dgtctavkmcyhqopngcxk.supabase.co/storage/v1/object/public/PiloTerra/logo/v2/';

interface Valeur {
  libelle: string;
  fichier: string;
  /** Classe de couleur : principale (pilo-green) ou secondaire (pilo-brown). */
  couleur: 'text-pilo-green' | 'text-pilo-brown';
}

const VALEURS: Valeur[] = [
  { libelle: 'Souverain', fichier: 'souverain.svg', couleur: 'text-pilo-brown' },
  { libelle: 'Frugal', fichier: 'frugal.svg', couleur: 'text-pilo-green' },
  { libelle: 'Éthique', fichier: 'ethique.svg', couleur: 'text-pilo-brown' },
  { libelle: 'Open Source', fichier: 'open%20source.svg', couleur: 'text-pilo-green' },
  { libelle: "ROI'ste", fichier: "ROI'ste.svg", couleur: 'text-pilo-brown' },
];

/** Noir de l'export Canva, sous ses différentes écritures. */
const NOIR = /^(#000000|#000|black|rgb\(0,\s*0,\s*0\))$/i;

/** Rend un SVG Canva recolorable et sûr à insérer. */
const preparerSvg = (texte: string): string | null => {
  const doc = new DOMParser().parseFromString(texte, 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return null;

  // Sécurité : aucun script ni gestionnaire d'événement.
  doc.querySelectorAll('script, foreignObject').forEach((e) => e.remove());
  doc.querySelectorAll('*').forEach((e) => {
    [...e.attributes].forEach((a) => {
      if (/^on/i.test(a.name)) e.removeAttribute(a.name);
    });
    // Le noir prend la couleur du texte ; le reste (drapeau, blanc) ne bouge pas.
    for (const attr of ['fill', 'stroke']) {
      const v = e.getAttribute(attr);
      if (v && NOIR.test(v.trim())) e.setAttribute(attr, 'currentColor');
    }
    const style = e.getAttribute('style');
    if (style) e.setAttribute('style', style.replace(/(fill|stroke)\s*:\s*(#000000|#000|black)/gi, '$1:currentColor'));
  });

  // Taille pilotée par le conteneur (l'export Canva fait 3 780 px).
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  return new XMLSerializer().serializeToString(svg);
};

// Cache du module : une seule lecture par visite, même si la page est
// réaffichée.
const cache = new Map<string, Promise<string | null>>();
const chargerSvg = (fichier: string): Promise<string | null> => {
  if (!cache.has(fichier)) {
    cache.set(
      fichier,
      fetch(BASE + fichier)
        .then((r) => (r.ok ? r.text() : null))
        .then((t) => (t ? preparerSvg(t) : null))
        .catch(() => null),
    );
  }
  return cache.get(fichier)!;
};

export const PictosValeurs: React.FC = () => {
  const [svgs, setSvgs] = useState<(string | null)[]>(() => VALEURS.map(() => null));

  useEffect(() => {
    let annule = false;
    Promise.all(VALEURS.map((v) => chargerSvg(v.fichier))).then((res) => {
      if (!annule) setSvgs(res);
    });
    return () => { annule = true; };
  }, []);

  return (
    <ul className="flex flex-wrap justify-center gap-x-6 gap-y-4 sm:gap-x-12 w-full max-w-4xl" aria-label="Valeurs PiloTerra">
      {VALEURS.map((v, i) => (
        <li key={v.libelle} className={`flex flex-col items-center ${v.couleur}`}>
          {svgs[i] ? (
            <div className="w-20 h-20 sm:w-28 sm:h-28" dangerouslySetInnerHTML={{ __html: svgs[i] as string }} />
          ) : (
            // Emplacement réservé : la mise en page ne saute pas au chargement.
            <div className="w-20 h-20 sm:w-28 sm:h-28" />
          )}
          <span className="mt-1 text-sm sm:text-base font-medium">{v.libelle}</span>
        </li>
      ))}
    </ul>
  );
};

export default PictosValeurs;
