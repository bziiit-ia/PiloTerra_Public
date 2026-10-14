// =====================================================================
//  PILOTERRA — Export des fiches défi d'une organisation
//
//  L'administrateur choisit les fiches (toutes par défaut) et obtient un
//  fichier CSV ouvrable dans Excel : titre, genèse du problème, défi clé,
//  pistes de réflexion, scores ROI et complexité.
//
//  Le fichier est fabriqué dans le navigateur à partir des fiches déjà
//  chargées à l'écran : aucun appel réseau, aucune donnée supplémentaire
//  lue en base.
//
//  Fichier autonome : ne dépend que de React et lucide-react. Le type
//  attendu est structurel, DefiView le satisfait déjà. Se recopie tel
//  quel dans le dépôt de production.
// =====================================================================

import React, { useMemo, useState, useEffect } from 'react';
import { X, Download, CheckSquare, Square, FileSpreadsheet } from 'lucide-react';

/** Ce dont l'export a besoin. `DefiView` correspond déjà à cette forme. */
// Les champs acceptent null : selon les versions du portail, une fiche non
// encore analysée porte null plutôt que undefined.
export interface FicheExportable {
  id: string;
  created_at?: string | null;
  user_id?: string | null;
  titreDefi?: string | null;
  /** Genèse du problème (contexteProbleme de la fiche). */
  contexte_ia?: string | null;
  questionCle?: string | null;
  pistesDeReflexion1?: string | null;
  pistesDeReflexion2?: string | null;
  pistesDeReflexion3?: string | null;
  score_roi?: number | null;
  score_complexite?: number | null;
  score_roi_collectif?: number | null;
  score_complexite_collectif?: number | null;
  quadrant?: string | null;
}

interface ExportDefisModalProps {
  ouvert: boolean;
  onFermer: () => void;
  fiches: FicheExportable[];
  /** Sert à nommer le fichier. */
  nomOrganisation?: string;
  /** Nom lisible de l'auteur d'une fiche, si le parent sait le donner. */
  nomAuteur?: (userId?: string | null) => string;
}

// ---------------------------------------------------------------------
//  Fabrication du CSV
// ---------------------------------------------------------------------

const COLONNES = [
  'Titre de la fiche',
  'Genèse du problème',
  'Votre défi clé',
  'Piste de réflexion 1',
  'Piste de réflexion 2',
  'Piste de réflexion 3',
  'Score ROI',
  'Score complexité',
  'Score ROI collectif',
  'Score complexité collective',
  'Quadrant',
  'Auteur',
  'Date de création',
];

/** Excel attend des champs entre guillemets, les guillemets internes doublés. */
const champ = (valeur: unknown): string => {
  const texte = valeur === null || valeur === undefined ? '' : String(valeur);
  return `"${texte.replace(/"/g, '""')}"`;
};

export const construireCsv = (
  fiches: FicheExportable[],
  nomAuteur?: (userId?: string | null) => string
): string => {
  const lignes = [COLONNES.map(champ).join(';')];

  for (const f of fiches) {
    lignes.push(
      [
        f.titreDefi || '',
        f.contexte_ia || '',
        f.questionCle || '',
        f.pistesDeReflexion1 || '',
        f.pistesDeReflexion2 || '',
        f.pistesDeReflexion3 || '',
        f.score_roi ?? '',
        f.score_complexite ?? '',
        f.score_roi_collectif ?? '',
        f.score_complexite_collectif ?? '',
        f.quadrant || '',
        nomAuteur ? nomAuteur(f.user_id) : '',
        f.created_at ? new Date(f.created_at).toLocaleDateString('fr-FR') : '',
      ]
        .map(champ)
        .join(';')
    );
  }

  // Séparateur de ligne Windows : Excel le préfère.
  return lignes.join('\r\n');
};

const nomFichier = (nomOrganisation?: string): string => {
  const base = (nomOrganisation || 'organisation')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const jour = new Date().toISOString().slice(0, 10);
  return `fiches-defi-${base}-${jour}.csv`;
};

// ---------------------------------------------------------------------
//  Composant
// ---------------------------------------------------------------------

export const ExportDefisModal: React.FC<ExportDefisModalProps> = ({
  ouvert,
  onFermer,
  fiches,
  nomOrganisation,
  nomAuteur,
}) => {
  const [selection, setSelection] = useState<string[]>([]);

  // À chaque ouverture : tout est coché, cas de loin le plus fréquent.
  useEffect(() => {
    if (ouvert) setSelection(fiches.map((f) => f.id));
  }, [ouvert, fiches]);

  const retenues = useMemo(
    () => fiches.filter((f) => selection.includes(f.id)),
    [fiches, selection]
  );

  if (!ouvert) return null;

  const basculer = (id: string) =>
    setSelection((prec) => (prec.includes(id) ? prec.filter((x) => x !== id) : [...prec, id]));

  const toutBasculer = () =>
    setSelection((prec) => (prec.length === fiches.length ? [] : fiches.map((f) => f.id)));

  const exporter = () => {
    if (!retenues.length) return;
    // Le BOM est indispensable : sans lui, Excel lit les accents de travers.
    const contenu = '﻿' + construireCsv(retenues, nomAuteur);
    const blob = new Blob([contenu], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = nomFichier(nomOrganisation);
    document.body.appendChild(lien);
    lien.click();
    document.body.removeChild(lien);
    URL.revokeObjectURL(url);
    onFermer();
  };

  const toutesCochees = selection.length === fiches.length && fiches.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onFermer}
      role="dialog"
      aria-modal="true"
      aria-label="Exporter les fiches défi"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-6 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Exporter les fiches défi</h3>
              <p className="text-sm text-slate-500 mt-0.5">
                Un fichier CSV ouvrable dans Excel : titre, genèse du problème, défi clé,
                pistes de réflexion et scores.
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

        <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
          <button
            onClick={toutBasculer}
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-emerald-700"
          >
            {toutesCochees ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
            {toutesCochees ? 'Tout décocher' : 'Tout cocher'}
          </button>
          <span className="text-sm text-slate-500">
            {retenues.length} fiche{retenues.length > 1 ? 's' : ''} sur {fiches.length}
          </span>
        </div>

        <div className="overflow-y-auto divide-y divide-slate-50">
          {fiches.length === 0 && (
            <p className="p-8 text-center text-slate-400 italic">
              Aucune fiche défi à exporter pour le moment.
            </p>
          )}
          {fiches.map((f) => {
            const cochee = selection.includes(f.id);
            return (
              <label
                key={f.id}
                className="flex items-start gap-3 px-6 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={cochee}
                  onChange={() => basculer(f.id)}
                  className="mt-1 w-4 h-4 accent-emerald-600 shrink-0"
                />
                <span className="min-w-0">
                  <span className="block font-medium text-slate-800 truncate">
                    {f.titreDefi || 'Analyse en cours…'}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {nomAuteur ? `${nomAuteur(f.user_id)} · ` : ''}
                    {f.created_at ? new Date(f.created_at).toLocaleDateString('fr-FR') : ''}
                    {f.score_roi !== undefined && f.score_roi !== null
                      ? ` · ROI ${f.score_roi} · complexité ${f.score_complexite ?? '—'}`
                      : ''}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/60">
          <button
            onClick={onFermer}
            className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={exporter}
            disabled={retenues.length === 0}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-4 h-4" />
            Exporter en CSV
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportDefisModal;
