// =====================================================================
//  PILOTERRA — MULTI-MARCHÉ · Le sélecteur
//
//  Deux variantes : « barre » pour le header desktop, « mobile » pour
//  le menu déroulant. Le composant ne rend rien tant que le
//  multi-marché n'est pas ouvert — inutile de conditionner son appel
//  côté Header.
//
//  À placer dans : components/SelecteurMarche.tsx
// =====================================================================

import React, { useState, useRef, useEffect } from 'react';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { useMarche } from './MarcheContext';

interface SelecteurMarcheProps {
  variante?: 'barre' | 'mobile';
}

export const SelecteurMarche: React.FC<SelecteurMarcheProps> = ({ variante = 'barre' }) => {
  const { marches, marcheActif, marcheCourant, choisirMarche, selecteurDisponible, marcheVerrouille, chargement } = useMarche();
  const [ouvert, setOuvert] = useState(false);
  const conteneur = useRef<HTMLDivElement>(null);

  // Fermeture au clic extérieur
  useEffect(() => {
    if (!ouvert) return;
    const auClic = (e: MouseEvent) => {
      if (conteneur.current && !conteneur.current.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener('mousedown', auClic);
    return () => document.removeEventListener('mousedown', auClic);
  }, [ouvert]);

  //  Tant que la cascade n'a pas tranché, on n'affiche rien : sinon le
  //  menu déroulant s'affiche puis bascule en badge figé dès que les
  //  appels RPC reviennent, ce qui fait clignoter le header.
  if (!selecteurDisponible || chargement) return null;

  const choisir = (code: string | null) => {
    choisirMarche(code);
    setOuvert(false);
  };

  const pastille = (couleur: string) => (
    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: couleur }} />
  );

  // ── Marché verrouillé : badge figé ─────────────────────────────────
  //  L'utilisateur est assigné au marché de son profil ou de son
  //  organisation. On l'affiche quand même, pour qu'il comprenne
  //  pourquoi son portail ne montre que ce contenu.
  if (marcheVerrouille && marcheCourant) {
    const titre = `Votre espace est configuré sur le marché « ${marcheCourant.libelle} »`;

    if (variante === 'mobile') {
      return (
        <div className="space-y-1">
          <div className="px-4 py-2 text-xs font-black text-pilo-green uppercase tracking-widest opacity-70">
            Votre secteur
          </div>
          <div className="px-4 py-3 flex items-center gap-3 text-base font-bold text-slate-700" title={titre}>
            {pastille(marcheCourant.couleur_accent)}
            {marcheCourant.libelle}
          </div>
        </div>
      );
    }

    return (
      <div
        title={titre}
        className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 bg-slate-50 text-sm font-bold text-slate-600 whitespace-nowrap flex-shrink-0"
      >
        {pastille(marcheCourant.couleur_accent)}
        <span className="hidden xl:inline">{marcheCourant.libelle}</span>
      </div>
    );
  }

  // ── Variante mobile : liste à plat, pas de menu déroulant ──────────
  if (variante === 'mobile') {
    return (
      <div className="space-y-1">
        <div className="px-4 py-2 text-xs font-black text-pilo-green uppercase tracking-widest opacity-70">
          Votre secteur
        </div>
        {marches.map((m) => (
          <button
            key={m.code}
            onClick={() => choisir(m.code)}
            className={`w-full text-left px-4 py-3 rounded-xl font-medium flex items-center gap-3 text-base transition-colors ${
              marcheActif === m.code ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            {pastille(m.couleur_accent)}
            {m.libelle}
            {marcheActif === m.code && <Check className="w-4 h-4 ml-auto text-pilo-green" />}
          </button>
        ))}
        <button
          onClick={() => choisir(null)}
          className={`w-full text-left px-4 py-3 rounded-xl font-medium flex items-center gap-3 text-base transition-colors ${
            marcheActif === null ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Globe className="w-4 h-4 text-slate-400" />
          Tous les marchés
          {marcheActif === null && <Check className="w-4 h-4 ml-auto text-pilo-green" />}
        </button>
      </div>
    );
  }

  // ── Variante barre : bouton + menu déroulant ───────────────────────
  return (
    <div className="relative" ref={conteneur}>
      <button
        onClick={() => setOuvert(!ouvert)}
        className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 bg-white/80 text-sm font-bold text-slate-700 whitespace-nowrap flex-shrink-0 hover:border-slate-300 hover:bg-white transition-all"
        title="Changer de secteur"
      >
        {marcheCourant ? pastille(marcheCourant.couleur_accent) : <Globe className="w-4 h-4 text-slate-400" />}
        <span className="hidden xl:inline">{marcheCourant?.libelle ?? 'Tous les marchés'}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${ouvert ? 'rotate-180' : ''}`} />
      </button>

      {ouvert && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-100 p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="px-3 py-2 text-[11px] font-black text-slate-400 uppercase tracking-widest">
            Votre secteur
          </div>
          {marches.map((m) => (
            <button
              key={m.code}
              onClick={() => choisir(m.code)}
              className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm transition-colors ${
                marcheActif === m.code ? 'bg-slate-50 font-bold text-slate-900' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {pastille(m.couleur_accent)}
              {m.libelle}
              {marcheActif === m.code && <Check className="w-4 h-4 ml-auto text-pilo-green" />}
            </button>
          ))}

          <div className="my-1 border-t border-slate-100" />

          <button
            onClick={() => choisir(null)}
            className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm transition-colors ${
              marcheActif === null ? 'bg-slate-50 font-bold text-slate-900' : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Globe className="w-4 h-4 text-slate-400" />
            Tous les marchés
            {marcheActif === null && <Check className="w-4 h-4 ml-auto text-pilo-green" />}
          </button>
        </div>
      )}
    </div>
  );
};
