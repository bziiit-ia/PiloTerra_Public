import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { N8N } from './n8nConfig';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { Home } from './components/Home';
import { Catalog } from './components/Catalog';
import { Elearning } from './components/Elearning';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';
import { UseCases } from './components/UseCases';
import { DefiIA } from './components/DefiIA';
import { FormationPresentiel } from './components/FormationPresentiel';
import { Profile } from './components/Profile';
import { UpdatePassword } from './components/UpdatePassword';
import { Assessment } from './components/Assessment';
import { SuperAdminDashboard } from './components/SuperAdminDashboard';
import { AdminOrganisation } from './components/AdminOrganisation';
import { DataAgri } from './components/DataAgri';
import { AgentsIA } from './components/AgentsIA';
import { CGU } from './components/CGU';
import { About } from './components/About';
import { SupportModal } from './components/SupportModal';
import { BibliothequePrompts } from './components/BibliothequePrompts';
import { Page, UserRole, NewsItem, Tool, UseCase, Resource, DataAgriItem, UnifiedResource, Category, Difficulty, AgentIA, Training } from './types';
import { sendPageView } from './analytics';
import { lireCheminPublic, lirePageDepuisChemin } from './seoUrl';
import { Loader2 } from 'lucide-react';
import { useMarche } from './components/MarcheContext';
import { estVisiblePour } from './components/marcheShared';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [session, setSession] = useState<any>(null);
  const [userRole, setUserRole] = useState<UserRole>('user');
  const [adminSelectedOrgId, setAdminSelectedOrgId] = useState<string | null>(null);

  // Marché actif : filtre d'affichage appliqué au point unique `typedResources`
  // (voir fetchResources). null = mode vitrine, tout est visible.
  const { marcheActif, rafraichir: rafraichirMarche } = useMarche();

  const [entryHash] = useState(() => window.location.hash);

  // Arrivée par une URL publique générée au build
  // (ex. piloterra.fr/agents/assistant-aides-pac).
  // On retient le slug pour que le composant concerné ouvre la fiche.
  const [ficheDemandee, setFicheDemandee] = useState<string | null>(
    () => lireCheminPublic()?.slug || null
  );
  
  // Support Modal State
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  
  const [favoriteToolIds, setFavoriteToolIds] = useState<string[]>([]);
  const [favoriteUseCaseIds, setFavoriteUseCaseIds] = useState<string[]>([]);
  const [favoriteNewsIds, setFavoriteNewsIds] = useState<string[]>([]);
  const [favoriteResourceIds, setFavoriteResourceIds] = useState<string[]>([]);
  const [favoriteDataIds, setFavoriteDataIds] = useState<string[]>([]);
  const [favoriteAgentIds, setFavoriteAgentIds] = useState<string[]>([]);
  
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [toolsItems, setToolsItems] = useState<Tool[]>([]);
  const [useCasesItems, setUseCasesItems] = useState<UseCase[]>([]);
  const [resourcesItems, setResourcesItems] = useState<Resource[]>([]);
  const [dataAgriItems, setDataAgriItems] = useState<DataAgriItem[]>([]);
  const [agentsItems, setAgentsItems] = useState<AgentIA[]>([]);
  const [trainingItems, setTrainingItems] = useState<Training[]>([]);
  
  const [isOnboarding, setIsOnboarding] = useState(false);
  // Test de maturité obligatoire (arbitré le 18/09/2026) : tant qu'un compte
  // n'a pas de résultat, le portail le renvoie vers le test — y compris un
  // profil déjà complet, venu par une Fiche Défi faite en visiteur. Super
  // admins exemptés. « Reporté » : l'analyse n8n n'a pas répondu à temps,
  // on laisse entrer pour cette visite, le test sera redemandé à la suivante.
  const [testMaturiteManquant, setTestMaturiteManquant] = useState(false);
  const [testMaturiteReporte, setTestMaturiteReporte] = useState(false);
  const testMaturiteExige = testMaturiteManquant && !testMaturiteReporte;

  const handleNavigate = useCallback((page: Page) => {
    window.location.hash = page;
    setCurrentPage(page);
  }, []);

  // SUIVI GOOGLE ANALYTICS : Déclenché à chaque changement de currentPage
  useEffect(() => {
    sendPageView(currentPage);
    // On scrolle en haut de page à chaque changement pour une meilleure UX
    window.scrollTo(0, 0);
  }, [currentPage]);

  // Gestion du Routing par Hash (Liens directs)
  useEffect(() => {
    const handleHashRouting = () => {
      const hash = window.location.hash.toLowerCase().replace('#', '');

      // Priorité aux URL publiques : piloterra.fr/agents/mon-agent n'a pas
      // de hash, sans ce garde-fou on retomberait sur l'accueil.
      const cheminPublic = lireCheminPublic();
      if (cheminPublic && hash === '') {
        setCurrentPage(cheminPublic.page as Page);
        return;
      }

      // Pages de rubrique, tous marchés (/prompts) ou par marché
      // (/agriculture/prompts, étape 8). Le marché lui-même est résolu
      // par MarcheContext, qui lit aussi le chemin.
      const pageRubrique = lirePageDepuisChemin();
      if (pageRubrique && hash === '') {
        setCurrentPage(pageRubrique as Page);
        return;
      }

      const validPages: Page[] = ['home', 'news', 'catalog', 'usecases', 'elearning', 'dashboard', 'defi-ia', 'formation-presentiel', 'my-space', 'profile', 'update-password', 'assessment', 'super-admin', 'data-agri', 'agents-ia', 'cgu', 'about', 'admin-organisation', 'prompts'];

      if (hash === 'mentions-legales' || hash === 'privacy') {
        setCurrentPage('cgu');
      } else if (validPages.includes(hash as Page)) {
        setCurrentPage(hash as Page);
      } else if (hash === '') {
        setCurrentPage('home');
      }
    };

    // Vérification au chargement
    handleHashRouting();

    // Écoute des changements d'URL manuels
    window.addEventListener('hashchange', handleHashRouting);
    return () => window.removeEventListener('hashchange', handleHashRouting);
  }, [isOnboarding]);

  useEffect(() => {
    // Handle unhandled promise rejections (e.g. background Supabase token refresh errors)
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const msg = reason?.message || (typeof reason === 'string' ? reason : '');
      
      if (
        msg.includes('Refresh Token') || 
        msg.includes('refresh_token') || 
        msg.includes('Invalid Refresh Token') || 
        msg.includes('invalid_grant') ||
        (reason?.name === 'AuthApiError' && (reason?.status === 400 || reason?.status === 401))
      ) {
        console.warn("🔄 Intercepted invalid refresh token rejection. Cleaning up local session...");
        event.preventDefault(); // Prevent browser error console pollution
        Object.keys(localStorage).forEach(key => {
          if (key.includes('auth-token') || key.includes('supabase') || key.startsWith('sb-')) {
            localStorage.removeItem(key);
          }
        });
        setSession(null);
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    const initSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          console.warn("ℹ️ Session retrieval info:", error.message);
          // Any error during getSession means the saved session is invalid or non-existent
          Object.keys(localStorage).forEach(key => {
            if (key.includes('auth-token') || key.includes('supabase') || key.startsWith('sb-')) {
              localStorage.removeItem(key);
            }
          });
          try {
            await supabase.auth.signOut();
          } catch (e) {
            // Ignore signout error if session was already invalid
          }
          setSession(null);
        } else {
          setSession(data?.session || null);
          if (data?.session) {
            updateUserStatus(data.session.user.id, data.session.user.email);
          }
        }
      } catch (err: any) {
        console.warn("ℹ️ Session initialization exception handled:", err?.message || err);
        Object.keys(localStorage).forEach(key => {
          if (key.includes('auth-token') || key.includes('supabase') || key.startsWith('sb-')) {
            localStorage.removeItem(key);
          }
        });
        setSession(null);
      }
    };

    initSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("🔔 Auth State Change:", event);
      
      if (event === 'TOKEN_REFRESHED' && !session) {
        Object.keys(localStorage).forEach(key => {
          if (key.includes('auth-token') || key.includes('supabase') || key.startsWith('sb-')) {
            localStorage.removeItem(key);
          }
        });
        setSession(null);
        setUserRole('user');
        return;
      }

      setSession(session);
      
      if (event === 'SIGNED_IN' && session) {
        updateUserStatus(session.user.id, session.user.email);
        if (window.opener) {
          window.close();
        }
      }
      
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setUserRole('user');
        // Nettoyage local complet
        Object.keys(localStorage).forEach(key => {
          if (key.includes('auth-token') || key.includes('supabase') || key.startsWith('sb-')) {
            localStorage.removeItem(key);
          }
        });
      }
      
      if (event === 'PASSWORD_RECOVERY') {
        setCurrentPage('update-password');
      }
    });

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      subscription.unsubscribe();
    };
  }, []);

  // Fetch unifié depuis piloterra_resources - Extracted to useCallback for reuse
  const fetchResources = useCallback(async () => {
    try {
      const { data: allResources, error } = await supabase
        .from('piloterra_resources')
        .select('*')
        .eq('published', true) // Only fetch published resources for the public app
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      if (allResources) {
          const typedResources = (allResources as UnifiedResource[])
            .filter(r => !r.metadata?.is_public_prompt)
            // Filtre de marché — point unique pour les six familles de contenu.
            // Tableau `marches` vide/absent = transverse ; marcheActif null = vitrine.
            .filter(r => estVisiblePour(r.marches, marcheActif));

          // -- NEWS --
          const news = typedResources.filter(r => r.type === 'news').map(r => ({
              id: r.id,
              title: r.title,
              description: r.description,
              imageUrl: r.image_url || '',
              sourceLink: r.external_link || '#',
              date: r.started_at || r.metadata?.date || r.created_at, // Priorité started_at
              tagsOutilsIA: r.metadata?.tagsOutilsIA || r.metadata?.tags || [], 
              tagsMetiers: r.metadata?.tagsMetiers || [],
              tagsOutilsMetiers: r.metadata?.tagsOutilsMetiers || []
          }));
          setNewsItems(news);

          // -- TOOLS --
          const tools: Tool[] = typedResources.filter(r => r.type === 'tool').map(r => ({
              id: r.id,
              name: r.title,
              description: r.description,
              category: (r.metadata?.category || 'Gestion de Data') as Category,
              difficulty: (r.metadata?.difficulty || 'Intermédiaire') as Difficulty,
              imageUrl: r.image_url,
              link: r.external_link,
              tagsOutilsIA: r.metadata?.tagsOutilsIA || r.metadata?.tags || [],
              tagsOutilsMetiers: r.metadata?.tagsOutilsMetiers || [],
              metiers: r.metadata?.metiers || r.metadata?.tagsMetiers || [],
              process: r.metadata?.process || r.metadata?.tagsProcess || [],
              licence: (r.metadata?.licence as Tool['licence']) || 'payant',
              paysEditeur: (r.metadata?.paysEditeur || r.metadata?.country as Tool['paysEditeur']) || 'Autres',
              roi: r.metadata?.roi || 4
          }));
          setToolsItems(tools);

          // -- USE CASES --
          const useCases = typedResources.filter(r => r.type === 'usecase').map(r => ({
              id: r.id,
              title: r.title,
              description: r.description,
              tagsOutilsIA: r.metadata?.tagsOutilsIA || r.metadata?.tags || [],
              tagsMetiers: r.metadata?.tagsMetiers || [], 
              tagsOutilsMetiers: r.metadata?.tagsOutilsMetiers || [],
              tagsProcess: r.metadata?.tagsProcess || []
          }));
          setUseCasesItems(useCases);

          // -- E-LEARNING (Resources Digitales) --
          // On prend les types 'elearning' OU 'learning' SI ils ont une "nature" (video, pdf...)
          const elearning = typedResources.filter(r => 
            r.type === 'elearning' || 
            (r.type === 'learning' && r.metadata?.nature)
          ).map(r => ({
              id: r.id,
              title: r.title,
              description: r.description,
              imageUrl: r.image_url,
              link: r.external_link || '#',
              outilsMetiers: r.metadata?.outilsMetiers || r.metadata?.tagsOutilsMetiers || r.metadata?.tags || [],
              nature: r.metadata?.nature || 'video'
          }));
          setResourcesItems(elearning);

          // -- FORMATION PRESENTIEL (Training) --
          // On prend les types 'learning' qui n'ont PAS de nature mais ont un 'niveau' OU le type 'training' si ajouté plus tard
          const training = typedResources.filter(r => 
            (r.type === 'learning' && !r.metadata?.nature && r.metadata?.niveau)
          ).map(r => ({
              id: r.id,
              title: r.title,
              description: Array.isArray(r.description) ? r.description : [r.description],
              imageUrl: r.image_url,
              link: r.external_link || '#',
              niveau: r.metadata?.niveau || 'Non spécifié',
              publics: r.metadata?.publics || [],
              objectifs: r.metadata?.objectif || [],
              competences: r.metadata?.competences || [],
              editor: r.metadata?.editor,
              slug: r.slug,
              contenuLong: r.contenu_long
          }));
          setTrainingItems(training);

          // -- DATA --
          const data = typedResources.filter(r => r.type === 'data').map(r => ({
              id: r.id,
              title: r.title,
              description: r.description,
              imageUrl: r.image_url || '',
              sourceLink: r.external_link || '#',
              tags: r.metadata?.tags || [],
              slug: r.slug,
              contenuLong: r.contenu_long
          }));
          setDataAgriItems(data);

          // -- AGENTS IA --
          const agents = typedResources.filter(r => r.type === 'agent').map(r => ({
              id: r.id,
              name: r.title,
              description: r.description,
              imageUrl: r.image_url || '',
              link: r.external_link || '#',
              tags: r.metadata?.tagsMetiers || r.metadata?.tags || [],
              frameworks: r.metadata?.frameworks || [],
              capabilities: r.metadata?.capabilities || [],
              slug: r.slug,
              contenuLong: r.contenu_long
          }));
          setAgentsItems(agents);
      }

    } catch (err) {
      console.error("Erreur fetchData (PiloTerra):", err);
    }
  }, [marcheActif]);

  // Fetch initial, rejoué à chaque changement de marché actif
  // (fetchResources dépend de marcheActif).
  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  const [isInitialSetupDone, setIsInitialSetupDone] = useState(false);

  const checkProfileCompletion = useCallback(async (userId: string) => {
    try {
      const { data: profile, error } = await supabase
        .from('utilisateurs')
        .select('prenom, nom, entreprise, fonction_profil, organisation_id, role, maturity_results')
        .eq('auth_id', userId)
        .single();

      if (error) {
        console.error("Erreur checkProfileCompletion:", error);
        return;
      }

      setTestMaturiteManquant(profile.role !== 'super_admin' && !profile.maturity_results);

      // Marché effectif (organisation, sinon profil), résolu en base : sans
      // marché, le compte n'est pas complet (étape 5b). En cas d'erreur de
      // résolution, on ne force pas l'onboarding.
      const { data: marcheEffectif, error: marcheError } = await supabase.rpc('current_marche_code');
      if (marcheError) console.error("Erreur résolution du marché:", marcheError);
      const sansMarche = !marcheError && !marcheEffectif;

      // On ne bloque plus l'utilisateur, on marque juste s'il est en onboarding
      if (!profile || !profile.prenom || !profile.nom || !profile.entreprise || sansMarche) {
        setIsOnboarding(true);
      } else {
        setIsOnboarding(false);
      }
    } catch (err) {
      console.error("Exception checkProfileCompletion:", err);
    }
  }, []);

  const updateUserStatus = async (authId: string, userEmail?: string) => {
    try {
      console.log("🔄 Mise à jour du statut utilisateur...", { authId, userEmail });
      
      // 1. S'assurer que l'utilisateur existe dans la table 'utilisateurs'
      let { data: userProfile, error: fetchError } = await supabase
        .from('utilisateurs')
        .select('id, email, role, organisation_id, entreprise')
        .eq('auth_id', authId)
        .single();
      
      // Si l'utilisateur n'est pas encore créé (trigger DB), on attend
      if (fetchError && fetchError.code === 'PGRST116') {
        console.log("⏳ Profil non trouvé (trigger en cours), attente...");
        await new Promise(resolve => setTimeout(resolve, 2000));
        const retry = await supabase.from('utilisateurs').select('id, email, role, organisation_id, entreprise').eq('auth_id', authId).single();
        userProfile = retry.data;
        fetchError = retry.error;
      }

      if (fetchError || !userProfile) {
        console.error("❌ Impossible de récupérer le profil utilisateur:", fetchError);
        setIsInitialSetupDone(true);
        return;
      }

// 2. Mettre à jour l'email ET tracker la dernière connexion (last_seen)
      const needsEmailUpdate = userEmail && (!userProfile.email || userProfile.email !== userEmail);
      
      // On prépare l'objet de mise à jour avec le last_seen systématique
      const updatePayload: any = { 
        updated_at: new Date().toISOString(),
        last_seen: new Date().toISOString() 
      };

      if (needsEmailUpdate) {
        updatePayload.provenance = 'piloterra';
        updatePayload.email = userEmail?.toLowerCase().trim();
      }
      
      // On envoie la mise à jour à Supabase
      const { error: updateError } = await supabase
        .from('utilisateurs')
        .update(updatePayload)
        .eq('auth_id', authId);
        
      if (updateError) {
        console.error("⚠️ Erreur mise à jour utilisateur (email/last_seen):", updateError);
      } else if (needsEmailUpdate) {
        userProfile.email = userEmail?.toLowerCase().trim();
      }
      
      // Ne surtout pas oublier cette ligne pour les droits d'accès !
      setUserRole(userProfile.role as UserRole);
      
      // 3. GESTION DES INVITATIONS (Rattachement automatique)
      // Tout se passe en base, dans accepter_invitation() : le navigateur ne
      // peut plus modifier lui-même son organisation ni son rôle (RLS +
      // trigger de garde). La fonction retrouve l'invitation en attente à
      // l'e-mail du compte connecté, rattache le profil et marque
      // l'invitation acceptée, en une seule transaction.
      const effectiveEmail = userProfile.email || userEmail;

      if (effectiveEmail && !userProfile.organisation_id) {
        const cleanEmail = effectiveEmail.toLowerCase().trim();

        const { data: acceptation, error: invitError } = await supabase.rpc('accepter_invitation');

        if (invitError) {
          // On ne bloque pas l'utilisateur : il pourra remplir son profil
          console.error("❌ Erreur acceptation invitation:", invitError);
        } else if (acceptation?.statut === 'acceptee') {
          console.log("🎉 Invitation acceptée, rattachement à l'organisation:", acceptation.entreprise);
          if (acceptation.role) setUserRole(acceptation.role as UserRole);
          // Le marché de l'organisation s'impose désormais : on le recharge
          rafraichirMarche();

          // Notifier le webhook n8n
          try {
            fetch(N8N.majStatutInvitation, {
              method: 'POST',
              mode: 'no-cors',
              headers: { 'Content-Type': 'text/plain' },
              body: JSON.stringify({
                invitation_id: acceptation.invitation_id,
                email: cleanEmail,
                user_id: acceptation.utilisateur_id,
                organisation_id: acceptation.organisation_id,
                entreprise: acceptation.entreprise,
                status: 'accepted',
                timestamp: new Date().toISOString()
              })
            });
          } catch (e) { console.error("Erreur webhook n8n:", e); }
        } else {
          console.log("ℹ️ Pas d'invitation acceptée :", acceptation?.statut);
        }
      }

      // 4. Vérifier la complétion du profil pour l'onboarding
      await checkProfileCompletion(authId);
      setIsInitialSetupDone(true);

    } catch (err) {
      console.error("❌ Exception dans updateUserStatus:", err);
      setIsInitialSetupDone(true);
    }
  };

  useEffect(() => {
    if (!session?.user?.id) {
      setIsOnboarding(false);
      setTestMaturiteManquant(false);
      setIsInitialSetupDone(true);
    }
  }, [session]);

  // Un report ne vaut que pour le compte qui l'a obtenu.
  useEffect(() => {
    setTestMaturiteReporte(false);
  }, [session?.user?.id]);

  // Sécurité anti-blocage : force la fin du chargement après 3s
  useEffect(() => {
    if (session && !isInitialSetupDone) {
      const timer = setTimeout(() => {
        console.warn("⚠️ Timeout d'initialisation atteint, déblocage forcé.");
        setIsInitialSetupDone(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [session, isInitialSetupDone]);

  // Redirection forcée vers le profil si l'onboarding est nécessaire
  useEffect(() => {
    if (session && isOnboarding && isInitialSetupDone && currentPage !== 'profile' && currentPage !== 'assessment' && currentPage !== 'cgu') {
      console.log("🚀 Redirection forcée vers l'onboarding (Profil)");
      setCurrentPage('profile');
      window.location.hash = 'profile';
    } else if (session && !isOnboarding && testMaturiteExige && isInitialSetupDone
      && !['assessment', 'profile', 'cgu', 'update-password'].includes(currentPage)) {
      // Profil complet mais pas de résultat de maturité : passage obligé par le test
      console.log("🚀 Redirection forcée vers le test de maturité");
      setCurrentPage('assessment');
      window.location.hash = 'assessment';
    }
  }, [session, isOnboarding, testMaturiteExige, isInitialSetupDone, currentPage]);

  const toggleFavorite = async (id: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    if (!session?.user?.id) return;
    
    const { data: existing } = await supabase
        .from('piloterra_bookmarks')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('resource_id', id)
        .maybeSingle();

    if (existing) {
        setter(prev => prev.filter(tid => tid !== id));
        await supabase.from('piloterra_bookmarks').delete().eq('user_id', session.user.id).eq('resource_id', id);
    } else {
        setter(prev => [...prev, id]);
        await supabase.from('piloterra_bookmarks').insert({ user_id: session.user.id, resource_id: id });
    }
  };

  useEffect(() => {
    const fetchFavorites = async () => {
      if (session?.user?.id) {
        const { data: bookmarks } = await supabase
            .from('piloterra_bookmarks')
            .select('resource_id, piloterra_resources(type)') 
            .eq('user_id', session.user.id);

        if (bookmarks) {
            const newFavs = bookmarks.map((b: any) => ({ id: b.resource_id, type: b.piloterra_resources?.type }));
            setFavoriteToolIds(newFavs.filter(f => f.type === 'tool').map(f => f.id));
            setFavoriteNewsIds(newFavs.filter(f => f.type === 'news').map(f => f.id));
            setFavoriteUseCaseIds(newFavs.filter(f => f.type === 'usecase').map(f => f.id));
            setFavoriteResourceIds(newFavs.filter(f => f.type === 'learning' || f.type === 'elearning').map(f => f.id));
            setFavoriteDataIds(newFavs.filter(f => f.type === 'data').map(f => f.id));
            setFavoriteAgentIds(newFavs.filter(f => f.type === 'agent').map(f => f.id));
        }
      } else {
        setFavoriteToolIds([]);
        setFavoriteUseCaseIds([]);
        setFavoriteNewsIds([]);
        setFavoriteResourceIds([]);
        setFavoriteDataIds([]);
        setFavoriteAgentIds([]);
      }
    };
    fetchFavorites();
  }, [session]);

  const openSupport = () => setIsSupportOpen(true);

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <About onNavigate={handleNavigate} session={session} />;
      case 'news':
        return <Home onNavigate={handleNavigate} session={session} news={newsItems} favorites={favoriteNewsIds} onToggleFavorite={(id) => toggleFavorite(id, setFavoriteNewsIds)} />;
      case 'catalog':
        return <Catalog onNavigate={handleNavigate} session={session} tools={toolsItems} favorites={favoriteToolIds} onToggleFavorite={(id) => toggleFavorite(id, setFavoriteToolIds)} />;
      case 'data-agri':
        return <DataAgri onNavigate={handleNavigate} session={session} dataItems={dataAgriItems} favorites={favoriteDataIds} onToggleFavorite={(id) => toggleFavorite(id, setFavoriteDataIds)} slugInitial={ficheDemandee} onFicheOuverte={() => setFicheDemandee(null)} />;
      case 'agents-ia':
        return <AgentsIA onNavigate={handleNavigate} session={session} agents={agentsItems} favorites={favoriteAgentIds} onToggleFavorite={(id) => toggleFavorite(id, setFavoriteAgentIds)} slugInitial={ficheDemandee} onFicheOuverte={() => setFicheDemandee(null)} />;
      case 'elearning':
        return <Elearning session={session} onNavigate={handleNavigate} resources={resourcesItems} favorites={favoriteResourceIds} onToggleFavorite={(id) => toggleFavorite(id, setFavoriteResourceIds)} />;
      case 'usecases':
        return <UseCases session={session} onNavigate={handleNavigate} useCases={useCasesItems} favorites={favoriteUseCaseIds} onToggleFavorite={(id) => toggleFavorite(id, setFavoriteUseCaseIds)} />;
      case 'my-space':
      case 'dashboard':
        return session 
          ? <Dashboard 
              session={session} 
              onNavigate={handleNavigate}
              onOpenSupport={openSupport} 
              news={newsItems}
              tools={toolsItems}
              useCases={useCasesItems}
              resources={resourcesItems}
              dataItems={dataAgriItems}
              agents={agentsItems}
              favoriteToolIds={favoriteToolIds}
              favoriteUseCaseIds={favoriteUseCaseIds}
              favoriteNewsIds={favoriteNewsIds}
              favoriteResourceIds={favoriteResourceIds}
              favoriteDataIds={favoriteDataIds}
              favoriteAgentIds={favoriteAgentIds}
              onToggleToolFavorite={(id) => toggleFavorite(id, setFavoriteToolIds)}
              onToggleUseCaseFavorite={(id) => toggleFavorite(id, setFavoriteUseCaseIds)}
              onToggleNewsFavorite={(id) => toggleFavorite(id, setFavoriteNewsIds)}
              onToggleResourceFavorite={(id) => toggleFavorite(id, setFavoriteResourceIds)}
              onToggleDataFavorite={(id) => toggleFavorite(id, setFavoriteDataIds)}
              onToggleAgentFavorite={(id) => toggleFavorite(id, setFavoriteAgentIds)}
            /> 
          : <Auth onNavigate={handleNavigate} />;
      case 'profile':
        return session ? <Profile session={session} onNavigate={handleNavigate} isOnboarding={isOnboarding} entryHash={entryHash} onOpenSupport={openSupport} onProfileUpdate={() => checkProfileCompletion(session.user.id)} /> : <Auth onNavigate={handleNavigate} />;
      case 'defi-ia':
        return <DefiIA session={session} onNavigate={handleNavigate} />;
      case 'formation-presentiel':
        // Passage des formations dynamiques
        return <FormationPresentiel session={session} onNavigate={handleNavigate} trainings={trainingItems} slugInitial={ficheDemandee} onFicheOuverte={() => setFicheDemandee(null)} />;
      case 'update-password':
        return <UpdatePassword onNavigate={handleNavigate} />;
      case 'assessment':
        return session ? (
          <Assessment
            session={session}
            onNavigate={handleNavigate}
            isOnboarding={isOnboarding || testMaturiteExige}
            onResultat={() => checkProfileCompletion(session.user.id)}
            onReporter={testMaturiteExige ? () => setTestMaturiteReporte(true) : undefined}
          />
        ) : <Auth onNavigate={handleNavigate} />;
      case 'super-admin':
        return session && userRole === 'super_admin' ? (
          <SuperAdminDashboard 
            session={session} 
            onNavigate={handleNavigate} 
            onDataChange={fetchResources} 
            onSelectOrg={(orgId) => {
              setAdminSelectedOrgId(orgId);
              handleNavigate('admin-organisation');
            }}
          />
        ) : <About onNavigate={handleNavigate} session={session} />; 
      case 'admin-organisation':
        return session && (userRole === 'admin_coop' || userRole === 'super_admin' || userRole === 'user' || userRole === 'member_orga') ? (
          <AdminOrganisation 
            session={session} 
            onNavigate={(page) => {
              if (page !== 'admin-organisation') {
                setAdminSelectedOrgId(null);
              }
              handleNavigate(page);
            }} 
            adminSelectedOrgId={adminSelectedOrgId || undefined}
          />
        ) : <About onNavigate={handleNavigate} session={session} />;
      case 'prompts':
        return <BibliothequePrompts session={session} onNavigate={handleNavigate} />;
      case 'cgu':
        return <CGU onNavigate={handleNavigate} />;
      case 'about':
        return <About onNavigate={handleNavigate} session={session} />;
      default:
        return <About onNavigate={handleNavigate} session={session} />;
    }
  };

  if (!isInitialSetupDone && session) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Initialisation de votre espace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Header currentPage={currentPage} onNavigate={handleNavigate} isLoggedIn={!!session} userRole={userRole} />
      <main className="flex-grow w-full">{renderPage()}</main>
      <Footer onNavigate={handleNavigate} />

      <SupportModal
        isOpen={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
        session={session}
      />
    </div>
  );
}

export default App;