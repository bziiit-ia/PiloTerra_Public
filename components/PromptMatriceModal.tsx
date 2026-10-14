// =====================================================================
//  PILOTERRA — Fenêtre « Prompt d'analyse de la matrice »
//
//  Montre à l'administrateur d'organisation le prompt exact qui place
//  ses fiches défi sur la matrice, avec un bouton pour le copier.
//  Aucune donnée n'est lue ni écrite : c'est un texte de référence.
//
//  Fichier autonome : ne dépend que de lucide-react et de
//  promptMatriceShared.ts. Se recopie tel quel dans le dépôt de prod.
// =====================================================================

import React, { useState } from 'react';
import { X, Copy, Check, ScrollText } from 'lucide-react';
import { PROMPT_MATRICE, SOURCE_PROMPT_MATRICE, MAJ_PROMPT_MATRICE } from './promptMatriceShared';

interface PromptMatriceModalProps {
  ouvert: boolean;
  onFermer: () => void;
}

export const PromptMatriceModal: React.FC<PromptMatriceModalProps> = ({ ouvert, onFermer }) => {
  const [copie, setCopie] = useState(false);

  if (!ouvert) return null;

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(PROMPT_MATRICE);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      /* presse-papiers refusé : le texte reste sélectionnable à la main */
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onFermer}
      role="dialog"
      aria-modal="true"
      aria-label="Prompt d'analyse de la matrice"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-6 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <ScrollText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Prompt d'analyse de la matrice</h3>
              <p className="text-sm text-slate-500 mt-0.5">
                Les consignes exactes données à l'IA pour noter chaque fiche défi et la placer
                sur la matrice.
              </p>
            </div>
          </div>
          <button
            onClick={onFermer}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
            title="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          <pre className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-5 font-mono">
{PROMPT_MATRICE}
          </pre>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/60">
          <p className="text-xs text-slate-500">
            Source : {SOURCE_PROMPT_MATRICE} · à jour du {MAJ_PROMPT_MATRICE}
          </p>
          <button
            onClick={copier}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors"
          >
            {copie ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copie ? 'Copié' : 'Copier le prompt'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PromptMatriceModal;
