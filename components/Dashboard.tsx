import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { LogOut, Heart, Clock, Zap, LifeBuoy, Target, ArrowRight, Award, Sparkles, User, X, LayoutDashboard, Calendar, FileText, Database, Newspaper, GraduationCap, Server, ExternalLink, Building2, Users, Quote, Globe, BarChart2, Tag, BrainCircuit, Loader2, RefreshCw, Search, TrendingUp, Bot, Terminal, Cpu, Leaf, Droplets, Car, Train, Smartphone, MessageSquare, Wheat, Beef, Wine, Trash2, Edit3, Save, Library, Copy, Check } from 'lucide-react';
import { Page, DefiView, Tool, NewsItem, UseCase, Resource, DataAgriItem, MaturityResult, AgentIA, AgentMetric, PlatformMetric } from '../types';
import { sendEvent } from '../analytics';
import { ToolCard } from './ToolCard';
import { Prompt as LibPrompt, toolLabel, FRUGALITY_META, fillTemplate, parseVariables } from './promptShared';
import { RejoindreSession } from './RejoindreSession';

interface DashboardProps {
  session: any;
  onNavigate: (page: Page) => void;
  onOpenSupport?: () => void;
  news?: NewsItem[]; 
  tools?: Tool[]; 
  useCases?: UseCase[]; 
  resources?: Resource[]; 
  dataItems?: DataAgriItem[];
  agents?: AgentIA[];
  favoriteToolIds?: string[];
  favoriteUseCaseIds?: string[];
  favoriteNewsIds?: string[];
  favoriteResourceIds?: string[];
  favoriteDataIds?: string[];
  favoriteAgentIds?: string[];
  onToggleToolFavorite?: (id: string) => void;
  onToggleUseCaseFavorite?: (id: string) => void;
  onToggleNewsFavorite?: (id: string) => void;
  onToggleResourceFavorite?: (id: string) => void;
  onToggleDataFavorite?: (id: string) => void;
  onToggleAgentFavorite?: (id: string) => void;
}

// Fonction utilitaire pour parser le JSON
const safeParse = (data: any) => {
  if (!data) return {};
  if (typeof data === 'object') return data;
  try {
    return JSON.parse(data);
  } catch (e1) {
    if (typeof data === 'string') {
      try {
        let cleaned = data.trim();
        if (cleaned.startsWith('```')) {
          cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        }
        cleaned = cleaned.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ');
        cleaned = cleaned.replace(/([{,]\s*)'([^']+)'(\s*:)/g, '$1"$2"$3');
        cleaned = cleaned.replace(/(:\s*)'([^']+)'(\s*[,}])/g, '$1"$2"$3');
        cleaned = cleaned.replace(/([{,]\s*)([a-zA-Z0-9_]+)(\s*:)/g, '$1"$2"$3');
        return JSON.parse(cleaned);
      } catch (e2) {
        // Fallback pour les JSON mal formés (ex: guillemets non échappés)
        const result: any = {};
        const regex = /"([^"]+)"\s*:\s*"([\s\S]*?)"(?=\s*(?:,\s*"[^"]+"\s*:|}))/g;
        let match;
        let found = false;
        while ((match = regex.exec(data)) !== null) {
          found = true;
          result[match[1]] = match[2];
        }
        if (found) return result;
        
        return {};
      }
    }
    return {};
  }
};

const parseFormatting = (text: string) => {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-bold text-slate-900">{part.slice(2, -2)}</strong>;
    }
    const subParts = part.split(/(\*.*?\*)/g);
    return subParts.map((subPart, j) => {
       if (subPart.startsWith('*') && subPart.endsWith('*') && subPart.length > 2) {
         return <em key={`${i}-${j}`} className="italic text-slate-600">{subPart.slice(1, -1)}</em>;
       }
       return subPart;
    });
  });
};

const renderMarkdown = (text: string) => {
  if (!text) return null;
  return text.split('\n').map((line, index) => {
    const cleanLine = line.trim();
    if (cleanLine.startsWith('- ') || cleanLine.startsWith('* ')) {
      return <li key={index} className="ml-4 list-disc pl-1 mb-1 text-slate-700">{parseFormatting(cleanLine.substring(2))}</li>;
    }
    if (cleanLine.startsWith('### ')) {
      return <h4 key={index} className="text-md font-bold text-slate-900 mt-4 mb-2">{parseFormatting(cleanLine.substring(4))}</h4>;
    }
    if (cleanLine === '') return <div key={index} className="h-2"></div>;
    return <p key={index} className="mb-2 text-slate-700 leading-relaxed">{parseFormatting(line)}</p>;
  });
};

export const Dashboard: React.FC<DashboardProps> = ({ 
  session, onNavigate, onOpenSupport,
  news = [], tools = [], useCases = [], resources = [], dataItems = [], agents = [],
  favoriteToolIds = [], favoriteUseCaseIds = [], favoriteNewsIds = [], favoriteResourceIds = [], favoriteDataIds = [], favoriteAgentIds = [],
  onToggleToolFavorite, onToggleUseCaseFavorite, onToggleNewsFavorite, onToggleResourceFavorite, onToggleDataFavorite, onToggleAgentFavorite
}) => {
  const [displayName, setDisplayName] = useState('');
  const [assessment, setAssessment] = useState<MaturityResult | null>(null);
  const [lastDefi, setLastDefi] = useState<DefiView | null>(null);
  
  const [isLoadingAssessment, setIsLoadingAssessment] = useState(false);
  const [isLoadingDefi, setIsLoadingDefi] = useState(false);
  
  // My Space State
  const [activeTab, setActiveTab] = useState<'tools' | 'usecases' | 'news' | 'resources' | 'defis' | 'data' | 'agents' | 'stats' | 'prompts'>('tools');
  // Prompts favoris (bibliothèque) — chargés indépendamment du système de bookmarks
  const [favPrompts, setFavPrompts] = useState<LibPrompt[]>([]);
  const [promptUserId, setPromptUserId] = useState<string | null>(null);
  const [promptReader, setPromptReader] = useState<LibPrompt | null>(null);
  const [promptVars, setPromptVars] = useState<Record<string, string>>({});
  const [promptCopied, setPromptCopied] = useState(false);

  useEffect(() => {
    const run = async () => {
      if (!session?.user?.id) { setFavPrompts([]); setPromptUserId(null); return; }
      // Les favoris sont clés sur utilisateurs.id (et non auth.uid())
      const { data: me } = await supabase.from('utilisateurs').select('id').eq('auth_id', session.user.id).single();
      if (!me?.id) { setFavPrompts([]); setPromptUserId(null); return; }
      setPromptUserId(me.id);
      const { data: favs } = await supabase.from('prompt_favorites').select('prompt_id').eq('user_id', me.id);
      const ids = (favs ?? []).map((f: any) => f.prompt_id);
      if (ids.length === 0) { setFavPrompts([]); return; }
      const { data: rows } = await supabase.from('prompts').select('*').in('id', ids);
      setFavPrompts(((rows ?? []).map((p: any) => ({ ...p, variables: parseVariables(p.variables) }))) as LibPrompt[]);
    };
    run();
  }, [session]);

  const removeFavPrompt = async (id: string) => {
    if (!promptUserId) return;
    await supabase.from('prompt_favorites').delete().match({ user_id: promptUserId, prompt_id: id });
    setFavPrompts((prev) => prev.filter((p) => p.id !== id));
    if (promptReader?.id === id) setPromptReader(null);
  };
  const openPromptReader = (p: LibPrompt) => { setPromptReader(p); setPromptVars({}); setPromptCopied(false); };
  const copyReaderPrompt = async () => {
    if (!promptReader) return;
    try {
      await navigator.clipboard.writeText(fillTemplate(promptReader.content, promptVars));
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
      await supabase.rpc('increment_prompt_usage', { p_prompt_id: promptReader.id });
    } catch { /* noop */ }
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [defis, setDefis] = useState<DefiView[]>([]);
  const [isLoadingDefisList, setIsLoadingDefisList] = useState(false);
  const [selectedDefi, setSelectedDefi] = useState<DefiView | null>(null);

  // Metrics State
  const [metrics, setMetrics] = useState<AgentMetric[]>([]);
  const [platformMetrics, setPlatformMetrics] = useState<PlatformMetric[]>([]);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);
  
  // Edit Defi State
  const [editingDefiId, setEditingDefiId] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState('');

  // Custom UI State
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'alert' } | null>(null);

  // Auto-hide notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // TRACKING VIEW
  useEffect(() => {
    sendEvent('view_component', 'Navigation', 'Dashboard');
  }, []);

  const handleTabChange = (tab: 'tools' | 'usecases' | 'news' | 'resources' | 'defis' | 'data' | 'agents' | 'stats' | 'prompts') => {
    setActiveTab(tab);
    sendEvent('change_tab', 'Dashboard', tab);
  };

  const fetchProfileData = useCallback(async () => {
    if (!session?.user?.id) return;

    try {
      setIsLoadingAssessment(true);
      const { data: profile } = await supabase
        .from('utilisateurs')
        .select('id, prenom, nom, maturity_results')
        .eq('auth_id', session.user.id)
        .single();
      
      let userPk = null;

      if (profile) {
        userPk = profile.id; 
        if (profile.prenom || profile.nom) setDisplayName(`${profile.prenom || ''} ${profile.nom || ''}`.trim());
        
        if (profile.maturity_results) {
            setAssessment(safeParse(profile.maturity_results) as MaturityResult);
        }
      }
      setIsLoadingAssessment(false);

      if (userPk) {
          setIsLoadingDefi(true);
          const { data: rawDefi, error: defiError } = await supabase
            .from('diagnostics')
            .select('*')
            .eq('user_id', userPk)
            .eq('provenance', 'piloterra')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!defiError && rawDefi) {
            const inputs = safeParse(rawDefi.inputs_client || rawDefi.inputs_clients);
            const outputAgent = safeParse(rawDefi.output_agent_defi || rawDefi.out_agent_defi);
            const outputMatrice = safeParse(rawDefi.output_agent_matrice || rawDefi.outpout_agent_matrice);
            const scraper = safeParse(rawDefi.enrichissement_scraper);

            const mappedDefi: DefiView = {
                id: rawDefi.id,
                user_id: rawDefi.user_id,
                created_at: rawDefi.created_at,
                email: session.user.email, 
                
                probleme: inputs.question_1 || inputs.probleme || inputs.q1 || 'Non défini',
                vision: inputs.question_2 || inputs.vision || inputs.q2 || 'Non défini',
                ressources: inputs.question_3 || inputs.ressources || inputs.q3 || 'Non défini',
                
                titreDefi: outputAgent.titreDefi || outputAgent.titre || null,
                contexte_ia: outputAgent.contexteProbleme || outputAgent.contexte || null,
                questionCle: outputAgent.questionCle || outputAgent.question_cle || null,
                
                pistesDeReflexion1: Array.isArray(outputAgent.pistesDeReflexion) ? outputAgent.pistesDeReflexion[0] : (outputAgent.pistes?.[0] || null),
                pistesDeReflexion2: Array.isArray(outputAgent.pistesDeReflexion) ? outputAgent.pistesDeReflexion[1] : (outputAgent.pistes?.[1] || null),
                pistesDeReflexion3: Array.isArray(outputAgent.pistesDeReflexion) ? outputAgent.pistesDeReflexion[2] : (outputAgent.pistes?.[2] || null),
                
                motsCles: (outputAgent.motsCles || outputAgent.mots_cles || []).join(', '),
                
                quadrant: outputMatrice.quadrant_nom || outputMatrice.quadrant || null,
                score_roi: outputMatrice.score_roi || null,
                score_complexite: outputMatrice.score_complexite || null,
                justification: outputMatrice.justification || null,
                
                analyse_web: scraper
            };

            setLastDefi(mappedDefi);
          }
          setIsLoadingDefi(false);
      } else {
          setIsLoadingDefi(false);
      }

    } catch (error) {
      console.error("Erreur globale fetchProfileData:", error);
      setIsLoadingAssessment(false);
      setIsLoadingDefi(false);
    }
  }, [session]);

  const fetchAllDefis = useCallback(async () => {
    if (!session?.user?.id) return;
    setIsLoadingDefisList(true);

    try {
        const { data: userData } = await supabase.from('utilisateurs').select('id').eq('auth_id', session.user.id).single();
            
        if (userData) {
            const { data, error: diagError } = await supabase
            .from('diagnostics')
            .select('*')
            .eq('user_id', userData.id)
            .eq('provenance', 'piloterra')
            .order('created_at', { ascending: false });

            if (diagError) throw diagError;

            if (data) {
                const mappedDefis: DefiView[] = data.map((d: any) => {
                    const inputs = safeParse(d.inputs_client || d.inputs_clients);
                    const outputAgent = safeParse(d.output_agent_defi || d.out_agent_defi);
                    const outputMatrice = safeParse(d.output_agent_matrice || d.outpout_agent_matrice);
                    const scraper = safeParse(d.enrichissement_scraper);

                    return {
                        id: d.id,
                        user_id: d.user_id,
                        created_at: d.created_at,
                        email: session.user.email,
                        probleme: inputs.question_1 || inputs.probleme || inputs.q1 || 'Non défini',
                        vision: inputs.question_2 || inputs.vision || inputs.q2 || 'Non défini',
                        ressources: inputs.question_3 || inputs.ressources || inputs.q3 || 'Non défini',
                        titreDefi: outputAgent.titreDefi || outputAgent.titre || null,
                        contexte_ia: outputAgent.contexteProbleme || outputAgent.contexte || null,
                        questionCle: outputAgent.questionCle || outputAgent.question_cle || null,
                        pistesDeReflexion1: Array.isArray(outputAgent.pistesDeReflexion) ? outputAgent.pistesDeReflexion[0] : (outputAgent.pistes?.[0] || null),
                        pistesDeReflexion2: Array.isArray(outputAgent.pistesDeReflexion) ? outputAgent.pistesDeReflexion[1] : (outputAgent.pistes?.[1] || null),
                        pistesDeReflexion3: Array.isArray(outputAgent.pistesDeReflexion) ? outputAgent.pistesDeReflexion[2] : (outputAgent.pistes?.[2] || null),
                        motsCles: (outputAgent.motsCles || outputAgent.mots_cles || []).join(', '),
                        quadrant: outputMatrice.quadrant_nom || outputMatrice.quadrant || null,
                        score_roi: outputMatrice.score_roi || null,
                        score_complexite: outputMatrice.score_complexite || null,
                        justification: outputMatrice.justification || null,
                        analyse_web: scraper
                    };
                });
                setDefis(mappedDefis);
            }
        }

    } catch (err) {
        console.error("Erreur fetchDefis:", err);
    } finally {
        setIsLoadingDefisList(false);
    }
  }, [session]);

  const fetchMetrics = useCallback(async () => {
    if (!session?.user?.id) return;
    setIsLoadingMetrics(true);
    try {
        // Fetch Agent Metrics
        const { data: agentData, error: agentError } = await supabase
            .from('piloterra_agent_metrics')
            .select('*')
            .eq('auth_user_id', session.user.id)
            .order('created_at', { ascending: false });
        
        if (agentError) throw agentError;
        if (agentData) setMetrics(agentData as AgentMetric[]);

        // Fetch Platform Metrics
        const { data: platformData, error: platformError } = await supabase
            .from('piloterra_platform_metrics')
            .select('*')
            .eq('auth_user_id', session.user.id)
            .order('created_at', { ascending: false });
        
        if (platformError) throw platformError;
        if (platformData) setPlatformMetrics(platformData as PlatformMetric[]);

    } catch (err) {
        console.error("Erreur fetchMetrics:", err);
    } finally {
        setIsLoadingMetrics(false);
    }
  }, [session]);

  useEffect(() => {
    fetchProfileData();
    fetchAllDefis();
  }, [fetchProfileData, fetchAllDefis]);

  useEffect(() => {
    if (activeTab === 'stats') {
        fetchMetrics();
    }
  }, [activeTab, fetchMetrics]);

  // Aggregate Metrics Data
  const stats = useMemo(() => {
    const agentStats = metrics.reduce((acc, curr) => ({
        conversations: acc.conversations + 1,
        tokens: acc.tokens + (curr.total_tokens || 0),
        cost: acc.cost + (curr.total_cost_usd || 0),
        latency: acc.latency + (curr.latency_s || 0),
        co2: acc.co2 + (curr.emissions_gco2eq || 0),
        water: acc.water + (curr.equivalence_water_liters || 0),
        car: acc.car + (curr.equivalence_car_km || 0),
        tgv: acc.tgv + (curr.equivalence_tgv_km || 0),
        smartphone: acc.smartphone + (curr.equivalence_smartphone || 0)
    }), {
        conversations: 0,
        tokens: 0,
        cost: 0,
        latency: 0,
        co2: 0,
        water: 0,
        car: 0,
        tgv: 0,
        smartphone: 0
    });

    const platformStats = platformMetrics.reduce((acc, curr) => ({
        co2: acc.co2 + (curr.co2_grams || 0),
        bytes: acc.bytes + (curr.bytes_transferred || 0),
        views: acc.views + 1
    }), {
        co2: 0,
        bytes: 0,
        views: 0
    });

    // Facteurs de conversion pour l'impact plateforme (estimations basées sur les ratios des agents si possible)
    // On peut aussi utiliser des constantes standards si on veut être précis
    const totalCo2 = agentStats.co2 + platformStats.co2;
    
    // Calcul des équivalences globales basées sur le CO2 total et le fichier des équivalents
    // Facteurs en g CO2e par unité (kg CO2e * 1000)
    const factors = {
        water: 0.132,      // Eau du robinet: 0.000132 kg/L
        car: 217.6,        // Voiture thermique: 0.2176 kg/km
        ble: 1226.2635,    // Blé: 1.2262635 kg/kg
        boeuf: 28009.17,   // Boeuf: 28.00917 kg/kg
        vin: 1268.63       // Vin: 1.26863 kg/L
    };
    
    return {
        ...agentStats,
        platformCo2: platformStats.co2,
        platformBytes: platformStats.bytes,
        platformViews: platformStats.views,
        totalCo2: totalCo2,
        // Calcul des équivalences basées sur le CO2 total
        water: totalCo2 / factors.water,
        car: totalCo2 / factors.car,
        ble: totalCo2 / factors.ble,
        boeuf: totalCo2 / factors.boeuf,
        vin: totalCo2 / factors.vin
    };
  }, [metrics, platformMetrics]);

  const avgLatency = stats.conversations > 0 ? (stats.latency / stats.conversations).toFixed(2) : 0;

  const favTools = useMemo(() => tools.filter(t => favoriteToolIds.includes(t.id)).filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase())), [favoriteToolIds, searchQuery, tools]);
  const favUseCases = useMemo(() => useCases.filter(uc => favoriteUseCaseIds.includes(uc.id)).filter(uc => uc.title.toLowerCase().includes(searchQuery.toLowerCase())), [favoriteUseCaseIds, searchQuery, useCases]);
  const favNews = useMemo(() => news.filter(n => favoriteNewsIds.includes(n.id)).filter(n => n.title.toLowerCase().includes(searchQuery.toLowerCase())), [favoriteNewsIds, searchQuery, news]);
  const favResources = useMemo(() => resources.filter(r => favoriteResourceIds.includes(r.id)).filter(r => r.title.toLowerCase().includes(searchQuery.toLowerCase())), [favoriteResourceIds, searchQuery, resources]);
  const favData = useMemo(() => dataItems.filter(d => favoriteDataIds.includes(d.id)).filter(d => d.title.toLowerCase().includes(searchQuery.toLowerCase())), [favoriteDataIds, searchQuery, dataItems]);
  const favAgents = useMemo(() => agents.filter(a => favoriteAgentIds.includes(a.id)).filter(a => a.name.toLowerCase().includes(searchQuery.toLowerCase())), [favoriteAgentIds, searchQuery, agents]);

  const filteredDefis = useMemo(() => defis.filter(d => {
      const searchLower = searchQuery.toLowerCase();
      const title = d.titreDefi || '';
      const pb = d.probleme || '';
      return title.toLowerCase().includes(searchLower) || pb.toLowerCase().includes(searchLower);
  }), [defis, searchQuery]);

  const tabButtonClass = (tabName: string, color: string) => `
    flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap
    ${activeTab === tabName 
      ? `bg-white text-${color}-700 shadow-sm border border-slate-100` 
      : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}
  `;

  const renderScraperData = (data: any) => {
    if (!data) return null;
    return (
        <div className="space-y-6">
            {data.resume_activite && (
                <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-1"><Building2 className="w-3 h-3" /> Activité</h4>
                    <div className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100 leading-relaxed">
                      {renderMarkdown(data.resume_activite)}
                    </div>
                </div>
            )}
        </div>
    );
  };

  const handleLogout = async () => { await supabase.auth.signOut(); };

  const handleDeleteDefi = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation(); // Éviter d'ouvrir la modale
    
    console.log("Demande de confirmation de suppression pour le défi:", id);
    setConfirmDeleteId(id);
  };

  const executeDeleteDefi = async () => {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    
    try {
      const { error, count } = await supabase
        .from('diagnostics')
        .delete({ count: 'exact' })
        .eq('id', id);
      
      if (error) {
        console.error("Détails erreur suppression:", error);
        throw error;
      }
      
      console.log("Nombre de lignes supprimées:", count);
      
      if (count === 0) {
        throw new Error("Aucune donnée supprimée. Vérifiez vos permissions RLS.");
      }
      
      // Update UI
      setDefis(prev => prev.filter(d => d.id !== id));
      if (lastDefi?.id === id) setLastDefi(null);
      if (selectedDefi?.id === id) setSelectedDefi(null);
      
      setNotification({ message: "Défi supprimé avec succès.", type: 'success' });
      sendEvent('delete_defi', 'Dashboard', id);
    } catch (err: any) {
      console.error("Erreur suppression défi:", err);
      setNotification({ message: "Erreur lors de la suppression : " + (err.message || "Problème de permissions"), type: 'alert' });
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const handleStartEdit = (e: React.MouseEvent, defi: DefiView) => {
    e.stopPropagation();
    setEditingDefiId(defi.id);
    setEditTitleValue(defi.titreDefi || defi.probleme || '');
  };

  const handleSaveTitle = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      const { data: current, error: fetchError } = await supabase
        .from('diagnostics')
        .select('*')
        .eq('id', id)
        .single();
        
      if (fetchError) {
        console.error("Erreur fetch handleSaveTitle:", fetchError);
        throw fetchError;
      }
      
      // Determine which column to update (prefer output_agent_defi based on initial error hint)
      const currentOutput = safeParse(current.output_agent_defi || current.out_agent_defi);
      const updatedOutput = { ...currentOutput, titreDefi: editTitleValue };
      
      const updatePayload: any = {};
      if (Object.keys(current).includes('output_agent_defi')) {
        updatePayload.output_agent_defi = updatedOutput;
      } else if (Object.keys(current).includes('out_agent_defi')) {
        updatePayload.out_agent_defi = updatedOutput;
      } else {
        // Fallback default
        updatePayload.output_agent_defi = updatedOutput;
      }

      const { error: updateError } = await supabase
        .from('diagnostics')
        .update(updatePayload)
        .eq('id', id);
      
      if (updateError) {
        console.error("Erreur update handleSaveTitle:", updateError);
        throw updateError;
      }
      
      setDefis(prev => prev.map(d => d.id === id ? { ...d, titreDefi: editTitleValue } : d));
      if (lastDefi?.id === id) setLastDefi(prev => prev ? { ...prev, titreDefi: editTitleValue } : null);
      if (selectedDefi?.id === id) setSelectedDefi(prev => prev ? { ...prev, titreDefi: editTitleValue } : null);
      
      setEditingDefiId(null);
      setNotification({ message: "Titre mis à jour avec succès.", type: 'success' });
      sendEvent('update_defi_title', 'Dashboard', id);
    } catch (err: any) {
      console.error("Erreur mise à jour titre:", err);
      setNotification({ message: "Erreur lors de la mise à jour du titre : " + (err.message || "Erreur inconnue"), type: 'alert' });
    }
  };

  const greeting = displayName || session?.user?.email || 'Utilisateur';

  const getScoreColor = (score: number) => {
      if (score < 40) return 'text-red-500';
      if (score < 70) return 'text-yellow-500';
      return 'text-succes-500';
  };

  return (
    <div className="min-h-screen bg-slate-50 relative">
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-lg uppercase">
                {greeting.charAt(0)}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Bonjour, {greeting}</h1>
                <p className="text-slate-500">Espace Membre PiloTerra</p>
              </div>
            </div>
            <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
              <LogOut className="w-4 h-4" /> Se déconnecter
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* SESSION DE FORMATION — rejoindre / rappel de contexte */}
        <RejoindreSession session={session} />

        {/* TOP SECTION: ASSESSMENT & LAST DEFI */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
          {/* Left Column: Assessment (2/3) */}
          <div className="lg:col-span-2 space-y-6">
            
            {assessment ? (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                 <div className="bg-gradient-to-r from-emerald-900 to-slate-900 p-6 text-white relative">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl"></div>
                    <div className="relative z-10 flex justify-between items-start">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <Award className="w-5 h-5 text-yellow-400" />
                                <span className="text-emerald-300 text-sm font-bold uppercase tracking-wider">Votre Profil Maturité</span>
                            </div>
                            <h3 className="text-2xl font-black">{assessment.profil_titre}</h3>
                        </div>
                        <div className="text-right">
                            <span className={`text-4xl font-black ${getScoreColor(assessment.score_maturite)}`}>{assessment.score_maturite}</span>
                            <span className="block text-[10px] text-slate-400 uppercase font-bold">Score / 100</span>
                        </div>
                    </div>
                 </div>
                 <div className="p-6">
                    <p className="text-slate-600 text-sm mb-6 leading-relaxed">
                        {assessment.profil_description}
                    </p>
                    
                    <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 flex items-start gap-3 mb-6">
                        <TrendingUp className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                            <h4 className="text-sm font-bold text-emerald-900 mb-1">Priorité d'action</h4>
                            <p className="text-sm text-emerald-800/80">{assessment.top_priorite}</p>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <button 
                            onClick={() => onNavigate('assessment')}
                            className="text-xs font-bold text-slate-400 hover:text-emerald-600 transition-colors flex items-center gap-1"
                        >
                            <RefreshCw className="w-3 h-3" /> Repasser le test
                        </button>
                    </div>
                 </div>
              </div>
            ) : (
              <div className="bg-gradient-to-r from-emerald-900 to-slate-900 rounded-2xl p-6 shadow-lg text-white relative overflow-hidden">
                 <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
                 <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div>
                        <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                           <Target className="w-6 h-6 text-emerald-400" /> Test de Maturité IA
                        </h3>
                        <p className="text-emerald-100 text-sm max-w-md">Évaluez votre niveau de maturité numérique et recevez des recommandations personnalisées instantanément.</p>
                    </div>
                    <button onClick={() => onNavigate('assessment')} className="whitespace-nowrap px-6 py-3 bg-white text-emerald-900 font-bold rounded-xl hover:bg-emerald-50 transition-colors shadow-lg flex items-center gap-2">
                      Passer le test <ArrowRight className="w-4 h-4" />
                    </button>
                 </div>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 relative overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                   <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                     <LayoutDashboard className="w-5 h-5 text-pilo-green" />
                     Dernier Défi IA Généré
                   </h3>
                   <button onClick={() => { 
                       handleTabChange('defis'); 
                       fetchAllDefis(); 
                       document.getElementById('favorites-section')?.scrollIntoView({ behavior: 'smooth' });
                   }} className="text-xs font-bold text-emerald-600 hover:underline flex items-center gap-1">
                     Voir tous mes défis <ArrowRight className="w-3 h-3" />
                   </button>
                </div>

                {lastDefi ? (
                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                    <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                       <h4 className="font-bold text-emerald-900 mb-1 line-clamp-1">
                         {lastDefi.titreDefi || "Analyse en cours..."}
                       </h4>
                       <p className="text-emerald-700/80 text-xs mb-3 flex items-center gap-1">
                         <Calendar className="w-3 h-3" />
                         Soumis le {new Date(lastDefi.created_at).toLocaleDateString()}
                       </p>
                       
                       {!lastDefi.titreDefi && (
                          <div className="text-sm text-slate-600 italic mb-2 bg-white p-2 rounded border border-emerald-100 line-clamp-2">
                             "{lastDefi.probleme}"
                          </div>
                       )}

                       {lastDefi.quadrant ? (
                         <div className="flex items-center flex-wrap gap-2">
                           <span className="px-2 py-1 bg-white rounded-lg text-[10px] font-bold text-emerald-800 border border-emerald-200 shadow-sm">
                             {lastDefi.quadrant}
                           </span>
                           {lastDefi.score_roi && (
                            <span className="px-2 py-1 bg-white rounded-lg text-[10px] font-bold text-slate-600 border border-slate-200 shadow-sm">
                                ROI: {lastDefi.score_roi}/100
                            </span>
                           )}
                           {lastDefi.score_complexite && (
                            <span className="px-2 py-1 bg-white rounded-lg text-[10px] font-bold text-slate-600 border border-slate-200 shadow-sm">
                                Complexité: {lastDefi.score_complexite}/100
                            </span>
                           )}
                         </div>
                       ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-50 text-yellow-700 text-[10px] font-bold rounded border border-yellow-100">
                             <Sparkles className="w-3 h-3 animate-spin" /> Génération IA en cours...
                          </span>
                       )}
                    </div>
                    <div className="text-center">
                       <button onClick={() => setSelectedDefi(lastDefi)} className="w-full py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-lg text-sm hover:bg-slate-50 transition-colors">
                         Voir les détails complets
                       </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                       <Zap className="w-6 h-6 text-slate-300" />
                    </div>
                    <p className="text-slate-500 text-sm mb-4">Vous n'avez pas encore lancé de défi IA.</p>
                    <button onClick={() => onNavigate('defi-ia')} className="px-4 py-2 bg-pilo-green text-white font-bold rounded-lg text-sm hover:bg-emerald-800 transition-colors">
                      Créer mon premier défi
                    </button>
                    {isLoadingDefi && <p className="text-xs text-slate-400 mt-2 animate-pulse">Recherche en cours...</p>}
                  </div>
                )}
            </div>
          </div>

          {/* Right Column: Profile & Support (1/3) */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
               <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><User className="w-5 h-5 text-slate-500" /> Profil</h3>
               <button onClick={() => onNavigate('profile')} className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 rounded transition-colors font-medium">Modifier mes informations</button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
               <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2"><LifeBuoy className="w-5 h-5 text-slate-500" /> Support</h3>
               <p className="text-xs text-slate-500 mb-4">Un problème technique ou une question ? Notre équipe est là pour vous.</p>
               <button 
                 onClick={onOpenSupport}
                 className="block w-full text-center px-4 py-2 text-sm text-slate-600 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 rounded transition-colors font-medium"
               >
                 Ouvrir un ticket
               </button>
            </div>
          </div>
        </div>

        {/* BOTTOM SECTION: FAVORITES & RESOURCES */}
        <div id="favorites-section" className="mt-16">
            <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 mb-2 flex items-center gap-3"><Heart className="w-8 h-8 text-red-500 fill-red-500" /> Mes Favoris & Ressources</h2>
                    <p className="text-slate-600">Retrouvez toutes vos sélections personnalisées et vos défis IA.</p>
                </div>
                
                <div className="relative flex-grow max-w-md">
                   <Search className="absolute left-4 top-3 h-5 w-5 text-slate-400" />
                   <input type="text" placeholder="Rechercher dans mes favoris..." className="w-full pl-12 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/20" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-8 p-1.5 bg-slate-100 rounded-2xl overflow-x-auto max-w-full">
                <button onClick={() => handleTabChange('tools')} className={tabButtonClass('tools', 'emerald')}><Zap className="w-4 h-4" /> Outils ({favoriteToolIds.length})</button>
                <button onClick={() => handleTabChange('agents')} className={tabButtonClass('agents', 'emerald')}><Bot className="w-4 h-4" /> Agents ({favoriteAgentIds.length})</button>
                <button onClick={() => handleTabChange('usecases')} className={tabButtonClass('usecases', 'emerald')}><FileText className="w-4 h-4" /> Cas d'usage ({favoriteUseCaseIds.length})</button>
                <button onClick={() => handleTabChange('data')} className={tabButtonClass('data', 'emerald')}><Database className="w-4 h-4" /> Données ({favoriteDataIds.length})</button>
                <button onClick={() => handleTabChange('news')} className={tabButtonClass('news', 'emerald')}><Newspaper className="w-4 h-4" /> Actualités ({favoriteNewsIds.length})</button>
                <button onClick={() => handleTabChange('resources')} className={tabButtonClass('resources', 'emerald')}><GraduationCap className="w-4 h-4" /> Formation ({favoriteResourceIds.length})</button>
                <button onClick={() => handleTabChange('prompts')} className={tabButtonClass('prompts', 'emerald')}><Library className="w-4 h-4" /> Prompts ({favPrompts.length})</button>
                <button onClick={() => handleTabChange('defis')} className={tabButtonClass('defis', 'emerald')}><LayoutDashboard className="w-4 h-4" /> Mes Défis ({defis.length})</button>
                <button onClick={() => handleTabChange('stats')} className={tabButtonClass('stats', 'emerald')}><Leaf className="w-4 h-4" /> Mon Impact</button>
            </div>

            <div className="min-h-[400px]">
                {activeTab === 'prompts' && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {favPrompts.length === 0 ? (
                      <div className="text-center py-16">
                        <Library className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                        <p className="text-slate-500 font-medium">Aucun prompt en favori pour l'instant.</p>
                        <p className="text-slate-400 text-sm mt-1">Ajoutez des prompts en favori depuis la bibliothèque de votre organisation.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {favPrompts.filter(p => `${p.title} ${p.description ?? ''} ${p.content}`.toLowerCase().includes(searchQuery.toLowerCase())).map((p) => {
                          const frug = FRUGALITY_META[p.frugality_level] || FRUGALITY_META[2];
                          return (
                            <div key={p.id} onClick={() => openPromptReader(p)}
                              className="group cursor-pointer flex flex-col bg-white rounded-2xl border border-slate-100 shadow-sm p-5 transition-all hover:shadow-xl hover:-translate-y-1">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${frug.badge}`}><Leaf className="w-3 h-3" />{frug.label}</span>
                                <button onClick={(e) => { e.stopPropagation(); removeFavPrompt(p.id); }} title="Retirer des favoris"
                                  className="p-1 rounded-full text-rose-500 hover:bg-rose-50 transition-colors"><Heart className="w-4 h-4 fill-rose-500" /></button>
                              </div>
                              <h3 className="font-black text-slate-900 mb-1 group-hover:text-emerald-700">{p.title}</h3>
                              {p.description && <p className="text-sm text-slate-500 line-clamp-2 mb-3">{p.description}</p>}
                              <div className="mt-auto flex items-center justify-between">
                                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{toolLabel(p.target_tool)}</span>
                                <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Copy className="w-3 h-3" />{p.usage_count}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                {/* --- STATS DASHBOARD --- */}
                {activeTab === 'stats' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* HEADER IMPACT */}
                        <div className="bg-white rounded-3xl p-10 border border-slate-100 shadow-sm text-center mb-8 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-50 rounded-full blur-3xl -mr-32 -mt-32"></div>
                            <div className="relative z-10">
                                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Impact Environnemental Total</h3>
                                <div className="text-7xl font-black text-emerald-500 mb-2 tracking-tighter">
                                    {stats.totalCo2.toFixed(2)} <span className="text-2xl font-bold text-emerald-300">g CO₂eq</span>
                                </div>
                                <p className="text-slate-400 text-sm">Impact cumulé : Agents IA ({stats.co2.toFixed(2)}g) + Plateforme ({stats.platformCo2.toFixed(2)}g)</p>
                            </div>
                        </div>

                        {/* KPIS GRID */}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 mb-12">
                            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center text-center">
                                <div className="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 mb-3">
                                    <MessageSquare className="w-5 h-5" />
                                </div>
                                <div className="text-2xl font-black text-slate-900">{stats.conversations}</div>
                                <div className="text-xs font-bold text-slate-400">Conversations</div>
                            </div>
                            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center text-center">
                                <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 mb-3">
                                    <Zap className="w-5 h-5" />
                                </div>
                                <div className="text-2xl font-black text-slate-900">{(stats.tokens / 1000).toFixed(2)}k</div>
                                <div className="text-xs font-bold text-slate-400">Tokens</div>
                            </div>
                            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center text-center">
                                <div className="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 mb-3">
                                    <Globe className="w-5 h-5" />
                                </div>
                                <div className="text-2xl font-black text-slate-900">{stats.platformViews}</div>
                                <div className="text-xs font-bold text-slate-400">Pages vues</div>
                            </div>
                            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center text-center">
                                <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 mb-3">
                                    <Database className="w-5 h-5" />
                                </div>
                                <div className="text-2xl font-black text-slate-900">{(stats.platformBytes / (1024 * 1024)).toFixed(2)} MB</div>
                                <div className="text-xs font-bold text-slate-400">Données</div>
                            </div>
                            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center text-center">
                                <div className="w-10 h-10 bg-amber-50 rounded-full flex items-center justify-center text-amber-600 mb-3">
                                    <span className="font-bold">$</span>
                                </div>
                                <div className="text-2xl font-black text-slate-900">{stats.cost.toFixed(2)}</div>
                                <div className="text-xs font-bold text-slate-400">Coût (USD)</div>
                            </div>
                            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center text-center">
                                <div className="w-10 h-10 bg-orange-50 rounded-full flex items-center justify-center text-orange-600 mb-3">
                                    <Clock className="w-5 h-5" />
                                </div>
                                <div className="text-2xl font-black text-slate-900">{avgLatency}s</div>
                                <div className="text-xs font-bold text-slate-400">Latence moy.</div>
                            </div>
                        </div>

                        {/* EQUIVALENCES SECTION */}
                        <div className="mb-6">
                            <h3 className="text-lg font-bold text-slate-900">Équivalences Écologiques</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                            <div className="bg-white p-6 rounded-2xl border border-cyan-100 shadow-sm flex flex-col items-center text-center hover:border-cyan-300 transition-colors">
                                <div className="w-12 h-12 bg-cyan-50 rounded-full flex items-center justify-center text-cyan-500 mb-4">
                                    <Droplets className="w-6 h-6" />
                                </div>
                                <div className="text-3xl font-black text-slate-900 mb-1">{stats.water.toFixed(2)}</div>
                                <div className="text-sm font-bold text-slate-400 mb-2">L</div>
                                <div className="text-xs font-bold text-slate-900">Eau du robinet</div>
                                <div className="text-[10px] text-slate-400 mt-1">Équivalent en litres d'eau</div>
                            </div>

                            <div className="bg-white p-6 rounded-2xl border border-red-100 shadow-sm flex flex-col items-center text-center hover:border-red-300 transition-colors">
                                <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-red-500 mb-4">
                                    <Car className="w-6 h-6" />
                                </div>
                                <div className="text-3xl font-black text-slate-900 mb-1">{stats.car.toFixed(2)}</div>
                                <div className="text-sm font-bold text-slate-400 mb-2">km</div>
                                <div className="text-xs font-bold text-slate-900">km en voiture</div>
                                <div className="text-[10px] text-slate-400 mt-1">Distance parcourue en voiture</div>
                            </div>

                            <div className="bg-white p-6 rounded-2xl border border-amber-100 shadow-sm flex flex-col items-center text-center hover:border-amber-300 transition-colors">
                                <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center text-amber-500 mb-4">
                                    <Wheat className="w-6 h-6" />
                                </div>
                                <div className="text-3xl font-black text-slate-900 mb-1">{stats.ble.toFixed(2)}</div>
                                <div className="text-sm font-bold text-slate-400 mb-2">kg</div>
                                <div className="text-xs font-bold text-slate-900">Blé</div>
                                <div className="text-[10px] text-slate-400 mt-1">Équivalent en kg de blé</div>
                            </div>

                            <div className="bg-white p-6 rounded-2xl border border-orange-100 shadow-sm flex flex-col items-center text-center hover:border-orange-300 transition-colors">
                                <div className="w-12 h-12 bg-orange-50 rounded-full flex items-center justify-center text-orange-500 mb-4">
                                    <Beef className="w-6 h-6" />
                                </div>
                                <div className="text-3xl font-black text-slate-900 mb-1">{stats.boeuf.toFixed(2)}</div>
                                <div className="text-sm font-bold text-slate-400 mb-2">kg</div>
                                <div className="text-xs font-bold text-slate-900">Boeuf</div>
                                <div className="text-[10px] text-slate-400 mt-1">Équivalent en kg de boeuf</div>
                            </div>

                            <div className="bg-white p-6 rounded-2xl border border-purple-100 shadow-sm flex flex-col items-center text-center hover:border-purple-300 transition-colors">
                                <div className="w-12 h-12 bg-purple-50 rounded-full flex items-center justify-center text-purple-500 mb-4">
                                    <Wine className="w-6 h-6" />
                                </div>
                                <div className="text-3xl font-black text-slate-900 mb-1">{stats.vin.toFixed(2)}</div>
                                <div className="text-sm font-bold text-slate-400 mb-2">L</div>
                                <div className="text-xs font-bold text-slate-900">Vin</div>
                                <div className="text-[10px] text-slate-400 mt-1">Équivalent en litres de vin</div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'tools' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                     {favTools.length > 0 ? favTools.map(t => <ToolCard key={t.id} tool={t} isLoggedIn={true} isFavorite={true} onToggleFavorite={onToggleToolFavorite} />) : <p className="col-span-full text-center text-slate-400 italic py-10">Aucun outil favori pour le moment.</p>}
                  </div>
                )}

                {activeTab === 'agents' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                     {favAgents.length > 0 ? favAgents.map(agent => (
                        <article key={agent.id} className="group bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col h-full relative hover:shadow-xl hover:-translate-y-1 transition-all">
                            <div className="h-40 bg-slate-50 relative overflow-hidden flex items-center justify-center p-4 border-b border-slate-100">
                                {agent.imageUrl ? (
                                    <img 
                                    src={agent.imageUrl} 
                                    alt={agent.name} 
                                    className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-500"
                                    onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&q=80"; }} 
                                    />
                                ) : (
                                    <Bot className="w-16 h-16 text-emerald-200" />
                                )}
                                {onToggleAgentFavorite && (
                                    <button onClick={() => onToggleAgentFavorite(agent.id)} className="absolute top-3 right-3 p-2 rounded-full bg-red-50 text-red-500 shadow-sm z-20"><Heart className="w-4 h-4 fill-current" /></button>
                                )}
                            </div>
                            <div className="p-6 flex flex-col flex-grow">
                                <h3 className="text-lg font-bold text-slate-900 mb-2 group-hover:text-emerald-600 transition-colors leading-tight">{agent.name}</h3>
                                <p className="text-slate-500 text-sm mb-4 line-clamp-3 leading-relaxed flex-grow">{agent.description}</p>
                                <a href={agent.link} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all text-sm mt-auto shadow-sm">
                                    Accéder à l'agent IA <ExternalLink className="w-4 h-4" />
                                </a>
                            </div>
                        </article>
                     )) : <p className="col-span-full text-center text-slate-400 italic py-10">Aucun agent IA favori pour le moment.</p>}
                  </div>
                )}
                
                {activeTab === 'usecases' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {favUseCases.length > 0 ? favUseCases.map(uc => (
                      <div key={uc.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col h-full relative group hover:shadow-lg transition-shadow">
                        <button onClick={() => onToggleUseCaseFavorite && onToggleUseCaseFavorite(uc.id)} className="absolute top-4 right-4 text-red-500 p-2"><Heart className="w-5 h-5 fill-current" /></button>
                        <h3 className="text-lg font-bold text-slate-900 mb-3 group-hover:text-emerald-600 transition-colors">{uc.title}</h3>
                        <p className="text-slate-600 text-sm mb-6 line-clamp-3">{uc.description}</p>
                        <button onClick={() => onNavigate('usecases')} className="mt-auto text-sm font-bold text-emerald-600 hover:underline">Voir le détail</button>
                      </div>
                    )) : <p className="col-span-full text-center text-slate-400 italic py-10">Aucun cas d'usage favori pour le moment.</p>}
                  </div>
                )}

                {activeTab === 'data' && (
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                      {favData.length > 0 ? favData.map(item => (
                         <article key={item.id} className="group bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col h-full relative">
                            <div className="h-40 bg-slate-100 relative overflow-hidden flex items-center justify-center p-4">
                                {item.imageUrl ? (
                                    <img src={item.imageUrl} alt={item.title} className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-500" onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80"; }} />
                                ) : (
                                    <Database className="w-16 h-16 text-slate-300" />
                                )}
                                <button onClick={() => onToggleDataFavorite && onToggleDataFavorite(item.id)} className="absolute top-3 right-3 p-2 rounded-full bg-white/80 hover:bg-white text-red-500 shadow-sm z-20"><Heart className="w-4 h-4 fill-current" /></button>
                            </div>
                            <div className="p-6 flex flex-col flex-grow">
                                <h3 className="text-lg font-bold text-slate-900 mb-2 group-hover:text-emerald-600 transition-colors leading-tight">{item.title}</h3>
                                <p className="text-slate-500 text-sm mb-4 line-clamp-3 leading-relaxed flex-grow">{item.description}</p>
                                <a href={item.sourceLink} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all text-sm mt-auto shadow-sm">
                                    Accéder aux données <ExternalLink className="w-4 h-4" />
                                </a>
                            </div>
                         </article>
                      )) : <p className="col-span-full text-center text-slate-400 italic py-10">Aucune donnée favorite.</p>}
                   </div>
                )}

                {activeTab === 'news' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {favNews.length > 0 ? favNews.map(newsItem => (
                       <article key={newsItem.id} className="group bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm flex flex-col h-full relative">
                          <div className="relative h-48 overflow-hidden w-full">
                            <img src={newsItem.imageUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt={newsItem.title} onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?auto=format&fit=crop&q=80"; }} />
                            <button onClick={() => onToggleNewsFavorite && onToggleNewsFavorite(newsItem.id)} className="absolute top-3 right-3 p-2 rounded-full bg-white/80 hover:bg-white text-red-500 shadow-sm z-20"><Heart className="w-4 h-4 fill-current" /></button>
                          </div>
                          <div className="p-6 flex flex-col flex-grow">
                            <div className="flex items-center gap-2 text-slate-400 text-[10px] mb-3 font-bold uppercase"><Calendar className="w-3 h-3" /> {new Date(newsItem.date).toLocaleDateString()}</div>
                            <h3 className="text-lg font-bold text-slate-900 mb-3 group-hover:text-emerald-600 transition-colors leading-tight line-clamp-2">{newsItem.title}</h3>
                            <a href={newsItem.sourceLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-emerald-600 font-bold text-xs hover:underline mt-auto pt-4 border-t border-slate-50">Lire l'article <ExternalLink className="w-3 h-3" /></a>
                          </div>
                       </article>
                    )) : <p className="col-span-full text-center text-slate-400 italic py-10">Aucune actualité favorite.</p>}
                  </div>
                )}

                {activeTab === 'resources' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {favResources.length > 0 ? favResources.map(resource => (
                       <div key={resource.id} className="group bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col h-full overflow-hidden relative">
                          <div className="h-48 relative overflow-hidden bg-slate-100">
                             <img src={resource.imageUrl} alt={resource.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?auto=format&fit=crop&q=80"; }} />
                             <button onClick={() => onToggleResourceFavorite && onToggleResourceFavorite(resource.id)} className="absolute top-3 right-3 p-2 rounded-full bg-white/80 hover:bg-white text-red-500 shadow-sm z-20"><Heart className="w-4 h-4 fill-current" /></button>
                          </div>
                          <div className="p-6 flex flex-col flex-grow">
                             <h3 className="text-lg font-bold text-slate-900 mb-3 group-hover:text-emerald-600 transition-colors leading-tight line-clamp-2">{resource.title}</h3>
                             <a href={resource.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-emerald-600 font-bold text-xs hover:underline mt-auto pt-4 border-t border-slate-50">Accéder à la formation <ExternalLink className="w-3 h-3" /></a>
                          </div>
                       </div>
                    )) : <p className="col-span-full text-center text-slate-400 italic py-10">Aucune formation favorite.</p>}
                  </div>
                )}

                {activeTab === 'defis' && (
                  <div className="space-y-4">
                     <div className="flex justify-end">
                        <button 
                          onClick={fetchAllDefis} 
                          disabled={isLoadingDefisList}
                          className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-emerald-600 transition-colors"
                        >
                          <RefreshCw className={`w-4 h-4 ${isLoadingDefisList ? 'animate-spin' : ''}`} />
                          Actualiser mes défis
                        </button>
                     </div>

                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                       {isLoadingDefisList && defis.length === 0 ? (
                          <div className="col-span-full flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div></div>
                       ) : filteredDefis.length > 0 ? (
                          <>
                            <div onClick={() => onNavigate('defi-ia')} className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/50 transition-all group min-h-[250px]">
                               <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm group-hover:scale-110 transition-transform"><Zap className="w-6 h-6 text-slate-400 group-hover:text-emerald-500" /></div>
                               <h3 className="font-bold text-slate-700 mb-1">Nouveau Défi</h3>
                               <p className="text-xs text-slate-400">Lancer une nouvelle analyse IA</p>
                            </div>

                            {filteredDefis.map(defi => (
                              <div key={defi.id} onClick={() => setSelectedDefi(defi)} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer relative group flex flex-col min-h-[250px]">
                                
                                {/* Actions Overlay */}
                                <div 
                                  className="absolute top-3 right-3 flex gap-2 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity z-30" 
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {editingDefiId === defi.id ? (
                                    <>
                                      <button 
                                        type="button"
                                        onClick={(e) => { e.preventDefault(); handleSaveTitle(e, defi.id); }}
                                        className="p-2 bg-emerald-500 text-white rounded-full shadow-lg hover:bg-emerald-600 transition-colors cursor-pointer"
                                        title="Sauvegarder"
                                      >
                                        <Save className="w-4 h-4" />
                                      </button>
                                      <button 
                                        type="button"
                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingDefiId(null); }}
                                        className="p-2 bg-slate-200 text-slate-600 rounded-full shadow-lg hover:bg-slate-300 transition-colors cursor-pointer"
                                        title="Annuler"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button 
                                        type="button"
                                        onClick={(e) => { e.preventDefault(); handleStartEdit(e, defi); }}
                                        className="p-2 bg-white text-slate-500 rounded-full shadow-lg hover:text-emerald-600 border border-slate-100 transition-colors cursor-pointer"
                                        title="Modifier le titre"
                                      >
                                        <Edit3 className="w-4 h-4" />
                                      </button>
                                      <button 
                                        type="button"
                                        onClick={(e) => { e.preventDefault(); handleDeleteDefi(e, defi.id); }}
                                        className="p-2 bg-white text-slate-500 rounded-full shadow-lg hover:text-red-500 border border-slate-100 transition-colors cursor-pointer"
                                        title="Supprimer"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </>
                                  )}
                                </div>
                                <div className="flex justify-between items-start mb-4">
                                  <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest"><Calendar className="w-3 h-3" /> {new Date(defi.created_at).toLocaleDateString()}</div>
                                  {defi.quadrant ? (
                                    <div className="flex flex-col items-end gap-1">
                                      <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${defi.quadrant.includes('Gains Rapides') ? 'bg-emerald-100 text-emerald-700' : defi.quadrant.includes('Majeurs') ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>{defi.quadrant}</span>
                                      <div className="flex gap-1">
                                        {defi.score_roi && <span className="px-1.5 py-0.5 bg-slate-50 rounded text-[9px] font-bold text-slate-500 border border-slate-200">ROI: {defi.score_roi}</span>}
                                        {defi.score_complexite && <span className="px-1.5 py-0.5 bg-slate-50 rounded text-[9px] font-bold text-slate-500 border border-slate-200">CPLX: {defi.score_complexite}</span>}
                                      </div>
                                    </div>
                                  ) : (
                                     <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-[10px] font-bold uppercase animate-pulse">Analyse en cours</span>
                                  )}
                                </div>
                                {editingDefiId === defi.id ? (
                                  <div onClick={(e) => e.stopPropagation()} className="mb-3">
                                     <input 
                                       type="text"
                                       value={editTitleValue}
                                       onChange={(e) => setEditTitleValue(e.target.value)}
                                       className="w-full px-3 py-2 bg-slate-50 border border-emerald-500 rounded-lg text-lg font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/20"
                                       autoFocus
                                     />
                                  </div>
                                ) : (
                                  <h3 className="text-lg font-bold text-slate-900 mb-3 line-clamp-2 group-hover:text-emerald-600 transition-colors">{defi.titreDefi || "Analyse IA en cours..."}</h3>
                                )}
                                <p className="text-slate-500 text-sm mb-6 line-clamp-3 flex-grow">{defi.contexte_ia || defi.probleme}</p>
                                <div className="pt-4 border-t border-slate-50 flex items-center justify-between text-xs font-bold text-emerald-600">{defi.titreDefi ? "Voir l'analyse complète" : "Voir ma demande"} <ArrowRight className="w-4 h-4" /></div>
                              </div>
                            ))}
                          </>
                       ) : (
                          <div className="col-span-full text-center py-20">
                             <LayoutDashboard className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                             <h3 className="text-lg font-bold text-slate-700">Aucun défi généré</h3>
                             <p className="text-slate-500 text-sm mb-6">Vous n'avez pas encore utilisé notre générateur de fiche défi IA.</p>
                             <button onClick={() => onNavigate('defi-ia')} className="px-6 py-2 bg-pilo-green text-white rounded-lg font-bold hover:bg-emerald-700">Lancer mon premier défi</button>
                          </div>
                       )}
                     </div>
                  </div>
                )}
            </div>
        </div>
      </div>

      {/* MODALE DETAIL DEFI */}
      {selectedDefi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-200">
             
             {/* ... Modal Header ... */}
             <div className="bg-gradient-to-r from-emerald-900 to-slate-900 p-8 shrink-0 text-white">
                <div className="flex items-start justify-between">
                    <div className="flex-grow mr-4">
                        {editingDefiId === selectedDefi.id ? (
                            <div className="flex gap-2 items-center" onClick={(e) => e.stopPropagation()}>
                                <input 
                                    type="text"
                                    value={editTitleValue}
                                    onChange={(e) => setEditTitleValue(e.target.value)}
                                    className="w-full px-3 py-2 bg-white/10 border border-white/30 rounded-lg text-2xl font-bold text-white outline-none focus:ring-2 focus:ring-white/20"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleSaveTitle(e as any, selectedDefi.id);
                                      if (e.key === 'Escape') setEditingDefiId(null);
                                    }}
                                />
                                <button 
                                  onClick={(e) => { e.preventDefault(); handleSaveTitle(e, selectedDefi.id); }} 
                                  className="p-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
                                  title="Enregistrer"
                                >
                                  <Save className="w-5 h-5"/>
                                </button>
                                <button 
                                  onClick={(e) => { e.preventDefault(); setEditingDefiId(null); }} 
                                  className="p-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
                                  title="Annuler"
                                >
                                  <X className="w-5 h-5"/>
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-start gap-4">
                                <h2 className="text-2xl font-bold mb-0">{selectedDefi.titreDefi || "Détail de votre demande"}</h2>
                                <div className="flex gap-2 shrink-0 mt-1">
                                    <button 
                                        onClick={(e) => { e.preventDefault(); handleStartEdit(e, selectedDefi); }}
                                        className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white/70 hover:text-white"
                                        title="Modifier le titre"
                                    >
                                        <Edit3 className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={(e) => { e.preventDefault(); handleDeleteDefi(e, selectedDefi.id); }}
                                        className="p-1.5 bg-white/10 hover:bg-red-500/50 rounded-lg transition-colors text-white/70 hover:text-white"
                                        title="Supprimer la fiche"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                        <div className="flex flex-wrap gap-2 mt-3">
                            {selectedDefi.motsCles ? (
                                selectedDefi.motsCles.split(',').map((tag, idx) => (<span key={idx} className="flex items-center gap-1 px-2.5 py-1 bg-white/10 rounded-full text-xs font-medium border border-white/20"><Tag className="w-3 h-3" /> {tag.trim()}</span>))
                            ) : (<span className="text-white/60 text-xs italic">Analyse des mots clés en cours...</span>)}
                        </div>
                    </div>
                    <button onClick={() => setSelectedDefi(null)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors shrink-0"><X className="w-5 h-5" /></button>
                </div>
             </div>

             <div className="overflow-y-auto p-8 bg-slate-50">
                {/* 1. CONTEXTE (Placé en premier) */}
                {selectedDefi.contexte_ia && (
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-8">
                        <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100">
                            <Quote className="w-5 h-5 text-indigo-600" /> Contexte
                        </h3>
                        <div className="text-slate-700 text-sm leading-relaxed">
                            {renderMarkdown(selectedDefi.contexte_ia)}
                        </div>
                    </div>
                )}

                {/* 2. GRILLE ORIGINE / ANALYSE */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                        <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800 mb-6 pb-4 border-b border-slate-100"><Target className="w-5 h-5 text-blue-600" /> L'Origine du Défi</h3>
                        <div className="space-y-6">
                            <div><h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Le Problème</h4><div className="text-slate-700 text-sm leading-relaxed">{renderMarkdown(selectedDefi.probleme)}</div></div>
                            <div><h4 className="text-xs font-bold text-slate-400 uppercase mb-2">La Vision</h4><div className="text-slate-700 text-sm leading-relaxed">{renderMarkdown(selectedDefi.vision)}</div></div>
                            <div><h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Les Ressources</h4><div className="text-slate-700 text-sm leading-relaxed">{renderMarkdown(selectedDefi.ressources)}</div></div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                         <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800 mb-6 pb-4 border-b border-slate-100"><BrainCircuit className="w-5 h-5 text-emerald-600" /> Analyse PiloTerra</h3>
                        {selectedDefi.titreDefi ? (
                            <div className="space-y-6">
                                <div className="bg-emerald-50 p-4 rounded-xl border-l-4 border-emerald-500"><h4 className="text-xs font-bold text-emerald-800 uppercase mb-2">La Question Clé</h4><p className="text-emerald-900 font-medium italic">"{selectedDefi.questionCle}"</p></div>
                                <div><h4 className="text-xs font-bold text-slate-400 uppercase mb-3">Pistes de réflexion</h4><ul className="space-y-3">{[selectedDefi.pistesDeReflexion1, selectedDefi.pistesDeReflexion2, selectedDefi.pistesDeReflexion3].filter(Boolean).map((piste, idx) => (<li key={idx} className="flex items-start gap-3 text-sm text-slate-700 bg-slate-50 p-3 rounded-lg"><span className="bg-emerald-200 text-emerald-800 w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold shrink-0">{idx + 1}</span>{renderMarkdown(piste || '')}</li>))}</ul></div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-48 text-center text-slate-400"><Loader2 className="w-8 h-8 mb-2 animate-spin" /><p>L'IA est en train d'analyser la demande...</p></div>
                        )}
                    </div>
                </div>

                {/* 3. MATRICE */}
                {selectedDefi.quadrant && (
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-8">
                        <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800 mb-6 pb-4 border-b border-slate-100"><BarChart2 className="w-5 h-5 text-purple-600" /> Analyse Stratégique</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
                            <div className="space-y-4">
                                <div><div className="flex justify-between text-xs font-bold mb-1"><span className="text-slate-500">Retour sur Investissement (ROI)</span><span className="text-emerald-600">{selectedDefi.score_roi}/100</span></div><div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${selectedDefi.score_roi}%` }}></div></div></div>
                                <div><div className="flex justify-between text-xs font-bold mb-1"><span className="text-slate-500">Complexité de mise en œuvre</span><span className="text-orange-600">{selectedDefi.score_complexite}/100</span></div><div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-orange-500 rounded-full" style={{ width: `${selectedDefi.score_complexite}%` }}></div></div></div>
                            </div>
                            <div className="flex flex-col items-center justify-center p-4 bg-emerald-50 rounded-xl border border-emerald-100 text-center h-full"><span className="text-xs font-bold text-emerald-400 uppercase mb-1">Positionnement</span><span className="text-xl font-black text-emerald-800">{selectedDefi.quadrant}</span></div>
                            <div className="text-sm text-slate-600 italic bg-slate-50 p-4 rounded-xl border-l-4 border-emerald-300">"{selectedDefi.justification}"</div>
                        </div>
                    </div>
                )}

                {/* 4. ANALYSE WEB (Placé en dernier) */}
                {selectedDefi.analyse_web && (
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                        <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800 mb-6 pb-4 border-b border-slate-100">
                            <Globe className="w-5 h-5 text-indigo-600" /> Analyse Web
                        </h3>
                        {renderScraperData(selectedDefi.analyse_web)}
                    </div>
                )}
             </div>

             <div className="p-4 bg-white border-t border-slate-200 flex justify-end shrink-0 z-10">
                <button onClick={() => setSelectedDefi(null)} className="px-6 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg hover:bg-slate-200 transition-colors">Fermer</button>
             </div>
          </div>
        </div>
      )}
      {/* Notification Toast */}
      {notification && (
        <div className={`fixed bottom-6 right-6 z-[100] animate-in fade-in slide-in-from-right-4 duration-300`}>
          <div className={`${notification.type === 'success' ? 'bg-succes-600' : 'bg-red-600'} text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/20`}>
            {notification.type === 'success' ? <Sparkles className="w-5 h-5" /> : <X className="w-5 h-5" />}
            <span className="font-bold">{notification.message}</span>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setConfirmDeleteId(null)}></div>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md relative z-10 overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Supprimer ce défi ?</h3>
              <p className="text-slate-500 mb-8 leading-relaxed">Cette action est irréversible. Toutes les données associées à cette fiche seront définitivemement effacées.</p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Annuler
                </button>
                <button 
                  onClick={executeDeleteDefi}
                  className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
                >
                  Confirmer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {promptReader && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setPromptReader(null)} />
          <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="flex items-start justify-between p-5 border-b border-slate-100">
              <div className="pr-4">
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{toolLabel(promptReader.target_tool)}</span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{promptReader.category}</span>
                </div>
                <h3 className="text-lg font-black text-slate-900">{promptReader.title}</h3>
                {promptReader.description && <p className="mt-1 text-sm text-slate-500">{promptReader.description}</p>}
              </div>
              <button onClick={() => setPromptReader(null)} className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {(promptReader.recommended_model || promptReader.frugality_tip) && (
                <div className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 text-sm text-slate-600">
                  <div className="flex items-center gap-2 mb-1"><Leaf className="w-4 h-4 text-emerald-600" /><span className="font-bold text-emerald-800">Sobriété</span></div>
                  {promptReader.recommended_model && <p><span className="font-bold text-slate-700">Modèle conseillé :</span> {promptReader.recommended_model}</p>}
                  {promptReader.frugality_tip && <p className="mt-1">{promptReader.frugality_tip}</p>}
                </div>
              )}
              {promptReader.variables.length > 0 && (
                <div className="mb-4 space-y-3">
                  <h4 className="text-sm font-bold text-slate-800">Complétez pour personnaliser</h4>
                  {promptReader.variables.map((v: any) => (
                    <div key={v.key}>
                      <label className="block text-sm font-medium text-slate-700 mb-1">{v.label}{v.required && <span className="ml-0.5 text-rose-500">*</span>}</label>
                      {v.type === 'textarea' ? (
                        <textarea rows={3} value={promptVars[v.key] ?? ''} placeholder={v.placeholder} onChange={(e) => setPromptVars((prev) => ({ ...prev, [v.key]: e.target.value }))}
                          className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                      ) : v.type === 'select' ? (
                        <select value={promptVars[v.key] ?? ''} onChange={(e) => setPromptVars((prev) => ({ ...prev, [v.key]: e.target.value }))}
                          className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100">
                          <option value="">— Choisir —</option>
                          {(v.options ?? []).map((o: string) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input value={promptVars[v.key] ?? ''} placeholder={v.placeholder} onChange={(e) => setPromptVars((prev) => ({ ...prev, [v.key]: e.target.value }))}
                          className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                      )}
                    </div>
                  ))}
                </div>
              )}
              <h4 className="text-sm font-bold text-slate-800 mb-2">Aperçu du prompt</h4>
              <pre className="whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 font-sans">{fillTemplate(promptReader.content, promptVars)}</pre>
            </div>
            <div className="p-4 border-t border-slate-100">
              <button onClick={copyReaderPrompt} className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 transition-colors">
                {promptCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}{promptCopied ? 'Copié !' : 'Copier le prompt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};