// =====================================================================
//  PILOTERRA — Fiche Défi dans le portail (05/10/2026)
//
//  Remplace, pour le portail, le formulaire n8n ouvert dans un nouvel
//  onglet. Même parcours, mêmes questions, mais :
//    - aux couleurs du marché affiché (palette du portail) ;
//    - préremplie depuis le compte : identité, entreprise, site, profil,
//      et filière (personnelle, sinon celle de l'organisation — la règle
//      du portail ; le formulaire n8n ne lisait que la personnelle) ;
//    - profils et filières lus dans le référentiel du marché.
//
//  Envoi : un seul appel au scénario n8n « Fiche Défi DEV », par sa
//  deuxième entrée (N8N.ficheDefiPortail). Le scénario fait ensuite
//  exactement ce qu'il fait pour le formulaire : fiche utilisateur,
//  analyse IA, enregistrement, e-mail, Brevo. Le formulaire n8n reste en
//  service pour bziiit.com et les liens existants (QR codes, e-mails).
//
//  Corps envoyé en text/plain : requête « simple », sans pré-vérification
//  CORS ; le scénario relit le JSON (nœud « Portail : préparation »).
//
//  La saisie est conservée si la modale est refermée par erreur ; elle
//  est remise à zéro après un envoi réussi.
// =====================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { X, ArrowRight, ArrowLeft, Loader2, Sparkles, CheckCircle2, AlertTriangle, Target } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { N8N } from '../n8nConfig';
import { sendEvent } from '../analytics';
import { useMarche } from './MarcheContext';

interface FicheDefiModalProps {
  ouvert: boolean;
  onFermer: () => void;
  session?: any;
  /** Session de formation en cours : le défi y est rattaché. */
  sessionFormationId?: string | null;
}

type Etape = 'marche' | 'probleme' | 'coordonnees' | 'termine';

/** Liste historique, si le référentiel du marché n'a pas de profils. */
const PROFILS_HISTORIQUES = ['Agriculteur', 'Conseiller', 'Acheteur', 'Financeur', 'Fournisseur', 'Direction'];

const QUESTIONS = [
  {
    cle: 'probleme' as const,
    titre: 'Le problème',
    libelle: 'Décrivez une situation ou un problème récurrent dans votre secteur ou votre entreprise, qui vous frustre ou que vous aimeriez voir résolu.',
    aide: 'Soyez concret : qui est concerné, à quelle fréquence, ce que ça coûte en temps ou en argent.',
  },
  {
    cle: 'vision' as const,
    titre: 'La solution idéale',
    libelle: 'Imaginez que vous ayez une baguette magique. À quoi ressemblerait une solution idéale à ce problème ?',
    aide: 'Décrivez le résultat attendu, pas la technique.',
  },
  {
    cle: 'ressources' as const,
    titre: 'Vos ressources',
    libelle: 'Quelles données, expertises ou ressources (même minimes) votre entreprise pourrait-elle partager pour traiter efficacement votre problème ?',
    aide: 'Fichiers, logiciels, historiques, personnes ressources… tout compte.',
  },
];

const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Coordonnees {
  prenom: string;
  nom: string;
  email: string;
  entreprise: string;
  site_web: string;
  profil: string;
  filiere_code: string;
}

const COORDONNEES_VIDES: Coordonnees = {
  prenom: '', nom: '', email: '', entreprise: '', site_web: '', profil: '', filiere_code: '',
};

export const FicheDefiModal: React.FC<FicheDefiModalProps> = ({ ouvert, onFermer, session, sessionFormationId }) => {
  const { marches, filieres, marcheActif } = useMarche();
  const connecte = !!session?.user;

  const [etape, setEtape] = useState<Etape>(marcheActif ? 'probleme' : 'marche');
  const [marche, setMarche] = useState<string | null>(marcheActif);
  const [reponses, setReponses] = useState({ probleme: '', vision: '', ressources: '' });
  const [coord, setCoord] = useState<Coordonnees>(COORDONNEES_VIDES);
  const [utilisateurId, setUtilisateurId] = useState<string>('');
  const [filiereProposee, setFiliereProposee] = useState<string>('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Le marché affiché peut changer (sélecteur) tant que la modale est fermée
  useEffect(() => {
    if (!ouvert) return;
    if (marcheActif) setMarche(marcheActif);
    setEtape((e) => (e === 'marche' && marcheActif ? 'probleme' : e));
    sendEvent('start_defi', 'Engagement', 'Modale Fiche Défi');
  }, [ouvert, marcheActif]);

  // Échap ferme la modale
  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent) => { if (e.key === 'Escape' && !envoi) onFermer(); };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [ouvert, envoi, onFermer]);

  // ── Préremplissage depuis le compte ──────────────────────────────────
  useEffect(() => {
    if (!ouvert || !session?.user?.id) return;
    let annule = false;
    (async () => {
      const { data: u } = await supabase
        .from('utilisateurs')
        .select('id, prenom, nom, email, entreprise, site_web, fonction_profil, filiere_code, organisation_id')
        .eq('auth_id', session.user.id)
        .maybeSingle();
      if (annule || !u) return;

      // Filière : personnelle, sinon celle de l'organisation (règle du portail)
      let filiere = u.filiere_code || '';
      if (!filiere && u.organisation_id) {
        const { data: org } = await supabase
          .from('organisations')
          .select('filiere_code')
          .eq('id', u.organisation_id)
          .maybeSingle();
        filiere = org?.filiere_code || '';
      }
      if (annule) return;

      setUtilisateurId(u.id || '');
      setFiliereProposee(filiere);
      // Ne remplace que les champs encore vides : une saisie en cours est gardée
      setCoord((c) => ({
        prenom: c.prenom || u.prenom || '',
        nom: c.nom || u.nom || '',
        email: u.email || session.user.email || c.email,
        entreprise: c.entreprise || u.entreprise || '',
        site_web: c.site_web || u.site_web || '',
        profil: c.profil || u.fonction_profil || '',
        filiere_code: c.filiere_code || filiere,
      }));
    })();
    return () => { annule = true; };
  }, [ouvert, session?.user?.id]);

  // ── Référentiel du marché choisi ─────────────────────────────────────
  const marcheCourant = useMemo(() => marches.find((m) => m.code === marche) ?? null, [marches, marche]);
  const filieresMarche = useMemo(
    () => filieres.filter((f) => f.marche_code === marche).sort((a, b) => a.ordre - b.ordre),
    [filieres, marche],
  );
  const profils = useMemo(
    () => (marcheCourant?.profils?.length ? marcheCourant.profils : PROFILS_HISTORIQUES),
    [marcheCourant],
  );

  // Profil ou filière hors du marché choisi : on les retire
  useEffect(() => {
    setCoord((c) => ({
      ...c,
      profil: profils.includes(c.profil) ? c.profil : '',
      filiere_code: filieresMarche.some((f) => f.code === c.filiere_code)
        ? c.filiere_code
        : (filieresMarche.some((f) => f.code === filiereProposee) ? filiereProposee : ''),
    }));
  }, [profils, filieresMarche, filiereProposee]);

  if (!ouvert) return null;

  // ── Validation par étape ─────────────────────────────────────────────
  const questionsCompletes = QUESTIONS.every((q) => reponses[q.cle].trim().length >= 3);
  const coordonneesCompletes =
    coord.prenom.trim() && coord.nom.trim() && EMAIL_VALIDE.test(coord.email.trim())
    && coord.entreprise.trim() && coord.profil;

  const envoyer = async () => {
    if (!marche || !questionsCompletes || !coordonneesCompletes) return;
    setEnvoi(true);
    setErreur(null);
    const filiere = filieresMarche.find((f) => f.code === coord.filiere_code);
    const corps = {
      utilisateur_id: utilisateurId,
      auth_id: session?.user?.id || '',
      email: coord.email.trim(),
      prenom: coord.prenom.trim(),
      nom: coord.nom.trim(),
      entreprise: coord.entreprise.trim(),
      site_web: coord.site_web.trim(),
      profil: coord.profil,
      marche,
      filiere_code: filiere?.code || '',
      filiere_libelle: filiere?.libelle || '',
      session_id: sessionFormationId || '',
      probleme: reponses.probleme.trim(),
      vision: reponses.vision.trim(),
      ressources: reponses.ressources.trim(),
    };
    try {
      const res = await fetch(N8N.ficheDefiPortail, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(corps),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      sendEvent('submit_defi', 'Engagement', marche);
      setEtape('termine');
      setReponses({ probleme: '', vision: '', ressources: '' });
    } catch (e) {
      console.error('Envoi de la Fiche Défi :', e);
      setErreur("L'envoi n'a pas abouti. Vos réponses sont conservées : réessayez dans un instant.");
    } finally {
      setEnvoi(false);
    }
  };

  const fermer = () => {
    if (envoi) return;
    // Après un envoi réussi, la prochaine ouverture repart du début
    if (etape === 'termine') setEtape(marcheActif ? 'probleme' : 'marche');
    onFermer();
  };

  // ── Rendu ────────────────────────────────────────────────────────────
  const champ = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20';
  const libelle = 'mb-1.5 block text-sm font-bold text-slate-700';
  const etapes: Etape[] = marcheActif ? ['probleme', 'coordonnees'] : ['marche', 'probleme', 'coordonnees'];
  const numero = etapes.indexOf(etape) + 1;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4"
      onClick={fermer}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fiche-defi-titre"
    >
      <div
        className="relative flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête aux couleurs du marché */}
        <div className="relative bg-gradient-to-br from-pilo-green to-emerald-800 px-6 py-5 text-white">
          <button
            onClick={fermer}
            className="absolute right-4 top-4 rounded-full p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/15 p-2"><Target className="h-6 w-6" /></div>
            <div>
              <h2 id="fiche-defi-titre" className="text-xl font-black">Votre Fiche Défi IA</h2>
              <p className="text-sm text-white/80">
                {marcheCourant ? `Secteur : ${marcheCourant.libelle}` : 'Trois questions, trois minutes'}
                {etape !== 'termine' && numero > 0 && ` · étape ${numero} sur ${etapes.length}`}
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto px-6 py-6">
          {/* 1. Secteur (visiteur sans marché choisi) */}
          {etape === 'marche' && (
            <div>
              <p className="mb-4 text-slate-600">Dans quel secteur travaillez-vous ? L'analyse sera adaptée à vos métiers.</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {marches.map((m) => (
                  <button
                    key={m.code}
                    onClick={() => setMarche(m.code)}
                    className={`rounded-2xl border-2 px-4 py-4 text-left font-bold transition-all ${marche === m.code ? 'text-white shadow-lg' : 'bg-white text-slate-700 hover:shadow'}`}
                    style={{ borderColor: m.couleur_accent, backgroundColor: marche === m.code ? m.couleur_accent : undefined }}
                  >
                    {m.libelle}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 2. Les trois questions */}
          {etape === 'probleme' && (
            <div className="space-y-5">
              {QUESTIONS.map((q, i) => (
                <div key={q.cle}>
                  <label className={libelle} htmlFor={`defi-${q.cle}`}>
                    <span className="mr-2 text-emerald-600">{i + 1}/3</span>{q.libelle}
                  </label>
                  <textarea
                    id={`defi-${q.cle}`}
                    value={reponses[q.cle]}
                    onChange={(e) => setReponses((r) => ({ ...r, [q.cle]: e.target.value }))}
                    rows={4}
                    maxLength={4000}
                    placeholder={q.aide}
                    className={`${champ} resize-y`}
                    autoFocus={i === 0}
                  />
                </div>
              ))}
            </div>
          )}

          {/* 3. Coordonnées */}
          {etape === 'coordonnees' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={libelle} htmlFor="defi-prenom">Prénom *</label>
                <input id="defi-prenom" className={champ} value={coord.prenom} onChange={(e) => setCoord({ ...coord, prenom: e.target.value })} autoComplete="given-name" />
              </div>
              <div>
                <label className={libelle} htmlFor="defi-nom">Nom *</label>
                <input id="defi-nom" className={champ} value={coord.nom} onChange={(e) => setCoord({ ...coord, nom: e.target.value })} autoComplete="family-name" />
              </div>
              <div className="sm:col-span-2">
                <label className={libelle} htmlFor="defi-email">E-mail *</label>
                <input
                  id="defi-email" type="email" className={`${champ} ${connecte ? 'bg-slate-50 text-slate-500' : ''}`}
                  value={coord.email} readOnly={connecte}
                  onChange={(e) => setCoord({ ...coord, email: e.target.value })} autoComplete="email"
                />
                <p className="mt-1 text-xs text-slate-400">Votre Fiche Défi vous sera envoyée à cette adresse.</p>
              </div>
              <div className="sm:col-span-2">
                <label className={libelle} htmlFor="defi-entreprise">Entreprise *</label>
                <input id="defi-entreprise" className={champ} value={coord.entreprise} onChange={(e) => setCoord({ ...coord, entreprise: e.target.value })} autoComplete="organization" />
              </div>
              <div>
                <label className={libelle} htmlFor="defi-filiere">Filière</label>
                <select id="defi-filiere" className={champ} value={coord.filiere_code} onChange={(e) => setCoord({ ...coord, filiere_code: e.target.value })}>
                  <option value="">Non précisée</option>
                  {filieresMarche.map((f) => <option key={f.code} value={f.code}>{f.libelle}</option>)}
                </select>
              </div>
              <div>
                <label className={libelle} htmlFor="defi-profil">Votre profil *</label>
                <select id="defi-profil" className={champ} value={coord.profil} onChange={(e) => setCoord({ ...coord, profil: e.target.value })}>
                  <option value="">Choisir…</option>
                  {profils.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={libelle} htmlFor="defi-site">Site internet</label>
                <input id="defi-site" className={champ} value={coord.site_web} onChange={(e) => setCoord({ ...coord, site_web: e.target.value })} placeholder="https://www.mon-entreprise.com" autoComplete="url" />
                <p className="mt-1 text-xs text-slate-400">Notre IA le consulte pour mieux comprendre votre activité.</p>
              </div>
              <p className="sm:col-span-2 text-xs text-slate-500">
                En lançant l'analyse, vous acceptez les{' '}
                <a href="/#cgu" target="_blank" rel="noopener noreferrer" className="font-bold text-emerald-700 underline">conditions générales d'utilisation</a>{' '}
                de PiloTerra.
              </p>
            </div>
          )}

          {/* 4. Confirmation */}
          {etape === 'termine' && (
            <div className="py-6 text-center">
              <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-succes-500" />
              <h3 className="mb-2 text-xl font-black text-slate-900">Votre Fiche Défi est en préparation</h3>
              <p className="text-slate-600">
                Notre IA analyse votre défi. Vous recevrez votre fiche par e-mail d'ici quelques minutes, à {coord.email}.
              </p>
              {connecte && (
                <p className="mt-2 text-slate-600">Elle apparaîtra aussi dans votre espace PiloTerra.</p>
              )}
            </div>
          )}

          {erreur && (
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {erreur}
            </div>
          )}
        </div>

        {/* Pied : navigation */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          {etape === 'termine' ? (
            <button onClick={fermer} className="ml-auto rounded-xl bg-emerald-600 px-6 py-2.5 font-bold text-white hover:bg-emerald-700">
              Fermer
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  const i = etapes.indexOf(etape);
                  if (i > 0) setEtape(etapes[i - 1]); else fermer();
                }}
                disabled={envoi}
                className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" /> {etapes.indexOf(etape) > 0 ? 'Retour' : 'Annuler'}
              </button>

              {etape === 'marche' && (
                <button
                  onClick={() => setEtape('probleme')}
                  disabled={!marche}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-6 py-2.5 font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  Suivant <ArrowRight className="h-4 w-4" />
                </button>
              )}
              {etape === 'probleme' && (
                <button
                  onClick={() => setEtape('coordonnees')}
                  disabled={!questionsCompletes}
                  title={questionsCompletes ? undefined : 'Répondez aux trois questions pour continuer'}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-6 py-2.5 font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  Suivant <ArrowRight className="h-4 w-4" />
                </button>
              )}
              {etape === 'coordonnees' && (
                <button
                  onClick={envoyer}
                  disabled={!coordonneesCompletes || envoi}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  {envoi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Lancer l'analyse
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FicheDefiModal;
