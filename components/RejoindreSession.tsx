// =====================================================================
//  PILOTERRA — REJOINDRE UNE SESSION  (côté apprenant)
//
//  Composant compact, destiné à être posé en haut du Dashboard.
//  Trois états :
//    1. L'apprenant est déjà dans une session en cours -> bandeau de rappel
//    2. Sinon -> champ de saisie du code d'accès
//    3. Après succès -> confirmation, puis bascule sur le bandeau
//
//  Le rattachement des productions est automatique côté base : dès que
//  l'apprenant est dans une session « en cours », ses défis, cas d'usage,
//  chartes et prompts y sont reliés sans action de sa part.
// =====================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import {
  KeyRound, Loader2, CheckCircle2, AlertTriangle, GraduationCap,
  Calendar, X, ChevronRight,
} from 'lucide-react';
import { SessionFormation, formatPeriode, normalizeCode, STATUT_META } from './sessionShared';

interface RejoindreSessionProps {
  session: any;
  /** Repli manuel possible : l'apprenant peut masquer l'invitation à saisir un code. */
  dismissible?: boolean;
  /** Notifie le parent après une adhésion réussie (pour recharger un tableau de bord). */
  onJoined?: (sessionId: string) => void;
}

export const RejoindreSession: React.FC<RejoindreSessionProps> = ({
  session, dismissible = true, onJoined,
}) => {
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<SessionFormation | null>(null);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [justJoined, setJustJoined] = useState(false);
  const [hidden, setHidden] = useState(false);

  // -------------------------------------------------------------------
  //  Session en cours de l'utilisateur
  // -------------------------------------------------------------------
  const loadActive = useCallback(async () => {
    if (!session?.user?.id) { setLoading(false); return; }
    setLoading(true);

    // On part explicitement des participations de l'utilisateur : la RLS
    // montre aussi au super admin toutes les sessions, qu'il n'a pas
    // rejointes. S'y fier affichait une session « en cours » à la place du
    // champ de code, et empêchait de rejoindre.
    const { data: moi } = await supabase
      .from('utilisateurs')
      .select('id')
      .eq('auth_id', session.user.id)
      .maybeSingle();

    if (!moi?.id) { setActive(null); setLoading(false); return; }

    const { data: participations } = await supabase
      .from('session_participants')
      .select('session_id')
      .eq('user_id', moi.id);

    const mesSessions = (participations || []).map((p: any) => p.session_id);
    if (mesSessions.length === 0) { setActive(null); setLoading(false); return; }

    const { data, error } = await supabase
      .from('sessions_formation')
      .select('*')
      .in('id', mesSessions)
      .in('statut', ['planifiee', 'en_cours'])
      .order('date_debut', { ascending: false, nullsFirst: false })
      .limit(1);

    if (error) {
      console.error('Chargement session :', error.message);
      setActive(null);
    } else {
      setActive((data && data[0]) ? (data[0] as SessionFormation) : null);
    }
    setLoading(false);
  }, [session]);

  useEffect(() => { loadActive(); }, [loadActive]);

  // -------------------------------------------------------------------
  //  Rejoindre
  // -------------------------------------------------------------------
  const join = async () => {
    const clean = normalizeCode(code);
    if (clean.length < 6) { setErr('Le code comporte 6 caractères.'); return; }

    setJoining(true); setErr(null);
    const { data, error } = await supabase.rpc('join_session_by_code', { p_code: clean });

    if (error) {
      console.error('Adhésion session :', error.message);
      // Les messages de la fonction SQL sont déjà rédigés pour l'utilisateur.
      setErr(error.message.replace(/^.*?:\s*/, '') || "Le code n'a pas été accepté.");
      setJoining(false);
      return;
    }

    setJoining(false);
    setJustJoined(true);
    setCode('');
    await loadActive();
    if (data) onJoined?.(data as string);
  };

  // -------------------------------------------------------------------
  //  Rendu
  // -------------------------------------------------------------------
  if (loading || hidden || !session) return null;

  // --- État 1 : déjà dans une session ---------------------------------
  if (active) {
    const meta = STATUT_META[active.statut];
    return (
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white p-5 mb-6 animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="flex flex-wrap items-center gap-4">
          <div className="w-11 h-11 shrink-0 rounded-xl bg-emerald-600 flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-slate-900">{active.titre}</p>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${meta.badge}`}>
                {meta.label}
              </span>
            </div>
            <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
              <Calendar className="w-3.5 h-3.5" />
              {formatPeriode(active.date_debut, active.date_fin)}
            </p>
          </div>
          {justJoined && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="w-4 h-4" /> Vous avez rejoint la session
            </span>
          )}
        </div>

        {active.statut === 'en_cours' && (
          <p className="text-xs text-emerald-800/80 mt-3 pt-3 border-t border-emerald-100">
            Tout ce que vous créez pendant la formation — défis, cas d'usage, prompts —
            est automatiquement conservé dans cette session. Vous le retrouverez ensuite dans votre espace.
          </p>
        )}
      </div>
    );
  }

  // --- État 2 : saisie du code ----------------------------------------
  return (
    <div className="relative rounded-2xl border border-slate-200 bg-white p-5 mb-6 shadow-sm">
      {dismissible && (
        <button onClick={() => setHidden(true)}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition"
          title="Masquer">
          <X className="w-4 h-4" />
        </button>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <div className="w-11 h-11 shrink-0 rounded-xl bg-slate-100 flex items-center justify-center">
          <KeyRound className="w-5 h-5 text-slate-500" />
        </div>

        <div className="flex-1 min-w-[200px]">
          <p className="font-bold text-slate-900">Vous participez à une formation ?</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Saisissez le code communiqué par votre formateur pour rejoindre la session.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            value={code}
            onChange={(e) => { setCode(normalizeCode(e.target.value)); setErr(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') join(); }}
            placeholder="ABC123"
            maxLength={6}
            aria-label="Code d'accès à la session"
            className="w-36 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-center font-mono text-lg font-bold tracking-[0.2em] uppercase outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          />
          <button
            onClick={join}
            disabled={joining || code.length < 6}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
            Rejoindre
          </button>
        </div>
      </div>

      {err && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{err}</span>
        </div>
      )}
    </div>
  );
};
