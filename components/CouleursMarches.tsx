// =====================================================================
//  PILOTERRA — MULTI-MARCHÉ · Étape 10 : couleurs des marchés
//
//  Écran super admin (onglet « Marchés » de SuperAdminDashboard.tsx).
//  Règle la couleur principale et la couleur secondaire de chaque marché,
//  dont le portail entier tire sa palette (paletteMarche.ts).
//
//  - Aperçu : applique la palette en cours d'édition à toute la page,
//    le temps de la vérifier sur les vrais écrans ; « Arrêter l'aperçu »
//    ou la sortie de l'onglet rendent la palette du marché affiché.
//  - Lisibilité : contraste du texte blanc sur la couleur principale
//    (boutons pleins) et de la nuance 600 sur fond blanc (textes). Un
//    avertissement, pas un blocage : l'arbitrage reste humain.
//  - Enregistrement : succès annoncé seulement si la base a réellement
//    écrit (une écriture refusée par la RLS ne renvoie pas d'erreur).
//
//  Nécessite sql/etape10_accent_visuel_marche.sql (couleur_secondaire).
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Palette, Eye, EyeOff, Save, RotateCcw, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useMarche } from './MarcheContext';
import {
  COULEUR_MARQUE, SECONDAIRE_MARQUE, NUANCES,
  appliquerPalette, calculerPalette, contraste, estCouleurValide, normaliserCouleur,
} from './paletteMarche';

interface LigneMarche {
  code: string;
  libelle: string;
  couleur_accent: string;
  couleur_secondaire: string | null;
  ordre: number;
  actif: boolean;
}

interface Brouillon {
  principale: string;
  /** Vide = brun doré de la marque. */
  secondaire: string;
}

type Niveau = 'ok' | 'limite' | 'faible';

/** 4,5 = texte courant ; 3 = gros texte, pictogramme. */
const niveauContraste = (ratio: number): Niveau =>
  ratio >= 4.5 ? 'ok' : ratio >= 3 ? 'limite' : 'faible';

const STYLE_NIVEAU: Record<Niveau, string> = {
  ok: 'bg-succes-50 text-succes-700 ring-succes-200',
  limite: 'bg-amber-50 text-amber-700 ring-amber-200',
  faible: 'bg-red-50 text-red-700 ring-red-200',
};

const LIBELLE_NIVEAU: Record<Niveau, string> = {
  ok: 'lisible',
  limite: 'limite',
  faible: 'peu lisible',
};

const PastilleContraste: React.FC<{ libelle: string; ratio: number }> = ({ libelle, ratio }) => {
  const niveau = niveauContraste(ratio);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${STYLE_NIVEAU[niveau]}`}>
      {libelle} : {ratio.toFixed(1).replace('.', ',')} · {LIBELLE_NIVEAU[niveau]}
    </span>
  );
};

/** Sélecteur de couleur + saisie hexadécimale, synchronisés. */
const ChampCouleur: React.FC<{
  valeur: string;
  onChange: (v: string) => void;
  vide?: string;
}> = ({ valeur, onChange, vide }) => {
  const affichee = valeur || vide || '#000000';
  const invalide = !!valeur && !estCouleurValide(valeur);
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={estCouleurValide(affichee) ? normaliserCouleur(affichee) : '#000000'}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-0.5"
      />
      <input
        type="text"
        value={valeur}
        placeholder={vide}
        onChange={(e) => onChange(e.target.value.trim())}
        className={`w-28 rounded-lg border px-2.5 py-1.5 font-mono text-sm ${invalide ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}
      />
    </div>
  );
};

export const CouleursMarches: React.FC = () => {
  const { marcheCourant, rechargerReferentiel } = useMarche();

  const [lignes, setLignes] = useState<LigneMarche[]>([]);
  const [brouillons, setBrouillons] = useState<Record<string, Brouillon>>({});
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [enregistrement, setEnregistrement] = useState<string | null>(null);
  const [message, setMessage] = useState<{ code: string; ok: boolean; texte: string } | null>(null);

  // -------------------------------------------------------------------
  //  Chargement : tous les marchés, actifs ou non
  // -------------------------------------------------------------------
  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    const { data, error } = await supabase
      .from('marches')
      .select('code, libelle, couleur_accent, couleur_secondaire, ordre, actif')
      .order('ordre');
    if (error) {
      setErreur(
        error.message.includes('couleur_secondaire')
          ? 'Colonne couleur_secondaire absente : exécuter sql/etape10_accent_visuel_marche.sql.'
          : error.message,
      );
      setChargement(false);
      return;
    }
    const liste = (data ?? []) as LigneMarche[];
    setLignes(liste);
    setBrouillons(Object.fromEntries(liste.map((m) => [m.code, {
      principale: m.couleur_accent,
      secondaire: m.couleur_secondaire ?? '',
    }])));
    setChargement(false);
  }, []);

  useEffect(() => { charger(); }, [charger]);

  // -------------------------------------------------------------------
  //  Aperçu sur toute la page
  // -------------------------------------------------------------------
  const restaurer = useCallback(() => {
    appliquerPalette(marcheCourant?.couleur_accent ?? null, marcheCourant?.couleur_secondaire ?? null);
  }, [marcheCourant]);

  useEffect(() => {
    if (!apercu) return;
    const b = brouillons[apercu];
    if (b && estCouleurValide(b.principale) && (!b.secondaire || estCouleurValide(b.secondaire))) {
      appliquerPalette(b.principale, b.secondaire || null);
    }
  }, [apercu, brouillons]);

  // En quittant l'onglet, la palette du marché affiché revient.
  useEffect(() => () => restaurer(), [restaurer]);

  const basculerApercu = (code: string) => {
    if (apercu === code) { setApercu(null); restaurer(); }
    else setApercu(code);
  };

  // -------------------------------------------------------------------
  //  Édition et enregistrement
  // -------------------------------------------------------------------
  const modifier = (code: string, champ: keyof Brouillon, valeur: string) => {
    setBrouillons((prec) => ({ ...prec, [code]: { ...prec[code], [champ]: valeur } }));
    setMessage(null);
  };

  const estModifie = (m: LigneMarche): boolean => {
    const b = brouillons[m.code];
    if (!b) return false;
    return normaliserCouleur(b.principale || '') !== normaliserCouleur(m.couleur_accent)
      || normaliserCouleur(b.secondaire || '') !== normaliserCouleur(m.couleur_secondaire ?? '');
  };

  const enregistrer = async (m: LigneMarche) => {
    const b = brouillons[m.code];
    if (!estCouleurValide(b.principale) || (b.secondaire && !estCouleurValide(b.secondaire))) {
      setMessage({ code: m.code, ok: false, texte: 'Couleur invalide : format attendu #rrggbb.' });
      return;
    }
    setEnregistrement(m.code);
    const { data, error } = await supabase
      .from('marches')
      .update({
        couleur_accent: normaliserCouleur(b.principale),
        couleur_secondaire: b.secondaire ? normaliserCouleur(b.secondaire) : null,
      })
      .eq('code', m.code)
      .select('code');
    setEnregistrement(null);

    if (error || !data || data.length === 0) {
      setMessage({
        code: m.code,
        ok: false,
        texte: error ? `Enregistrement refusé : ${error.message}` : "Rien n'a été enregistré : droits insuffisants ?",
      });
      return;
    }
    setMessage({ code: m.code, ok: true, texte: 'Couleurs enregistrées : le portail les applique maintenant.' });
    await charger();
    rechargerReferentiel();
  };

  const annuler = (m: LigneMarche) => {
    setBrouillons((prec) => ({
      ...prec,
      [m.code]: { principale: m.couleur_accent, secondaire: m.couleur_secondaire ?? '' },
    }));
    setMessage(null);
  };

  // -------------------------------------------------------------------
  //  Rendu
  // -------------------------------------------------------------------
  const palettes = useMemo(() => Object.fromEntries(
    Object.entries(brouillons).map(([code, b]) => [
      code,
      estCouleurValide(b.principale)
        ? calculerPalette(b.principale, estCouleurValide(b.secondaire) ? b.secondaire : null)
        : null,
    ]),
  ), [brouillons]);

  return (
    <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-start gap-3">
        <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700">
          <Palette className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Couleurs des marchés</h2>
          <p className="text-sm text-slate-500">
            Tout le portail prend la palette du marché affiché. La couleur de marque ({COULEUR_MARQUE})
            garde la palette historique. Secondaire vide = brun doré de la marque ({SECONDAIRE_MARQUE}).
            « Aperçu » applique la palette à toute la page sans rien enregistrer.
          </p>
        </div>
      </div>

      {chargement ? (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement des marchés…
        </div>
      ) : erreur ? (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {erreur}
        </div>
      ) : (
        <div className="space-y-4">
          {lignes.map((m) => {
            const b = brouillons[m.code];
            const palette = palettes[m.code];
            const modifie = estModifie(m);
            return (
              <div key={m.code} className={`rounded-xl border p-4 ${apercu === m.code ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-200'}`}>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                  <div className="w-36">
                    <p className="font-bold text-slate-900">{m.libelle}</p>
                    {!m.actif && <p className="text-xs text-slate-400">marché inactif</p>}
                  </div>

                  <div>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Principale</p>
                    <ChampCouleur valeur={b?.principale ?? ''} onChange={(v) => modifier(m.code, 'principale', v)} />
                  </div>

                  <div>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Secondaire</p>
                    <ChampCouleur
                      valeur={b?.secondaire ?? ''}
                      vide={SECONDAIRE_MARQUE}
                      onChange={(v) => modifier(m.code, 'secondaire', v)}
                    />
                  </div>

                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => basculerApercu(m.code)}
                      disabled={!palette}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                      {apercu === m.code ? <><EyeOff className="h-4 w-4" /> Arrêter l'aperçu</> : <><Eye className="h-4 w-4" /> Aperçu</>}
                    </button>
                    <button
                      onClick={() => { modifier(m.code, 'principale', COULEUR_MARQUE); modifier(m.code, 'secondaire', ''); }}
                      title="Revenir à la couleur de marque PiloTerra"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
                    >
                      <RotateCcw className="h-4 w-4" /> Marque
                    </button>
                    {modifie && (
                      <button onClick={() => annuler(m)} className="px-2 py-1.5 text-sm font-bold text-slate-500 hover:text-slate-700">
                        Annuler
                      </button>
                    )}
                    <button
                      onClick={() => enregistrer(m)}
                      disabled={!modifie || enregistrement === m.code}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
                    >
                      {enregistrement === m.code ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Enregistrer
                    </button>
                  </div>
                </div>

                {palette && (
                  <div className="mt-4">
                    <div className="flex overflow-hidden rounded-lg">
                      {NUANCES.map((n) => (
                        <div
                          key={n}
                          className="h-9 flex-1 px-1 pt-4 text-[10px] font-medium"
                          style={{ backgroundColor: palette.nuances[n], color: n >= 500 ? '#fff' : '#334155' }}
                          title={`${n} · ${palette.nuances[n]}`}
                        >
                          {n}
                        </div>
                      ))}
                      <div className="h-9 w-24 px-1 pt-4 text-[10px] font-bold text-white" style={{ backgroundColor: palette.secondaire }}>
                        secondaire
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <PastilleContraste libelle="Texte blanc sur principale" ratio={contraste(palette.principale, '#ffffff')} />
                      <PastilleContraste libelle="Texte 600 sur blanc" ratio={contraste(palette.nuances[600], '#ffffff')} />
                      <PastilleContraste libelle="Secondaire sur blanc" ratio={contraste(palette.secondaire, '#ffffff')} />
                      {palette.estMarque && <span className="text-xs text-slate-400">palette historique</span>}
                    </div>
                  </div>
                )}

                {message?.code === m.code && (
                  <p className={`mt-3 flex items-center gap-1.5 text-sm font-medium ${message.ok ? 'text-succes-700' : 'text-red-600'}`}>
                    {message.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                    {message.texte}
                  </p>
                )}
              </div>
            );
          })}
          <p className="text-xs text-slate-400">
            Repère : l'ancien vert emerald du portail donne 3,8 en « texte 600 sur blanc ». Les pages de
            référencement suivent la couleur principale au prochain déploiement.
          </p>
        </div>
      )}
    </div>
  );
};

export default CouleursMarches;
