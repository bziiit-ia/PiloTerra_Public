// =====================================================================
//  PILOTERRA — MULTI-MARCHÉ · L'accroche de la vitrine (étape 6)
//
//  « Votre portail IA open source pour » + le mot du marché, dans sa
//  couleur d'accent :
//    - marché déterminé (choisi, dans l'URL ou assigné) → phrase fixe ;
//    - vitrine → le mot tourne entre les marchés actifs du référentiel.
//      Un marché désactivé en base (marches.actif = false) sort donc de la
//      rotation sans toucher au code : c'est le levier de l'ouverture
//      groupée des trois marchés.
//  Mouvement réduit demandé par le système → pas de rotation, les trois
//  mots sont affichés ensemble.
//
//  Tant que sql/etape6_vitrine_tri_marche.sql n'est pas passé (pas de
//  mot_accroche), on retombe sur la baseline du référentiel.
// =====================================================================

import React, { useEffect, useState } from 'react';
import { useMarche } from './MarcheContext';
import { DEBUT_ACCROCHE, Marche } from './marcheShared';

const DUREE_AFFICHAGE_MS = 2600;
const DUREE_FONDU_MS = 350;

const prefereMouvementReduit = (): boolean => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

const Mot: React.FC<{ marche: Marche }> = ({ marche }) => (
  <span className="font-bold" style={{ color: marche.couleur_accent }}>
    {marche.mot_accroche}
  </span>
);

export const AccrocheMarche: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { marches, marcheCourant, baseline, chargement } = useMarche();

  const tournants = marches.filter((m) => !!m.mot_accroche);
  const [indice, setIndice] = useState(0);
  const [visible, setVisible] = useState(true);
  const [mouvementReduit] = useState(prefereMouvementReduit);

  const enRotation = !marcheCourant && tournants.length > 1 && !mouvementReduit;

  useEffect(() => {
    if (!enRotation) return;
    let fondu: ReturnType<typeof setTimeout> | undefined;
    const minuteur = setInterval(() => {
      setVisible(false);
      fondu = setTimeout(() => {
        setIndice((i) => (i + 1) % tournants.length);
        setVisible(true);
      }, DUREE_FONDU_MS);
    }, DUREE_AFFICHAGE_MS);
    return () => { clearInterval(minuteur); if (fondu) clearTimeout(fondu); };
  }, [enRotation, tournants.length]);

  // Pendant le chargement du référentiel : début de phrase seul, pour ne pas
  // afficher un marché puis un autre.
  if (chargement && tournants.length === 0) {
    return <p className={className}>{DEBUT_ACCROCHE}&nbsp;…</p>;
  }

  // Référentiel sans mot d'accroche (SQL de l'étape 6 pas encore passé)
  if (tournants.length === 0) {
    return <p className={className}>{baseline}</p>;
  }

  // Marché déterminé : phrase fixe
  if (marcheCourant?.mot_accroche) {
    return (
      <p className={className}>
        {DEBUT_ACCROCHE} <Mot marche={marcheCourant} />
      </p>
    );
  }

  // Mouvement réduit : les mots ensemble, sans animation
  if (!enRotation) {
    return (
      <p className={className}>
        {DEBUT_ACCROCHE}{' '}
        {tournants.map((m, i) => (
          <React.Fragment key={m.code}>
            {i > 0 && (i === tournants.length - 1 ? ' et ' : ', ')}
            <Mot marche={m} />
          </React.Fragment>
        ))}
      </p>
    );
  }

  const courant = tournants[indice % tournants.length];
  return (
    <p className={className}>
      {DEBUT_ACCROCHE}{' '}
      <span
        className="inline-block"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(0.25em)',
          transition: `opacity ${DUREE_FONDU_MS}ms ease, transform ${DUREE_FONDU_MS}ms ease`,
        }}
        aria-hidden="true"
      >
        <Mot marche={courant} />
      </span>
      {/* Lecteurs d'écran : la phrase complète, sans rotation */}
      <span className="sr-only">
        {tournants.map((m) => m.mot_accroche).join(', ')}
      </span>
    </p>
  );
};
