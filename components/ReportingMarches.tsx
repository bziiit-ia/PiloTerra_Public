// =====================================================================
//  PILOTERRA — MULTI-MARCHÉ · Étape 10 : reporting segmenté par marché
//
//  Tableau « Activité par marché », en tête de la Tour de Contrôle
//  (SuperAdminDashboard.tsx). Une colonne par marché, plus « Sans
//  marché » et, pour les contenus, « Transverse ». Même période que la
//  Tour de Contrôle, tendance par rapport à la période précédente de même
//  durée, export CSV.
//
//  Tout est calculé en base par reporting_marches() (super admin
//  seulement, sql/etape10_reporting_marches.sql) :
//    - une action (fiche défi, cas d'usage, charte, appel IA) compte pour
//      le marché gravé à sa création ;
//    - un état (comptes, organisations, profils de maturité) compte pour
//      le marché d'aujourd'hui, pris à la fin de la période ;
//    - un contenu compte pour chacun de ses marchés.
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Loader2, AlertTriangle, Download, BarChart3, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { useMarche } from './MarcheContext';

export type PlageReporting = '1j' | '7j' | '30j' | 'overall' | 'custom';

interface ReportingMarchesProps {
  plage: PlageReporting;
  /** Dates « Sur-mesure » (AAAA-MM-JJ), comme la Tour de Contrôle. */
  debutPerso?: string;
  finPerso?: string;
  /** Marché mis en avant ('tous' = aucun). */
  marcheFiltre: string;
}

interface Ligne {
  marche: string;
  indicateur: string;
  valeur: number;
  precedent: number | null;
}

type Format = 'nombre' | 'decimal' | 'usd' | 'carbone';

interface Indicateur {
  code: string;
  libelle: string;
  format: Format;
  /** État à la fin de la période (pas un flux) : pas de colonne transverse. */
  etat?: boolean;
  /** Indicateur de contenu : la colonne « Transverse » a du sens. */
  contenu?: boolean;
  aide?: string;
  /** Une hausse est une mauvaise nouvelle (coût, carbone). */
  inverse?: boolean;
}

const FAMILLES: { titre: string; indicateurs: Indicateur[] }[] = [
  {
    titre: 'Adoption',
    indicateurs: [
      { code: 'utilisateurs_total', libelle: 'Comptes', format: 'nombre', etat: true, aide: 'Comptes existants à la fin de la période, selon le marché actuel (organisation, sinon profil).' },
      { code: 'utilisateurs_nouveaux', libelle: 'Nouveaux comptes', format: 'nombre' },
      { code: 'utilisateurs_connectes', libelle: 'Connectés sur la période', format: 'nombre', aide: "Comptes dont la dernière connexion tombe dans la période (l'authentification ne garde que la dernière)." },
      { code: 'organisations_total', libelle: 'Organisations', format: 'nombre', etat: true },
      { code: 'organisations_nouvelles', libelle: 'Nouvelles organisations', format: 'nombre' },
    ],
  },
  {
    titre: 'Production',
    indicateurs: [
      { code: 'fiches_defi', libelle: 'Fiches défi', format: 'nombre', aide: 'Marché gravé à la création de la fiche.' },
      { code: 'cas_usage', libelle: "Cas d'usage", format: 'nombre' },
      { code: 'chartes', libelle: 'Chartes IA', format: 'nombre' },
    ],
  },
  {
    titre: 'Maturité',
    indicateurs: [
      { code: 'maturite_score_moyen', libelle: 'Score moyen', format: 'decimal', etat: true },
      { code: 'profil_graine', libelle: '🌱 La Graine', format: 'nombre', etat: true },
      { code: 'profil_pousse', libelle: '🌿 La Pousse', format: 'nombre', etat: true },
      { code: 'profil_arbre', libelle: "🌳 L'Arbre", format: 'nombre', etat: true },
      { code: 'profil_semeur', libelle: '🚜 Le Semeur', format: 'nombre', etat: true },
      { code: 'profil_autre', libelle: 'Autre profil (ancien test)', format: 'nombre', etat: true },
    ],
  },
  {
    titre: 'Contenus',
    indicateurs: [
      { code: 'ressources_publiees', libelle: 'Ressources publiées', format: 'nombre', etat: true, contenu: true, aide: 'Hors actualités. Un contenu de plusieurs marchés compte pour chacun.' },
      { code: 'pages_referencement', libelle: 'Pages de référencement', format: 'nombre', etat: true, contenu: true, aide: 'Fiches indexables. Une page de marché demande au moins 3 contenus indexables (transverses compris).' },
      { code: 'prompts_publics', libelle: 'Prompts publics', format: 'nombre', etat: true, contenu: true },
      { code: 'actualites_collectees', libelle: 'Actualités collectées', format: 'nombre', contenu: true },
      { code: 'actualites_publiees', libelle: 'Actualités publiées', format: 'nombre', contenu: true },
    ],
  },
  {
    titre: 'Usage IA',
    indicateurs: [
      { code: 'ia_appels', libelle: 'Appels aux agents IA', format: 'nombre' },
      { code: 'ia_cout_usd', libelle: 'Coût IA', format: 'usd', inverse: true },
      { code: 'ia_carbone_g', libelle: 'Carbone IA', format: 'carbone', inverse: true },
      { code: 'pages_vues', libelle: 'Pages vues (comptes connectés)', format: 'nombre', aide: 'Les visiteurs non connectés sont suivis dans Google Analytics, paramètre « marche ».' },
      { code: 'infra_carbone_g', libelle: 'Carbone de la navigation', format: 'carbone', inverse: true },
    ],
  },
];

const formater = (v: number | null | undefined, format: Format): string => {
  if (v === null || v === undefined) return '—';
  switch (format) {
    case 'usd': return `$${v.toFixed(2)}`;
    case 'carbone': return `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} g`;
    case 'decimal': return v.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
    default: return v.toLocaleString('fr-FR');
  }
};

/** Bornes de la période, mêmes règles que la Tour de Contrôle. */
const calculerBornes = (plage: PlageReporting, debutPerso?: string, finPerso?: string) => {
  const maintenant = new Date();
  const jours = { '1j': 1, '7j': 7, '30j': 30 } as const;
  if (plage in jours) {
    const n = jours[plage as keyof typeof jours];
    return { debut: new Date(maintenant.getTime() - n * 86400000), fin: null as Date | null };
  }
  if (plage === 'custom') {
    const debut = debutPerso ? new Date(debutPerso) : null;
    let fin: Date | null = null;
    if (finPerso) { fin = new Date(finPerso); fin.setHours(23, 59, 59, 999); }
    return { debut, fin };
  }
  return { debut: null, fin: null };
};

const Tendance: React.FC<{ valeur: number; precedent: number | null; inverse?: boolean }> = ({ valeur, precedent, inverse }) => {
  if (precedent === null) return null;
  if (precedent === 0 && valeur === 0) return null;
  if (valeur === precedent) return <Minus className="inline h-3 w-3 text-slate-300" />;
  const hausse = valeur > precedent;
  const pct = precedent === 0 ? null : Math.round(((valeur - precedent) / precedent) * 100);
  return (
    <span className={`ml-1 inline-flex items-center text-[10px] font-bold ${hausse !== !!inverse ? 'text-succes-600' : 'text-red-500'}`}>
      {hausse ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {pct === null ? 'nouveau' : `${pct > 0 ? '+' : ''}${pct} %`}
    </span>
  );
};

export const ReportingMarches: React.FC<ReportingMarchesProps> = ({ plage, debutPerso, finPerso, marcheFiltre }) => {
  const { marches } = useMarche();
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const { debut, fin } = useMemo(() => calculerBornes(plage, debutPerso, finPerso), [plage, debutPerso, finPerso]);
  const avecTendance = debut !== null;

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    const { data, error } = await supabase.rpc('reporting_marches', {
      p_debut: debut ? debut.toISOString() : null,
      p_fin: fin ? fin.toISOString() : null,
    });
    if (error) {
      setErreur(
        /reporting_marches|function/i.test(error.message)
          ? `Reporting indisponible : exécuter sql/etape10_reporting_marches.sql (${error.message}).`
          : error.message,
      );
      setLignes([]);
    } else {
      setLignes(((data ?? []) as any[]).map((l) => ({
        marche: l.marche,
        indicateur: l.indicateur,
        valeur: Number(l.valeur ?? 0),
        precedent: l.precedent === null || l.precedent === undefined ? null : Number(l.precedent),
      })));
    }
    setChargement(false);
  }, [debut, fin]);

  useEffect(() => { charger(); }, [charger]);

  // Colonnes : marchés du référentiel, puis « Sans marché », puis « Transverse »
  const colonnes = useMemo(() => [
    ...marches.map((m) => ({ code: m.code, libelle: m.libelle, couleur: m.couleur_accent })),
    { code: 'sans_marche', libelle: 'Sans marché', couleur: '#94a3b8' },
    { code: 'transverse', libelle: 'Transverse', couleur: '#cbd5e1' },
  ], [marches]);

  const index = useMemo(() => {
    const m = new Map<string, Ligne>();
    lignes.forEach((l) => m.set(`${l.marche}|${l.indicateur}`, l));
    return m;
  }, [lignes]);

  const cellule = (col: string, ind: Indicateur) => {
    // Transverse n'a de sens que pour les contenus
    if (col === 'transverse' && !ind.contenu) return { texte: '', ligne: null as Ligne | null };
    const l = index.get(`${col}|${ind.code}`) ?? null;
    return { texte: formater(l ? l.valeur : (ind.format === 'decimal' ? null : 0), ind.format), ligne: l };
  };

  const exporterCsv = () => {
    const entete = ['Famille', 'Indicateur', ...colonnes.map((c) => c.libelle)];
    const rangs = FAMILLES.flatMap((f) => f.indicateurs.map((ind) => [
      f.titre,
      ind.libelle,
      ...colonnes.map((c) => {
        if (c.code === 'transverse' && !ind.contenu) return '';
        const l = index.get(`${c.code}|${ind.code}`);
        return l ? String(l.valeur).replace('.', ',') : '0';
      }),
    ]));
    const echapper = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csv = [entete, ...rangs].map((r) => r.map(echapper).join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `piloterra-activite-par-marche-${plage}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-6 py-4">
        <BarChart3 className="h-5 w-5 text-slate-500" />
        <div>
          <h3 className="font-bold text-slate-900">Activité par marché</h3>
          <p className="text-xs text-slate-500">
            {avecTendance ? 'Tendance par rapport à la période précédente de même durée.' : 'Depuis le début. Choisir une période pour voir les tendances.'}
            {' '}Les actions comptent pour le marché du moment ; les états, pour le marché actuel.
          </p>
        </div>
        <button
          onClick={exporterCsv}
          disabled={chargement || !!erreur}
          className="ml-auto inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-1.5 text-xs font-bold text-white hover:bg-slate-900 disabled:opacity-40"
        >
          <Download className="h-4 w-4" /> Exporter CSV
        </button>
      </div>

      {chargement ? (
        <div className="flex items-center gap-2 px-6 py-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Calcul des indicateurs…
        </div>
      ) : erreur ? (
        <div className="m-6 flex items-center gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {erreur}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-6 py-3 font-bold">Indicateur</th>
                {colonnes.map((c) => (
                  <th
                    key={c.code}
                    className={`px-4 py-3 text-right font-bold ${marcheFiltre === c.code ? 'bg-slate-50 text-slate-700' : ''}`}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.couleur }} />
                      {c.libelle}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FAMILLES.map((f) => (
                <React.Fragment key={f.titre}>
                  <tr>
                    <td colSpan={colonnes.length + 1} className="bg-slate-50 px-6 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      {f.titre}
                    </td>
                  </tr>
                  {f.indicateurs.map((ind) => (
                    <tr key={ind.code} className="border-t border-slate-50 hover:bg-slate-50/50">
                      <td className="px-6 py-2 text-slate-700" title={ind.aide}>
                        {ind.libelle}
                        {ind.etat && <span className="ml-1 text-[10px] text-slate-400">(état)</span>}
                      </td>
                      {colonnes.map((c) => {
                        const { texte, ligne } = cellule(c.code, ind);
                        // Seuil des pages de marché : moins de 3 pages indexables
                        const sousSeuil = ind.code === 'pages_referencement'
                          && !['sans_marche', 'transverse'].includes(c.code)
                          && (ligne?.valeur ?? 0) + (index.get(`transverse|${ind.code}`)?.valeur ?? 0) < 3;
                        return (
                          <td
                            key={c.code}
                            className={`px-4 py-2 text-right tabular-nums ${marcheFiltre === c.code ? 'bg-slate-50 font-bold text-slate-900' : 'text-slate-600'} ${sousSeuil ? 'text-amber-600' : ''}`}
                            title={sousSeuil ? 'Moins de 3 pages indexables : la page de ce marché n\'est pas générée.' : undefined}
                          >
                            {texte}
                            {ligne && avecTendance && !ind.etat && <Tendance valeur={ligne.valeur} precedent={ligne.precedent} inverse={ind.inverse} />}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ReportingMarches;
