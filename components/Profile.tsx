
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { User, Shield, Building2, Save, ArrowLeft, Loader2, CheckCircle2, Sparkles, Lock, ArrowRight, Info, Globe } from 'lucide-react';
import { Page } from '../types';
import { CGU } from './CGU';
import { useMarche } from './MarcheContext';
import { filieresDuMarche } from './marcheShared';

interface ProfileProps {
  session: any;
  onNavigate: (page: Page) => void;
  isOnboarding?: boolean;
  entryHash?: string;
  onOpenSupport?: () => void;
  onProfileUpdate?: () => void;
}

// Liste historique (agricole), utilisée seulement tant que le référentiel
// n'a pas de profils : sql/etape5d_profils_par_marche.sql pas encore passé.
// Les listes par marché vivent dans la table `marches` (colonne `profils`),
// partagées avec le formulaire Fiche Défi n8n.
const PROFILS_HISTORIQUES = [
  "Agriculteur",
  "Conseiller",
  "Acheteur",
  "Financeur",
  "Fournisseur",
  "Direction"
];

/** Organisation de l'utilisateur, telle qu'utile au choix du marché. */
interface OrganisationProfil {
  nom: string;
  marche_code: string | null;
  filiere_code: string | null;
}

export const Profile: React.FC<ProfileProps> = ({ session, onNavigate, isOnboarding = false, entryHash = '', onOpenSupport, onProfileUpdate }) => {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Champs Identité
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  // Nouveaux Champs Organisation
  const [entreprise, setEntreprise] = useState('');
  const [siteWeb, setSiteWeb] = useState('');
  const [fonctionProfil, setFonctionProfil] = useState('');

  // Marché et filière (étape 5b). Remplacent l'ancien champ libre
  // « Secteur d'activité » : la colonne secteur_activite reste en base,
  // mais n'est plus ni affichée ni écrite.
  const { marches, filieres, rafraichir } = useMarche();
  const [marcheCode, setMarcheCode] = useState('');
  const [filiereCode, setFiliereCode] = useState('');
  const [organisation, setOrganisation] = useState<OrganisationProfil | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showCguModal, setShowCguModal] = useState(false);

  const [showPasswordSection, setShowPasswordSection] = useState(true);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Le marché de l'organisation l'emporte toujours sur celui du profil.
  // Le profil ne décide que hors organisation, ou si l'organisation n'a
  // pas de marché.
  const marcheOrganisation = organisation?.marche_code || null;
  const marcheEffectif = marcheOrganisation || marcheCode || null;
  const marcheOrganisationInfo = marches.find((m) => m.code === marcheOrganisation) || null;
  const marcheEffectifInfo = marches.find((m) => m.code === marcheEffectif) || null;

  // La filière est personnelle, mais choisie dans le marché effectif.
  const filieresProposees = useMemo(
    () => filieresDuMarche(filieres, marcheEffectif),
    [filieres, marcheEffectif]
  );

  // Profils du marché effectif (étape 5d), repli historique si le
  // référentiel n'en a pas encore.
  const profilsReferentiel = marcheEffectifInfo?.profils?.length ? marcheEffectifInfo.profils : null;
  const profilsProposes = profilsReferentiel || PROFILS_HISTORIQUES;

  useEffect(() => {
    const fetchInitialData = async () => {
      if (session?.user?.id) {
        // Récupération des données utilisateur étendues
        const { data, error } = await supabase
          .from('utilisateurs')
          .select('prenom, nom, entreprise, site_web, fonction_profil, marche_code, filiere_code, organisations(nom, marche_code, filiere_code)')
          .eq('auth_id', session.user.id)
          .single();

        const userMeta = session.user.user_metadata || {};
        const defaultFirstName = userMeta.given_name || (userMeta.full_name ? userMeta.full_name.split(' ')[0] : '');
        const defaultLastName = userMeta.family_name || (userMeta.full_name ? userMeta.full_name.split(' ').slice(1).join(' ') : '');

        if (data && !error) {
          setFirstName(data.prenom || defaultFirstName || '');
          setLastName(data.nom || defaultLastName || '');
          setEntreprise(data.entreprise || '');
          setSiteWeb(data.site_web || '');
          setFonctionProfil(data.fonction_profil || '');

          // Selon le client, la relation arrive en objet ou en tableau.
          const orgBrute: any = Array.isArray(data.organisations) ? data.organisations[0] : data.organisations;
          const org: OrganisationProfil | null = orgBrute
            ? { nom: orgBrute.nom || '', marche_code: orgBrute.marche_code ?? null, filiere_code: orgBrute.filiere_code ?? null }
            : null;
          setOrganisation(org);
          setMarcheCode(data.marche_code || '');
          // Filière : la sienne, sinon celle de l'organisation, proposée par défaut.
          setFiliereCode(data.filiere_code || org?.filiere_code || '');
        } else {
          setFirstName(defaultFirstName || '');
          setLastName(defaultLastName || '');
        }

        if (isOnboarding) {
            const isSignupUrl = entryHash?.includes('signup') || entryHash?.includes('type=signup');
            const amr = (session.user as any).amr || [];
            const usedPassword = amr.some((m: any) => m.method === 'password');
            const isOAuth = session.user.app_metadata?.provider !== 'email' || (session.user.app_metadata?.providers || []).includes('google');

            if (isSignupUrl || usedPassword || isOAuth) {
                setShowPasswordSection(false);
            } else {
                setShowPasswordSection(true);
            }
        } else {
            const isOAuth = session.user.app_metadata?.provider !== 'email' || (session.user.app_metadata?.providers || []).includes('google');
            setShowPasswordSection(!isOAuth);
        }
      }
    };
    fetchInitialData();
  }, [session, isOnboarding, entryHash]);

  // Une filière hors du marché effectif est retirée — par exemple quand
  // l'utilisateur change de marché, ou quand la filière de l'organisation
  // proposée par défaut n'appartient pas au marché. On attend le référentiel
  // pour ne rien effacer à tort au premier affichage.
  useEffect(() => {
    if (!filiereCode || filieres.length === 0) return;
    if (!filieresProposees.some((f) => f.code === filiereCode)) setFiliereCode('');
  }, [filieresProposees, filiereCode, filieres.length]);

  // Même règle pour le profil (étape 5d) : un profil absent de la liste du
  // marché effectif est retiré, et devra être rechoisi. Uniquement quand la
  // liste vient du référentiel, jamais sur la liste de repli.
  useEffect(() => {
    if (!fonctionProfil || !profilsReferentiel) return;
    if (!profilsReferentiel.includes(fonctionProfil)) setFonctionProfil('');
  }, [profilsReferentiel, fonctionProfil]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    if (isOnboarding) {
        if (!firstName.trim() || !lastName.trim()) {
            setError("Veuillez remplir vos informations d'identité (Prénom, Nom).");
            setLoading(false);
            return;
        }
        if (!entreprise.trim() || !fonctionProfil.trim()) {
            setError("Veuillez remplir les informations de votre entreprise et votre fonction.");
            setLoading(false);
            return;
        }
    }

    // Marché obligatoire, à l'onboarding comme en modification, sauf si
    // l'organisation en impose un.
    if (!marcheOrganisation && !marcheCode) {
        setError("Veuillez choisir votre marché.");
        setLoading(false);
        return;
    }

    if (isOnboarding && !acceptedTerms) {
        setError("Vous devez accepter les conditions générales d'utilisation pour valider votre inscription.");
        setLoading(false);
        return;
    }

    try {
      if (!session?.user?.id) throw new Error("Session expirée");

      const payload: Record<string, any> = {
        prenom: firstName,
        nom: lastName,
        entreprise: entreprise,
        site_web: siteWeb,
        fonction_profil: fonctionProfil,
        filiere_code: filiereCode || null,
        updated_at: new Date().toISOString()
      };
      // Le marché du profil n'est écrit que lorsqu'il s'applique : pour un
      // membre d'une organisation dotée d'un marché, c'est celui-ci qui compte.
      if (!marcheOrganisation) payload.marche_code = marcheCode || null;

      // Update sur 'utilisateurs'
      const { error: profileError } = await supabase
        .from('utilisateurs')
        .update(payload)
        .eq('auth_id', session.user.id);

      if (profileError) throw profileError;

      if (showPasswordSection && password) {
        if (password.length < 6) {
             throw new Error("Le mot de passe doit faire au moins 6 caractères.");
        }
        if (password !== confirmPassword) {
          throw new Error("Les mots de passe ne correspondent pas.");
        }
        const { error: pwdError } = await supabase.auth.updateUser({ password });
        if (pwdError) throw pwdError;
      }

      setSuccess(true);
      // Le marché a pu changer : le portail doit filtrer sur le nouveau.
      rafraichir();
      if (onProfileUpdate) onProfileUpdate();

      if (isOnboarding) {
        setTimeout(() => {
            onNavigate('assessment');
        }, 1500);
      } else {
        setTimeout(() => setSuccess(false), 3000);
      }

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 relative">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => onNavigate('dashboard')}
          className="flex items-center gap-2 text-slate-500 hover:text-emerald-600 font-semibold mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {isOnboarding ? "Plus tard (Accéder au tableau de bord)" : "Retour au tableau de bord"}
        </button>

        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden mb-8">
          <div className="bg-emerald-700 p-8 text-white relative overflow-hidden">
            <div className="relative z-10">
                <h1 className="text-2xl font-bold flex items-center gap-3">
                {isOnboarding ? (
                    <>
                        <Sparkles className="w-6 h-6 text-yellow-300" />
                        Bienvenue ! Finalisez votre compte
                    </>
                ) : (
                    <>
                        <User className="w-6 h-6" />
                        Informations personnelles
                    </>
                )}
                </h1>
                <p className="text-emerald-100 mt-2 opacity-80">
                    {isOnboarding
                        ? "Pour sécuriser votre accès et personnaliser votre expérience, merci de compléter ces informations."
                        : "Gérez vos coordonnées et vos informations professionnelles."
                    }
                </p>
            </div>
            {isOnboarding && <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mr-32 -mt-32"></div>}
          </div>

          <form onSubmit={handleUpdateProfile} className="p-8 space-y-8">
            {error && (
              <div className="p-4 bg-red-50 text-red-700 rounded-xl text-sm border border-red-100 font-medium animate-pulse">
                {error}
              </div>
            )}

            {success && (
              <div className="p-4 bg-emerald-50 text-emerald-700 rounded-xl text-sm border border-emerald-100 flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                <CheckCircle2 className="w-4 h-4" />
                {isOnboarding ? "Compte sécurisé et validé ! Redirection..." : "Profil mis à jour avec succès !"}
              </div>
            )}

            {/* Section Identité */}
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <User className="w-4 h-4" /> Identité
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Prénom {isOnboarding && '*'}</label>
                  <input
                    type="text"
                    required={isOnboarding}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    placeholder="Jean"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nom {isOnboarding && '*'}</label>
                  <input
                    type="text"
                    required={isOnboarding}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    placeholder="Dupont"
                  />
                </div>
              </div>
            </div>

            {/* Section Organisation (Nouveaux champs) */}
            <div className="space-y-4 pt-6 border-t border-slate-50">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Building2 className="w-4 h-4" /> Informations Professionnelles
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Entreprise {isOnboarding && '*'}</label>
                  <input
                    type="text"
                    required={isOnboarding}
                    value={entreprise}
                    onChange={(e) => setEntreprise(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    placeholder="Nom de votre structure"
                  />
                </div>

                {/* Marché : imposé par l'organisation, sinon choisi (obligatoire) */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Marché {!marcheOrganisation && '*'}</label>
                  {marcheOrganisation ? (
                    <>
                      <div
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-medium flex items-center gap-2"
                        title="Le marché de votre organisation s'applique à votre compte"
                      >
                        {marcheOrganisationInfo && (
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: marcheOrganisationInfo.couleur_accent }} />
                        )}
                        {marcheOrganisationInfo?.libelle || marcheOrganisation}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Défini par votre organisation{organisation?.nom ? ` ${organisation.nom}` : ''}.
                      </p>
                    </>
                  ) : (
                    <select
                      required
                      value={marcheCode}
                      onChange={(e) => setMarcheCode(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all bg-white"
                    >
                      <option value="">Sélectionnez votre marché...</option>
                      {marches.map((m) => (
                        <option key={m.code} value={m.code}>{m.libelle}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Filière : personnelle, facultative, dans le marché effectif */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Filière</label>
                  <select
                    value={filiereCode}
                    onChange={(e) => setFiliereCode(e.target.value)}
                    disabled={!marcheEffectif}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all bg-white disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="">{marcheEffectif ? 'Non précisée' : "Choisissez d'abord un marché"}</option>
                    {filieresProposees.map((f) => (
                      <option key={f.code} value={f.code}>{f.libelle}</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Site Web</label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                    <input
                      type="text"
                      value={siteWeb}
                      onChange={(e) => setSiteWeb(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      placeholder="www.monsite.com"
                    />
                  </div>
                </div>

                {/* Fonction : liste du marché effectif (étape 5d) */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fonction {isOnboarding && '*'}</label>
                  <select
                    required={isOnboarding}
                    value={fonctionProfil}
                    onChange={(e) => setFonctionProfil(e.target.value)}
                    disabled={!marcheEffectif}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all bg-white disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="">{marcheEffectif ? 'Sélectionnez votre fonction...' : "Choisissez d'abord un marché"}</option>
                    {marcheEffectif && profilsProposes.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {showPasswordSection && (
                <div className="space-y-4 pt-6 border-t border-slate-50 animate-in fade-in slide-in-from-top-2">
                <h2 className={`text-sm font-bold uppercase tracking-widest flex items-center gap-2 ${isOnboarding ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {isOnboarding ? <Lock className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                    {isOnboarding ? "Sécurisation du compte (Invité)" : "Sécurité"}
                </h2>

                {isOnboarding && (
                    <div className="p-3 bg-blue-50 text-blue-800 text-sm rounded-lg border border-blue-100 mb-2 flex gap-3">
                        <Info className="w-5 h-5 flex-shrink-0 mt-0.5 text-blue-600" />
                        <div>
                            <p className="font-bold mb-1">Définition du mot de passe</p>
                            <p className="opacity-90">
                                Pour sécuriser votre accès futur, veuillez définir un mot de passe personnel maintenant.
                            </p>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                        {isOnboarding ? "Créez votre mot de passe" : "Nouveau mot de passe"}
                    </label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                        placeholder={isOnboarding ? "Minimum 6 caractères" : "••••••••"}
                        minLength={6}
                    />
                    </div>
                    <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                        {isOnboarding ? "Confirmez le mot de passe" : "Confirmer le mot de passe"}
                    </label>
                    <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                        placeholder={isOnboarding ? "Répétez le mot de passe" : "••••••••"}
                        minLength={6}
                    />
                    </div>
                </div>
                {!isOnboarding && <p className="text-xs text-slate-400 italic">Laissez vide pour conserver le mot de passe actuel.</p>}
                </div>
            )}

            {isOnboarding && (
              <div className="pt-6 border-t border-slate-50 animate-in fade-in slide-in-from-top-2">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <div className="relative flex items-center mt-0.5">
                    <input
                      type="checkbox"
                      required
                      checked={acceptedTerms}
                      onChange={(e) => setAcceptedTerms(e.target.checked)}
                      className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-slate-300 transition-all checked:border-emerald-600 checked:bg-emerald-600 hover:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                    />
                    <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </div>
                  </div>
                  <span className="text-sm text-slate-600 select-none group-hover:text-slate-800 transition-colors">
                    J'accepte les{' '}
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            setShowCguModal(true);
                        }}
                        className="text-emerald-600 underline font-semibold hover:text-emerald-700"
                    >
                        conditions générales d'utilisation
                    </button>
                    {' '}de la plateforme. <span className="text-red-500">*</span>
                  </span>
                </label>
              </div>
            )}

            <div className={`pt-4 ${!isOnboarding ? 'border-t border-slate-50 mt-8' : ''}`}>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                    isOnboarding ? (
                        <>Enregistrer et accéder à mon espace <ArrowRight className="w-5 h-5" /></>
                    ) : (
                        <><Save className="w-5 h-5" /> Enregistrer les modifications</>
                    )
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {showCguModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-white/95 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
          <CGU onClose={() => setShowCguModal(false)} />
        </div>
      )}
    </div>
  );
};
