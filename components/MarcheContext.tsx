// =====================================================================
//  PILOTERRA — MULTI-MARCHÉ · Le contexte
//
//  Un seul endroit où l'on décide quel marché est actif.
//  Tous les écrans le consomment, aucun ne réimplémente la règle.
//
//  Monté dans index.tsx, AU-DESSUS de <App />, pour que App lui-même
//  puisse filtrer ses données. Le provider suit donc la session tout
//  seul, il ne la reçoit plus en props.
//
//  Cascade de résolution, dans l'ordre :
//    0. marché de l'utilisateur connecté, s'il en a un ET qu'il n'est pas
//       super_admin → VERROUILLÉ. Ni l'URL ni le choix mémorisé ne peuvent
//       le contourner : un membre reste sur le marché de son organisation.
//    1. ?marche=... dans l'URL          (partage de lien, atterrissage SEO)
//    2. choix mémorisé dans le navigateur
//    3. marché de l'utilisateur connecté (organisation, sinon profil)
//       — ne reste atteignable ici que pour le super_admin, qui doit
//       pouvoir vérifier le rendu de chaque marché sans se déconnecter
//    4. aucun → mode vitrine tri-marché
//
//  La résolution se rejoue quand la session change, et à la demande via
//  rafraichir() : après l'enregistrement du profil (étape 5b), le marché
//  de l'utilisateur a pu changer sans que la session change.
//
//  Étape 10 : le portail entier prend la palette du marché actif
//  (paletteMarche.ts). Vitrine = palette historique. rechargerReferentiel()
//  relit la table marches après une modification des couleurs dans la
//  console.
//
//  À placer dans : components/MarcheContext.tsx
// =====================================================================

import React, {
  createContext, useContext, useState, useEffect, useCallback, useMemo,
} from 'react';
import { supabase } from '../supabaseClient';
import {
  Marche, Filiere, OrigineMarche,
  estVisiblePour, lireMarcheDepuisUrl, lireMarcheMemorise, memoriserMarche,
  ecrireMarcheDansUrl,
  filieresDuMarche, baselineMarche, accentMarche, motMarcheActif,
} from './marcheShared';
import { appliquerPalette } from './paletteMarche';
import { definirMarcheAnalytics } from '../analytics';

interface MarcheContexte {
  /** Référentiel chargé depuis la base (marchés actifs uniquement). */
  marches: Marche[];
  filieres: Filiere[];

  /** Code du marché actif. null = vitrine, tout est visible. */
  marcheActif: string | null;
  marcheCourant: Marche | null;
  origine: OrigineMarche;

  /** Filières du marché actif, prêtes pour un menu déroulant. */
  filieresActives: Filiere[];

  /** Éléments d'habillage dérivés du marché actif. */
  baseline: string;
  accent: string;
  /** « l'agriculture », « la logistique »… null en vitrine (phrase neutre). */
  motMarche: string | null;

  chargement: boolean;

  /** Change le marché. null revient au mode vitrine. Mémorise le choix.
   *  Sans effet si le marché est verrouillé. */
  choisirMarche: (code: string | null) => void;

  /** La règle de visibilité, appliquée au marché actif. */
  estVisible: (marches: string[] | null | undefined) => boolean;

  /** Vrai si le sélecteur a du sens (au moins deux marchés au référentiel). */
  selecteurDisponible: boolean;

  /** Vrai si l'utilisateur est assigné à son marché et ne peut pas en changer.
   *  Le sélecteur s'affiche alors en badge figé. */
  marcheVerrouille: boolean;

  /** Le super_admin échappe au verrouillage : il doit pouvoir tester. */
  estSuperAdmin: boolean;

  /** Rejoue la résolution. À appeler après une modification du marché
   *  de l'utilisateur ou de son organisation. */
  rafraichir: () => void;

  /** Relit le référentiel (marchés, filières). À appeler après une
   *  modification en base, par exemple des couleurs d'un marché. */
  rechargerReferentiel: () => void;
}

const Contexte = createContext<MarcheContexte | null>(null);

export const useMarche = (): MarcheContexte => {
  const ctx = useContext(Contexte);
  if (!ctx) {
    throw new Error('useMarche doit être appelé à l\'intérieur de <MarcheProvider>.');
  }
  return ctx;
};

export const MarcheProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [marches, setMarches] = useState<Marche[]>([]);
  const [filieres, setFilieres] = useState<Filiere[]>([]);
  const [marcheActif, setMarcheActif] = useState<string | null>(null);
  const [origine, setOrigine] = useState<OrigineMarche>('vitrine');
  const [chargement, setChargement] = useState(true);
  const [estSuperAdmin, setEstSuperAdmin] = useState(false);

  // Incrémenté par rafraichir() pour rejouer la résolution.
  const [version, setVersion] = useState(0);

  // Incrémenté par rechargerReferentiel() pour relire la table marches.
  const [versionReferentiel, setVersionReferentiel] = useState(0);

  // Identifiant de l'utilisateur connecté, suivi en propre.
  // On ne garde que l'id : c'est la seule chose dont dépend la résolution,
  // et ça évite de rejouer la cascade à chaque rafraîchissement de jeton.
  const [utilisateurId, setUtilisateurId] = useState<string | null>(null);

  // -------------------------------------------------------------------
  //  1. Suivi de la session
  // -------------------------------------------------------------------
  useEffect(() => {
    let annule = false;

    supabase.auth.getSession().then(({ data }) => {
      if (!annule) setUtilisateurId(data.session?.user?.id ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUtilisateurId(session?.user?.id ?? null);
    });

    return () => { annule = true; subscription.unsubscribe(); };
  }, []);

  // -------------------------------------------------------------------
  //  2. Chargement du référentiel
  //     Lecture publique : fonctionne aussi pour un visiteur anonyme.
  // -------------------------------------------------------------------
  useEffect(() => {
    let annule = false;

    const charger = async () => {
      const [resMarches, resFilieres] = await Promise.all([
        supabase.from('marches').select('*').eq('actif', true).order('ordre'),
        supabase.from('filieres').select('*').eq('actif', true).order('ordre'),
      ]);

      if (annule) return;

      if (resMarches.error) console.error('Chargement des marchés :', resMarches.error.message);
      if (resFilieres.error) console.error('Chargement des filières :', resFilieres.error.message);

      setMarches((resMarches.data ?? []) as Marche[]);
      setFilieres((resFilieres.data ?? []) as Filiere[]);
    };

    charger();
    return () => { annule = true; };
  }, [versionReferentiel]);

  // -------------------------------------------------------------------
  //  3. Résolution du marché actif
  // -------------------------------------------------------------------
  useEffect(() => {
    if (marches.length === 0) return;
    let annule = false;

    const codesValides = new Set(marches.map((m) => m.code));
    const valide = (c: string | null | undefined): c is string => !!c && codesValides.has(c);

    const resoudre = async () => {
      setChargement(true);

      // Le marché de l'utilisateur et son rôle sont résolus en base d'abord :
      // ce sont eux qui décident si la cascade s'applique ou si le marché
      // est verrouillé. current_marche_code() applique la priorité en base :
      // organisation d'abord, profil seulement hors organisation.
      let marcheAssigne: string | null = null;
      let superAdmin = false;

      if (utilisateurId) {
        const [resMarche, resAdmin] = await Promise.all([
          supabase.rpc('current_marche_code'),
          supabase.rpc('is_super_admin'),
        ]);
        if (resMarche.error) console.error('Résolution du marché utilisateur :', resMarche.error.message);
        if (resAdmin.error) console.error('Résolution du rôle :', resAdmin.error.message);
        if (valide(resMarche.data as string)) marcheAssigne = resMarche.data as string;
        superAdmin = resAdmin.data === true;
      }

      if (annule) return;
      setEstSuperAdmin(superAdmin);

      // 0. Utilisateur assigné à un marché : il prime sur tout et se verrouille.
      //    Sans cette priorité, un choix fait en visiteur (mémorisé dans le
      //    navigateur) survivrait à la connexion et l'emporterait sur le
      //    marché de son organisation.
      if (marcheAssigne && !superAdmin) {
        setMarcheActif(marcheAssigne); setOrigine('assigne'); setChargement(false);
        return;
      }

      // 1. L'URL.
      const depuisUrl = lireMarcheDepuisUrl();
      if (valide(depuisUrl)) {
        setMarcheActif(depuisUrl); setOrigine('url'); setChargement(false);
        return;
      }

      // 2. Choix explicite mémorisé.
      const memorise = lireMarcheMemorise();
      if (valide(memorise)) {
        setMarcheActif(memorise); setOrigine('choix'); setChargement(false);
        return;
      }

      // 3. Marché de l'utilisateur sans surcharge — seul le super_admin
      //    atteint encore cette étape, les autres sont sortis en 0.
      if (marcheAssigne) {
        setMarcheActif(marcheAssigne); setOrigine('profil'); setChargement(false);
        return;
      }

      // 4. Rien de déterminé : vitrine tri-marché.
      setMarcheActif(null); setOrigine('vitrine'); setChargement(false);
    };

    resoudre();
    return () => { annule = true; };
  }, [marches, utilisateurId, version]);

  // -------------------------------------------------------------------
  //  4. Choix manuel et rafraîchissement
  // -------------------------------------------------------------------
  //  Garde-fou : un utilisateur assigné ne change pas de marché, même par
  //  un appel programmatique. Le sélecteur est de toute façon figé pour lui.
  const verrouille = origine === 'assigne';

  const choisirMarche = useCallback((code: string | null) => {
    if (verrouille) return;
    setMarcheActif(code);
    setOrigine(code ? 'choix' : 'vitrine');
    memoriserMarche(code);
    // L'adresse suit le choix : /agriculture, /agriculture/prompts…
    // (étape 8). Les fiches publiques ne sont pas réécrites.
    ecrireMarcheDansUrl(code, marches.map((m) => m.code));
  }, [verrouille, marches]);

  const rafraichir = useCallback(() => setVersion((v) => v + 1), []);
  const rechargerReferentiel = useCallback(() => setVersionReferentiel((v) => v + 1), []);

  // -------------------------------------------------------------------
  //  5. Palette du marché actif (étape 10)
  //     Posée sur <html> : Tailwind lit les variables. Vitrine ou couleur
  //     de marque : palette historique.
  // -------------------------------------------------------------------
  const marcheCourant = useMemo(
    () => marches.find((m) => m.code === marcheActif) ?? null,
    [marches, marcheActif],
  );

  useEffect(() => {
    appliquerPalette(marcheCourant?.couleur_accent ?? null, marcheCourant?.couleur_secondaire ?? null);
  }, [marcheCourant]);

  // Google Analytics : le marché affiché accompagne pages vues et
  // événements (reporting segmenté, étape 10). Attendu la fin de la
  // résolution, pour ne pas étiqueter « vitrine » un compte verrouillé.
  useEffect(() => {
    if (!chargement) definirMarcheAnalytics(marcheActif);
  }, [marcheActif, chargement]);

  // -------------------------------------------------------------------
  //  6. Valeurs dérivées
  // -------------------------------------------------------------------
  const valeur = useMemo<MarcheContexte>(() => ({
    marches,
    filieres,
    marcheActif,
    marcheCourant,
    origine,
    filieresActives: filieresDuMarche(filieres, marcheActif),
    baseline: baselineMarche(marches, marcheActif),
    accent: accentMarche(marches, marcheActif),
    motMarche: motMarcheActif(marches, marcheActif),
    chargement,
    choisirMarche,
    estVisible: (m) => estVisiblePour(m, marcheActif),
    selecteurDisponible: marches.length > 1,
    marcheVerrouille: verrouille,
    estSuperAdmin,
    rafraichir,
    rechargerReferentiel,
  }), [marches, filieres, marcheActif, marcheCourant, origine, chargement, choisirMarche, verrouille, estSuperAdmin, rafraichir, rechargerReferentiel]);

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
};
