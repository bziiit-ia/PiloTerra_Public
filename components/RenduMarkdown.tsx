import React from 'react';

/**
 * Rendu markdown minimal, aligné sur ce que produisent les agents de
 * rédaction n8n : titres de niveau 2 et 3, listes à puces, gras.
 * Volontairement sans dépendance supplémentaire.
 *
 * Partagé par toutes les pop-up de fiche (agents, formations, sources
 * de données, prompts).
 */
export const RenduMarkdown: React.FC<{ texte?: string }> = ({ texte }) => {
  if (!texte) return null;

  const gras = (t: string) =>
    t.split(/(\*\*[^*]+\*\*)/g).map((morceau, i) =>
      morceau.startsWith('**') && morceau.endsWith('**') ? (
        <strong key={i} className="font-bold text-slate-900">
          {morceau.slice(2, -2)}
        </strong>
      ) : (
        <React.Fragment key={i}>{morceau}</React.Fragment>
      )
    );

  const blocs: React.ReactNode[] = [];
  let puces: string[] = [];

  const viderPuces = (cle: string) => {
    if (!puces.length) return;
    blocs.push(
      <ul key={cle} className="list-disc pl-5 space-y-1.5 my-3 text-slate-700">
        {puces.map((p, i) => (
          <li key={i}>{gras(p)}</li>
        ))}
      </ul>
    );
    puces = [];
  };

  texte.split(/\r?\n/).forEach((ligneBrute, index) => {
    const ligne = ligneBrute.trim();
    const cle = `bloc-${index}`;

    if (!ligne) {
      viderPuces(`liste-${index}`);
      return;
    }
    if (ligne.startsWith('### ')) {
      viderPuces(`liste-${index}`);
      blocs.push(
        <h4 key={cle} className="text-base font-bold text-slate-900 mt-5 mb-1.5">
          {ligne.slice(4)}
        </h4>
      );
      return;
    }
    if (ligne.startsWith('## ')) {
      viderPuces(`liste-${index}`);
      blocs.push(
        <h3 key={cle} className="text-lg font-black text-emerald-700 mt-6 mb-2">
          {ligne.slice(3)}
        </h3>
      );
      return;
    }
    if (ligne.startsWith('- ') || ligne.startsWith('* ')) {
      puces.push(ligne.slice(2));
      return;
    }
    viderPuces(`liste-${index}`);
    blocs.push(
      <p key={cle} className="text-slate-700 leading-relaxed my-3">
        {gras(ligne)}
      </p>
    );
  });
  viderPuces('liste-fin');

  return <>{blocs}</>;
};
