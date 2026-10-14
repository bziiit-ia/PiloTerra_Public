// =====================================================================
//  PILOTERRA — GESTION DES SESSIONS DE FORMATION
//  Réservée au super admin (arbitré le 18/09/2026) : l'admin d'organisation
//  est un apprenant comme les autres, il rejoint une session par son code.
//  Affichée dans l'espace organisation, sur l'organisation sélectionnée.
//
//  - Liste des sessions de l'organisation, avec compteurs de production
//  - Création d'une session (code d'accès généré automatiquement en base)
//  - Détail : code d'accès, pilotage du statut, participants, déroulé
//  - Le passage au statut « En cours » active le rattachement automatique :
//    tout ce que produit un apprenant est alors relié à la session.
//
//  Dépendances base : sessions_formation, session_participants,
//  session_etapes, v_sessions_synthese, v_session_progression.
// =====================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import {
  GraduationCap, Plus, X, Loader2, Copy, Check, Users, ListChecks,
  Calendar, MapPin, User, AlertTriangle, ArrowRight, Trash2, RefreshCw,
  Target, Layers, KeyRound, ChevronLeft, Clock, Search,
} from 'lucide-react';
import {
  SessionFormation, SessionSynthese, SessionProgression, SessionEtape,
  SessionStatut, SessionModalite, ActionAttendue,
  STATUT_META, MODALITE_LABELS, INSCRIPTION_META, ETAPE_STATUT_META, ACTION_LABELS,
  NEXT_STATUTS, displayName, formatPeriode, formatMoment,
  progressionScore, isBloque,
} from './sessionShared';

interface GestionSessionsProps {
  session: any;
  /** Permet au super admin de piloter une organisation qu'il a sélectionnée. */
  adminSelectedOrgId?: string;
}

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm outline-none ' +
  'focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100';

// =====================================================================
//  Badges
// =====================================================================
const StatutBadge: React.FC<{ statut: SessionStatut }> = ({ statut }) => {
  const m = STATUT_META[statut];
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${m.badge}`}>
      <Icon className="w-3 h-3" />{m.label}
    </span>
  );
};

// =====================================================================
//  Composant principal
// =====================================================================
export const GestionSessions: React.FC<GestionSessionsProps> = ({ session, adminSelectedOrgId }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myOrgId, setMyOrgId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('user');

  const [sessions, setSessions] = useState<SessionSynthese[]>([]);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const isAdmin = userRole === 'super_admin';
  const orgId = adminSelectedOrgId || myOrgId;

  // -------------------------------------------------------------------
  //  Chargement
  // -------------------------------------------------------------------
  const fetchProfile = useCallback(async () => {
    if (!session?.user?.id) return null;
    const { data, error: e } = await supabase
      .from('utilisateurs')
      .select('id, role, organisation_id')
      .eq('auth_id', session.user.id)
      .single();
    if (e) { console.error('Erreur profil :', e.message); return null; }
    setMyUserId(data.id);
    setMyOrgId(data.organisation_id);
    setUserRole(data.role);
    return data;
  }, [session]);

  const fetchSessions = useCallback(async (targetOrgId: string | null) => {
    if (!targetOrgId) { setSessions([]); return; }
    const { data, error: e } = await supabase
      .from('v_sessions_synthese')
      .select('*')
      .eq('organisation_id', targetOrgId)
      .order('date_debut', { ascending: false, nullsFirst: false });

    if (e) {
      console.error('Erreur chargement sessions :', e.message);
      setError("Les sessions n'ont pas pu être chargées : " + e.message);
      return;
    }
    setError(null);
    setSessions((data || []) as SessionSynthese[]);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    const profile = await fetchProfile();
    await fetchSessions(adminSelectedOrgId || profile?.organisation_id || null);
    setLoading(false);
  }, [fetchProfile, fetchSessions, adminSelectedOrgId]);

  useEffect(() => { reload(); }, [reload]);

  // -------------------------------------------------------------------
  //  Filtrage
  // -------------------------------------------------------------------
  const visibles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions
      .filter((s) => showArchived || s.statut !== 'archivee')
      .filter((s) => !q || `${s.titre} ${s.code_acces ?? ''}`.toLowerCase().includes(q));
  }, [sessions, search, showArchived]);

  // -------------------------------------------------------------------
  //  Rendu
  // -------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        <AlertTriangle className="w-5 h-5 mb-2" />
        La gestion des sessions de formation est réservée à l'équipe PiloTerra.
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
        <Layers className="mx-auto mb-3 w-10 h-10 text-slate-300" />
        <p className="text-slate-500 font-medium">Aucune organisation sélectionnée.</p>
      </div>
    );
  }

  // Vue détail
  if (openId) {
    return (
      <SessionDetail
        sessionId={openId}
        myUserId={myUserId}
        onBack={() => { setOpenId(null); reload(); }}
      />
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-emerald-600" />
            Sessions de formation
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Chaque session relie vos apprenants, le déroulé et tout ce qu'ils produisent.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={reload}
            className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:text-emerald-600 hover:border-emerald-300 transition"
            title="Rafraîchir"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 transition"
          >
            <Plus className="w-4 h-4" /> Nouvelle session
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une session ou un code..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          Afficher les archivées
        </label>
      </div>

      {/* Liste */}
      {visibles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-20 text-center">
          <GraduationCap className="mx-auto mb-3 w-10 h-10 text-slate-300" />
          <p className="text-slate-500 font-medium">Aucune session pour le moment.</p>
          <p className="text-slate-400 text-sm mt-1">
            Créez-en une avant votre prochaine journée de formation.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibles.map((s) => (
            <button
              key={s.id}
              onClick={() => setOpenId(s.id)}
              className="group flex flex-col text-left bg-white rounded-2xl border border-slate-200 shadow-sm p-5 transition-all hover:border-emerald-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <StatutBadge statut={s.statut} />
                {s.code_acces && (
                  <span className="font-mono text-xs font-bold tracking-widest text-slate-400">
                    {s.code_acces}
                  </span>
                )}
              </div>

              <h3 className="font-bold text-slate-900 leading-snug mb-1 group-hover:text-emerald-700 transition">
                {s.titre}
              </h3>
              <p className="text-xs text-slate-500 flex items-center gap-1.5 mb-4">
                <Calendar className="w-3.5 h-3.5" />
                {formatPeriode(s.date_debut, s.date_fin)}
              </p>

              <div className="mt-auto grid grid-cols-4 gap-2 pt-3 border-t border-slate-100">
                <Stat label="Apprenants" value={s.nb_apprenants} />
                <Stat label="Présents"   value={s.nb_presents} />
                <Stat label="Défis"      value={s.nb_defis} />
                <Stat label="Cas d'usage" value={s.nb_cas_usage} />
              </div>
            </button>
          ))}
        </div>
      )}

      {creating && (
        <CreateSessionModal
          orgId={orgId}
          myUserId={myUserId}
          onClose={() => setCreating(false)}
          onCreated={(id) => { setCreating(false); reload(); setOpenId(id); }}
        />
      )}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div>
    <p className="text-lg font-bold text-slate-900 leading-none">{value}</p>
    <p className="text-[11px] text-slate-400 mt-1">{label}</p>
  </div>
);

// =====================================================================
//  Modal de création
// =====================================================================
const CreateSessionModal: React.FC<{
  orgId: string;
  myUserId: string | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}> = ({ orgId, myUserId, onClose, onCreated }) => {
  const today = new Date().toISOString().slice(0, 10);
  const [titre, setTitre] = useState("Découvrir l'IA — J1/J2");
  const [description, setDescription] = useState('');
  const [dateDebut, setDateDebut] = useState(today);
  const [dateFin, setDateFin] = useState(today);
  const [modalite, setModalite] = useState<SessionModalite>('presentiel');
  const [lieu, setLieu] = useState('');
  const [formateurExterne, setFormateurExterne] = useState('');
  const [jeSuisFormateur, setJeSuisFormateur] = useState(true);
  const [avecTrame, setAvecTrame] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!titre.trim()) { setErr('Le titre est obligatoire.'); return; }
    if (dateFin && dateDebut && dateFin < dateDebut) {
      setErr('La date de fin ne peut pas précéder la date de début.'); return;
    }
    setSaving(true); setErr(null);

    const { data, error } = await supabase
      .from('sessions_formation')
      .insert({
        organisation_id: orgId,
        titre: titre.trim(),
        description: description.trim() || null,
        formateur_id: jeSuisFormateur ? myUserId : null,
        formateur_externe: formateurExterne.trim() || null,
        date_debut: dateDebut || null,
        date_fin: dateFin || null,
        modalite,
        lieu: lieu.trim() || null,
        statut: 'planifiee',
      })
      .select('id')
      .single();

    if (error || !data) {
      console.error('Création session :', error?.message);
      setErr("La session n'a pas pu être créée : " + (error?.message ?? 'erreur inconnue'));
      setSaving(false);
      return;
    }

    // Trame J1/J2 de référence, modifiable ensuite dans le détail.
    if (avecTrame) {
      const trame: Array<{
        titre: string; ordre: number; jour: string; demi_journee: 'matin' | 'apres_midi';
        duree_prevue_min: number; action_attendue: ActionAttendue;
      }> = [
        { titre: 'Accueil, tour de table',            ordre: 1,  jour: 'J1', demi_journee: 'matin',      duree_prevue_min: 30, action_attendue: 'exercice_libre' },
        { titre: 'Création du compte PiloTerra',      ordre: 2,  jour: 'J1', demi_journee: 'matin',      duree_prevue_min: 20, action_attendue: 'creer_compte' },
        { titre: 'Test de positionnement',            ordre: 3,  jour: 'J1', demi_journee: 'matin',      duree_prevue_min: 20, action_attendue: 'positionnement' },
        { titre: "Les fondamentaux de l'IA",          ordre: 4,  jour: 'J1', demi_journee: 'matin',      duree_prevue_min: 60, action_attendue: 'consulter_module' },
        { titre: "L'art du prompt",                   ordre: 5,  jour: 'J1', demi_journee: 'apres_midi', duree_prevue_min: 60, action_attendue: 'consulter_module' },
        { titre: 'Lancer sa Fiche Défi IA',           ordre: 6,  jour: 'J1', demi_journee: 'apres_midi', duree_prevue_min: 60, action_attendue: 'lancer_defi' },
        { titre: "Retour d'expérience J1",            ordre: 7,  jour: 'J2', demi_journee: 'matin',      duree_prevue_min: 90, action_attendue: 'exercice_libre' },
        { titre: "Du défi au cas d'usage",            ordre: 8,  jour: 'J2', demi_journee: 'matin',      duree_prevue_min: 105, action_attendue: 'creer_cas_usage' },
        { titre: 'Atelier en binôme',                 ordre: 9,  jour: 'J2', demi_journee: 'apres_midi', duree_prevue_min: 90, action_attendue: 'generer_proto_prompt' },
        { titre: 'Atelier Charte IA',                 ordre: 10, jour: 'J2', demi_journee: 'apres_midi', duree_prevue_min: 60, action_attendue: 'generer_charte' },
      ];

      const { error: eTrame } = await supabase
        .from('session_etapes')
        .insert(trame.map((t) => ({ ...t, session_id: data.id })));

      if (eTrame) {
        // La session existe : on informe sans bloquer.
        console.error('Trame non créée :', eTrame.message);
        alert("La session est créée, mais le déroulé n'a pas pu être ajouté : " + eTrame.message);
      }
    }

    setSaving(false);
    onCreated(data.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-emerald-600" /> Nouvelle session
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {err && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{err}</div>
          )}

          <div>
            <label className="block text-sm font-bold text-slate-800 mb-1">Titre *</label>
            <input value={titre} onChange={(e) => setTitre(e.target.value)} className={inputClass} />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-800 mb-1">Description</label>
            <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Contexte, objectifs, public concerné..." className={inputClass} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1">Début</label>
              <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1">Fin</label>
              <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1">Modalité</label>
              <select value={modalite} onChange={(e) => setModalite(e.target.value as SessionModalite)} className={inputClass}>
                {(Object.keys(MODALITE_LABELS) as SessionModalite[]).map((m) => (
                  <option key={m} value={m}>{MODALITE_LABELS[m]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1">Lieu</label>
              <input value={lieu} onChange={(e) => setLieu(e.target.value)}
                placeholder="Salle, ville, lien visio..." className={inputClass} />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 space-y-3">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" checked={jeSuisFormateur} onChange={(e) => setJeSuisFormateur(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
              <span className="text-sm">
                <span className="font-bold text-slate-800">J'anime cette session</span>
                <span className="block text-xs text-slate-500">
                  Vous serez ajouté comme formateur et pourrez piloter le déroulé.
                </span>
              </span>
            </label>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Intervenant complémentaire <span className="text-slate-400">(optionnel)</span>
              </label>
              <input value={formateurExterne} onChange={(e) => setFormateurExterne(e.target.value)}
                placeholder="Nom d'un formateur externe" className={inputClass} />
            </div>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
            <input type="checkbox" checked={avecTrame} onChange={(e) => setAvecTrame(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
            <span className="text-sm">
              <span className="font-bold text-emerald-800">Pré-remplir le déroulé J1/J2</span>
              <span className="block text-xs text-emerald-700/80">
                10 étapes de référence, modifiables ensuite.
              </span>
            </span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-slate-100 sticky bottom-0 bg-white rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">
            Annuler
          </button>
          <button onClick={submit} disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60 transition">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Créer la session
          </button>
        </div>
      </div>
    </div>
  );
};

// =====================================================================
//  Détail d'une session
// =====================================================================
const SessionDetail: React.FC<{
  sessionId: string;
  myUserId: string | null;
  onBack: () => void;
}> = ({ sessionId, onBack }) => {
  const [loading, setLoading] = useState(true);
  const [sess, setSess] = useState<SessionFormation | null>(null);
  const [participants, setParticipants] = useState<SessionProgression[]>([]);
  const [etapes, setEtapes] = useState<SessionEtape[]>([]);
  const [tab, setTab] = useState<'participants' | 'deroule'>('participants');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, p, e] = await Promise.all([
      supabase.from('sessions_formation').select('*').eq('id', sessionId).single(),
      supabase.from('v_session_progression').select('*').eq('session_id', sessionId),
      supabase.from('session_etapes').select('*').eq('session_id', sessionId).order('ordre'),
    ]);

    if (s.error) { setErr('Session introuvable : ' + s.error.message); setLoading(false); return; }
    setSess(s.data as SessionFormation);
    if (p.error) console.error('Progression :', p.error.message);
    setParticipants((p.data || []) as SessionProgression[]);
    if (e.error) console.error('Étapes :', e.error.message);
    setEtapes((e.data || []) as SessionEtape[]);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  // Rafraîchissement doux pendant l'animation : la console temps réel viendra à l'étape 3.
  useEffect(() => {
    if (sess?.statut !== 'en_cours') return;
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [sess?.statut, load]);

  const changeStatut = async (next: SessionStatut) => {
    setBusy(true); setErr(null);
    const { error } = await supabase
      .from('sessions_formation')
      .update({ statut: next })
      .eq('id', sessionId);
    if (error) {
      console.error('Changement de statut :', error.message);
      setErr("Le statut n'a pas pu être modifié : " + error.message);
    } else {
      await load();
    }
    setBusy(false);
  };

  const copyCode = () => {
    if (!sess?.code_acces) return;
    navigator.clipboard.writeText(sess.code_acces);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const removeParticipant = async (userId: string) => {
    if (!confirm('Retirer cette personne de la session ?')) return;
    const { error } = await supabase
      .from('session_participants')
      .delete()
      .match({ session_id: sessionId, user_id: userId });
    if (error) { alert("Retrait impossible : " + error.message); return; }
    load();
  };

  const setEtapeStatut = async (etapeId: string, statut: SessionEtape['statut']) => {
    const patch: Record<string, any> = { statut };
    if (statut === 'en_cours') patch.debut_reel = new Date().toISOString();
    if (statut === 'terminee') patch.fin_reelle = new Date().toISOString();
    const { error } = await supabase.from('session_etapes').update(patch).eq('id', etapeId);
    if (error) { alert("Modification impossible : " + error.message); return; }
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (!sess) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        {err || 'Session introuvable.'}
      </div>
    );
  }

  const apprenants = participants.filter((p) => p.role === 'apprenant');
  const meta = STATUT_META[sess.statut];

  return (
    <div className="animate-in fade-in slide-in-from-right-2 duration-300">
      <button onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-emerald-600 mb-4 transition">
        <ChevronLeft className="w-4 h-4" /> Toutes les sessions
      </button>

      {err && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{err}</div>
      )}

      {/* Bandeau */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-[240px]">
            <div className="mb-2"><StatutBadge statut={sess.statut} /></div>
            <h2 className="text-2xl font-bold text-slate-900">{sess.titre}</h2>
            {sess.description && <p className="text-sm text-slate-500 mt-1">{sess.description}</p>}
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />{formatPeriode(sess.date_debut, sess.date_fin)}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                {MODALITE_LABELS[sess.modalite]}{sess.lieu ? ` · ${sess.lieu}` : ''}
              </span>
              {sess.formateur_externe && (
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />{sess.formateur_externe}
                </span>
              )}
            </div>
          </div>

          {/* Code d'accès */}
          {sess.code_acces && (
            <div className="rounded-xl border-2 border-dashed border-emerald-200 bg-emerald-50/50 px-5 py-3 text-center">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700/70 flex items-center justify-center gap-1 mb-1">
                <KeyRound className="w-3 h-3" /> Code d'accès
              </p>
              <p className="font-mono text-2xl font-bold tracking-[0.25em] text-emerald-800">
                {sess.code_acces}
              </p>
              <button onClick={copyCode}
                className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline">
                {copied ? <><Check className="w-3 h-3" />Copié</> : <><Copy className="w-3 h-3" />Copier</>}
              </button>
            </div>
          )}
        </div>

        {/* Pilotage du statut */}
        <div className="mt-5 pt-5 border-t border-slate-100 flex flex-wrap items-center gap-3">
          <p className="text-xs text-slate-500 flex-1 min-w-[200px]">{meta.aide}</p>
          {NEXT_STATUTS[sess.statut].map((next) => (
            <button key={next} onClick={() => changeStatut(next)} disabled={busy}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition disabled:opacity-60 ${
                next === 'en_cours'
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'border border-slate-200 text-slate-700 hover:border-emerald-300 hover:text-emerald-700'
              }`}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {next === 'en_cours' ? 'Démarrer la session' : `Passer en « ${STATUT_META[next].label} »`}
            </button>
          ))}
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-2 p-1.5 bg-slate-100 rounded-2xl mb-5 w-fit">
        {([
          ['participants', `Participants (${apprenants.length})`, Users],
          ['deroule', `Déroulé (${etapes.length})`, ListChecks],
        ] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key as any)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition ${
              tab === key ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {tab === 'participants' && (
        <ParticipantsTab
          participants={participants}
          codeAcces={sess.code_acces}
          onRemove={removeParticipant}
        />
      )}

      {tab === 'deroule' && (
        <DerouleTab etapes={etapes} onSetStatut={setEtapeStatut} />
      )}
    </div>
  );
};

// =====================================================================
//  Onglet participants
// =====================================================================
const ParticipantsTab: React.FC<{
  participants: SessionProgression[];
  codeAcces: string | null;
  onRemove: (userId: string) => void;
}> = ({ participants, codeAcces, onRemove }) => {
  if (participants.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
        <Users className="mx-auto mb-3 w-10 h-10 text-slate-300" />
        <p className="text-slate-500 font-medium">Aucun participant pour le moment.</p>
        {codeAcces && (
          <p className="text-slate-400 text-sm mt-1">
            Communiquez le code <span className="font-mono font-bold text-slate-600">{codeAcces}</span> à vos apprenants.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {participants.map((p) => {
        const prog = progressionScore(p);
        const bloque = isBloque(p);
        const insc = INSCRIPTION_META[p.statut_inscription];
        return (
          <div key={p.user_id}
            className={`flex flex-wrap items-center gap-4 rounded-2xl border bg-white p-4 shadow-sm transition ${
              bloque ? 'border-amber-300' : 'border-slate-200'
            }`}>
            <div className="flex-1 min-w-[180px]">
              <div className="flex items-center gap-2">
                <p className="font-bold text-slate-900">{displayName(p)}</p>
                {p.role === 'formateur' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-white">
                    FORMATEUR
                  </span>
                )}
                {bloque && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-inset ring-amber-200">
                    <AlertTriangle className="w-3 h-3" />SANS ACTIVITÉ
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {p.email}{p.fonction_profil ? ` · ${p.fonction_profil}` : ''}
              </p>
            </div>

            {p.role === 'apprenant' && (
              <>
                <div className="w-40">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                    <span>Progression</span><span className="font-bold">{prog.done}/{prog.total}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${prog.pct}%` }} />
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1" title="Test de positionnement">
                    <Target className={`w-3.5 h-3.5 ${p.positionnement_fait ? 'text-emerald-600' : 'text-slate-300'}`} />
                    {p.positionnement_fait ? 'OK' : '—'}
                  </span>
                  <span className="flex items-center gap-1" title="Fiches Défi">
                    <Layers className="w-3.5 h-3.5" />{p.nb_defis}
                  </span>
                  <span className="flex items-center gap-1" title="Cas d'usage">
                    <ListChecks className="w-3.5 h-3.5" />{p.nb_cas_usage}
                  </span>
                  <span className="flex items-center gap-1" title="Dernière activité">
                    <Clock className="w-3.5 h-3.5" />{formatMoment(p.derniere_activite)}
                  </span>
                </div>
              </>
            )}

            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${insc.badge}`}>
              {insc.label}
            </span>

            {p.role !== 'formateur' && (
              <button onClick={() => onRemove(p.user_id)}
                className="p-2 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition"
                title="Retirer de la session">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

// =====================================================================
//  Onglet déroulé
// =====================================================================
const DerouleTab: React.FC<{
  etapes: SessionEtape[];
  onSetStatut: (id: string, statut: SessionEtape['statut']) => void;
}> = ({ etapes, onSetStatut }) => {
  if (etapes.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
        <ListChecks className="mx-auto mb-3 w-10 h-10 text-slate-300" />
        <p className="text-slate-500 font-medium">Aucun déroulé défini.</p>
        <p className="text-slate-400 text-sm mt-1">
          Le déroulé complet et les modules arrivent à l'étape suivante.
        </p>
      </div>
    );
  }

  const jours = Array.from(new Set(etapes.map((e) => e.jour || '—')));

  return (
    <div className="space-y-6">
      {jours.map((jour) => (
        <div key={jour}>
          <h4 className="text-sm font-bold text-slate-800 mb-2">{jour}</h4>
          <div className="space-y-2">
            {etapes.filter((e) => (e.jour || '—') === jour).map((e) => {
              const m = ETAPE_STATUT_META[e.statut];
              return (
                <div key={e.id}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <span className="w-7 h-7 shrink-0 rounded-lg bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center">
                    {e.ordre}
                  </span>
                  <div className="flex-1 min-w-[180px]">
                    <p className="font-medium text-slate-900">{e.titre}</p>
                    <p className="text-xs text-slate-500">
                      {e.demi_journee === 'matin' ? 'Matin' : e.demi_journee === 'apres_midi' ? 'Après-midi' : '—'}
                      {e.duree_prevue_min ? ` · ${e.duree_prevue_min} min` : ''}
                      {e.action_attendue ? ` · ${ACTION_LABELS[e.action_attendue]}` : ''}
                    </p>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${m.badge}`}>
                    {m.label}
                  </span>
                  <select value={e.statut} onChange={(ev) => onSetStatut(e.id, ev.target.value as any)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-emerald-400">
                    {(Object.keys(ETAPE_STATUT_META) as Array<SessionEtape['statut']>).map((k) => (
                      <option key={k} value={k}>{ETAPE_STATUT_META[k].label}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
