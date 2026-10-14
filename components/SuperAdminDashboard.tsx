
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { ShieldAlert, Users, Search, Check, LayoutDashboard, Mail, Loader2, Tag, X, Target, BrainCircuit, BarChart2, Globe, Building2, Quote, Award, UserCheck, Filter, ListChecks, Plus, Trash2, Save, ArrowUp, ArrowDown, ChevronRight, ChevronLeft, Settings, Calendar, Shield, Download, Leaf, Sprout, Tractor, TreeDeciduous, ScatterChart, MousePointer2, Database, Edit, Edit3, Link as LinkIcon, Image as ImageIcon, FileJson, Eye, EyeOff, HelpCircle, Briefcase, TrendingUp, AlertTriangle, Send, LayoutTemplate, Sparkles, CheckSquare, ExternalLink, Euro, Zap, Activity, Coins } from 'lucide-react';
import { MatriceIAView, getQuadrantName } from './MatriceIAView';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area } from 'recharts';
import { Profile, DefiView, Page, UserRole, MaturityQuestion, UnifiedResource, ResourceType, Organisation } from '../types';
import { GestionPrompts } from './GestionPrompts';
import { QualificationMarche } from './QualificationMarche';
import { CouleursMarches } from './CouleursMarches';
import { ReportingMarches } from './ReportingMarches';
import { N8N } from '../n8nConfig';
import { useMarche } from './MarcheContext';
import { filieresDuMarche } from './marcheShared';

interface SuperAdminDashboardProps {
  session: any;
  onNavigate: (page: Page) => void;
  onDataChange?: () => void; 
  onSelectOrg?: (orgId: string) => void;
}

// Configuration des types de ressources pour le dropdown
const RESOURCE_TYPES: { value: ResourceType, label: string }[] = [
  { value: 'tool', label: 'Outil IA' },
  { value: 'agent', label: 'Agent IA' },
  { value: 'usecase', label: "Cas d'usage" },
  { value: 'news', label: 'Actualité' },
  { value: 'learning', label: 'Formation Présentiel' },
  { value: 'elearning', label: 'E-learning (Vidéo/PDF)' },
  { value: 'data', label: 'Jeu de Données' },
];

const USERS_PER_PAGE = 10;
const CARDS_PER_PAGE = 12;

interface AlignmentResult {
  diagnostic_id: string;
  titre_defi: string;
  matrice_sur_mesure: {
    score_alignement_strategique: number;
    score_complexite: number;
    quadrant_nom: string;
    justification: string;
  }
}

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({ session, onNavigate, onDataChange, onSelectOrg }) => {
  // Global State
  const [activeCategory, setActiveCategory] = useState<'analysis' | 'management'>('analysis');
  const [activeView, setActiveView] = useState<'users' | 'defis' | 'questions' | 'matrix' | 'resources' | 'alignment' | 'external_tools' | 'organisations' | 'metrics_dashboard' | 'prompts_moderation' | 'marche_qualification'>('users');
  const [loading, setLoading] = useState(true);

  // Data State
  const [users, setUsers] = useState<Profile[]>([]);
  const [defis, setDefis] = useState<DefiView[]>([]);
  const [questions, setQuestions] = useState<MaturityQuestion[]>([]);
  const [resources, setResources] = useState<UnifiedResource[]>([]);
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [agentMetrics, setAgentMetrics] = useState<any[]>([]);
  const [platformMetrics, setPlatformMetrics] = useState<any[]>([]);
  const [allChartes, setAllChartes] = useState<any[]>([]);
  const [allCasUsages, setAllCasUsages] = useState<any[]>([]);

  // Metrics Dashboard Filters
  const [metricsTimeRange, setMetricsTimeRange] = useState<'1j' | '7j' | '30j' | 'overall' | 'custom'>('overall');
  const [metricsStartDate, setMetricsStartDate] = useState<string>('');
  const [metricsEndDate, setMetricsEndDate] = useState<string>('');
  // Filtre marché de la Tour de Contrôle (étape 10) : 'tous', un code de
  // marché, ou 'sans_marche'. Les appels IA portent le marché gravé à
  // l'appel (piloterra_agent_metrics.marche_code).
  const [metricsMarche, setMetricsMarche] = useState<string>('tous');

  // Metrics Calculations
  const metricsData = useMemo(() => {
    if (!agentMetrics.length && !platformMetrics.length) return null;

    const now = new Date();
    let start: Date | null = null;
    let end: Date | null = null;
    let prevStart: Date | null = null;
    let prevEnd: Date | null = null;

    if (metricsTimeRange === '1j') {
      start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      prevStart = new Date(start.getTime() - 24 * 60 * 60 * 1000);
      prevEnd = start;
    } else if (metricsTimeRange === '7j') {
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      prevStart = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);
      prevEnd = start;
    } else if (metricsTimeRange === '30j') {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      prevStart = new Date(start.getTime() - 30 * 24 * 60 * 60 * 1000);
      prevEnd = start;
    } else if (metricsTimeRange === 'overall') {
      start = null;
      end = null;
      prevStart = null;
      prevEnd = null;
    } else if (metricsTimeRange === 'custom') {
      if (metricsStartDate) start = new Date(metricsStartDate);
      if (metricsEndDate) {
        end = new Date(metricsEndDate);
        end.setHours(23, 59, 59, 999);
      }
      
      if (start && end) {
        const duration = end.getTime() - start.getTime();
        prevStart = new Date(start.getTime() - duration);
        prevEnd = start;
      }
    }

    const filterByDate = (m: any, s: Date | null, e: Date | null) => {
      const date = new Date(m.created_at);
      if (s && date < s) return false;
      if (e && date > e) return false;
      return true;
    };

    // Filtre marché : appels IA et pages vues portent le marché gravé à leur
    // création (marche_code, sql/etape10_reporting_marches.sql).
    const parMarche = (m: any) =>
      metricsMarche === 'tous' || (m.marche_code ?? 'sans_marche') === metricsMarche;
    const agentMetricsMarche = agentMetrics.filter(parMarche);
    const platformMetricsMarche = platformMetrics.filter(parMarche);

    const filteredAgentMetrics = agentMetricsMarche.filter(m => filterByDate(m, start, end));
    const filteredPlatformMetrics = platformMetricsMarche.filter(m => filterByDate(m, start, end));

    const prevAgentMetrics = agentMetricsMarche.filter(m => filterByDate(m, prevStart, prevEnd));
    const prevPlatformMetrics = platformMetricsMarche.filter(m => filterByDate(m, prevStart, prevEnd));

    // Current Period Stats
    const totalCost = filteredAgentMetrics.reduce((acc, m) => acc + (m.total_cost_usd || 0), 0);
    const totalCarbon = filteredAgentMetrics.reduce((acc, m) => acc + (m.emissions_gco2eq || 0), 0) + 
                        filteredPlatformMetrics.reduce((acc, m) => acc + (m.co2_grams || 0), 0);
    const totalRequests = filteredAgentMetrics.length;

    // Previous Period Stats (for comparison)
    const prevCost = prevAgentMetrics.reduce((acc, m) => acc + (m.total_cost_usd || 0), 0);
    const prevCarbon = prevAgentMetrics.reduce((acc, m) => acc + (m.emissions_gco2eq || 0), 0) + 
                       prevPlatformMetrics.reduce((acc, m) => acc + (m.co2_grams || 0), 0);
    const prevRequests = prevAgentMetrics.length;

    const getTrend = (curr: number, prev: number) => {
        if (prev === 0) return curr > 0 ? 100 : 0;
        return ((curr - prev) / prev) * 100;
    };

    // 1. Cost by Model
    const costByModel = filteredAgentMetrics.reduce((acc: any, m) => {
      acc[m.model] = (acc[m.model] || 0) + (m.total_cost_usd || 0);
      return acc;
    }, {});
    const costByModelChart = Object.entries(costByModel).map(([name, value]) => ({ name, value }));

    // 2. Time Series Costs (Dynamic Granularity)
    const durationDays = start && (end || now) ? ((end || now).getTime() - start.getTime()) / (1000 * 60 * 60 * 24) : 30;
    const useHourly = durationDays <= 2;

    const timeSeriesMap = filteredAgentMetrics.reduce((acc: any, m) => {
      let key: string;
      const date = new Date(m.created_at);
      
      if (useHourly) {
        const roundedDate = new Date(date);
        roundedDate.setMinutes(0, 0, 0);
        key = roundedDate.toISOString();
      } else {
        const roundedDate = new Date(date);
        roundedDate.setHours(0, 0, 0, 0);
        key = roundedDate.toISOString();
      }
      
      acc[key] = (acc[key] || 0) + (m.total_cost_usd || 0);
      return acc;
    }, {});
    
    const timeSeriesChart = Object.entries(timeSeriesMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([timestamp, cost]) => {
        const date = new Date(timestamp);
        const label = useHourly 
            ? date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
            : date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
        return { label, cost };
      });

    // 3. Average cost per Organization
    const organisationsMarche = metricsMarche === 'tous'
      ? organisations
      : organisations.filter((o: any) => (o.marche_code ?? 'sans_marche') === metricsMarche);
    const avgCostPerOrg = organisationsMarche.length > 0 ? (totalCost / organisationsMarche.length) : 0;

    // 4. Carbon by Source
    const carbonBySource = [
        { name: 'Agents IA', value: filteredAgentMetrics.reduce((acc, m) => acc + (m.emissions_gco2eq || 0), 0) },
        { name: 'Infrastructure', value: filteredPlatformMetrics.reduce((acc, m) => acc + (m.co2_grams || 0), 0) }
    ];

    return {
      costByModelChart,
      timeSeriesChart,
      totalCarbon,
      totalRequests,
      avgCostPerOrg,
      totalCost,
      carbonBySource,
      filteredAgentMetrics,
      trends: {
          cost: getTrend(totalCost, prevCost),
          carbon: getTrend(totalCarbon, prevCarbon),
          requests: getTrend(totalRequests, prevRequests)
      },
      useHourly
    };
  }, [agentMetrics, platformMetrics, organisations, metricsTimeRange, metricsStartDate, metricsEndDate, metricsMarche]);

  // CSV Export Helper
  const downloadMetricsCSV = useCallback(() => {
    if (!metricsData) return;
    
    const headers = ['Date', 'Modèle', 'Coût USD', 'Emissions gCO2eq', 'Tokens Input', 'Tokens Output'];
    const rows = metricsData.filteredAgentMetrics.map(m => [
      new Date(m.created_at).toLocaleString(),
      m.model,
      m.total_cost_usd,
      m.emissions_gco2eq,
      m.prompt_tokens,
      m.completion_tokens
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `piloterra_metrics_${metricsTimeRange}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [metricsData, metricsTimeRange]);

  // Pagination State
  const [currentPageUsers, setCurrentPageUsers] = useState(1);
  const [currentPageDefis, setCurrentPageDefis] = useState(1);
  const [currentPageResources, setCurrentPageResources] = useState(1);

  // Filters Users
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('All');
  const [userActivityFilter, setUserActivityFilter] = useState<string>('All');
  const [userMaturityFilter, setUserMaturityFilter] = useState<string>('All');
  const [userFunctionFilter, setUserFunctionFilter] = useState<string>('All');
  const [selectedOrgFilter, setSelectedOrgFilter] = useState<string>('All');

  // Sorting Users
  const [userSortKey, setUserSortKey] = useState<string>('updated_at');
  const [userSortOrder, setUserSortOrder] = useState<'asc' | 'desc'>('desc');

  // Filters Defis & Matrix
  const [defiSearchQuery, setDefiSearchQuery] = useState('');
  const [defiQuadrantFilter, setDefiQuadrantFilter] = useState('Tous');
  const [defiSourceFilter, setDefiSourceFilter] = useState<'Tous' | 'Membres' | 'Visiteurs'>('Tous');
  const [defiStartDate, setDefiStartDate] = useState<string>('');
  const [defiEndDate, setDefiEndDate] = useState<string>('');
  
  // Nouveaux filtres Défis
  const [defiRoiFilter, setDefiRoiFilter] = useState<string>('All');
  const [defiComplexityFilter, setDefiComplexityFilter] = useState<string>('All');

  // Filters Resources
  const [resourceSearch, setResourceSearch] = useState('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState<string>('All');
  // Filtre marché : 'All', un code de marché, 'transverse' (aucun marché)
  // ou 'a_qualifier' (jamais passé par la console de qualification).
  const [resourceMarcheFilter, setResourceMarcheFilter] = useState<string>('All');

  // Matrix Interaction
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  // Alignment Matrix State
  const [selectedDefiIds, setSelectedDefiIds] = useState<string[]>([]);
  const [internalPolicy, setInternalPolicy] = useState('');
  const [isGeneratingMatrix, setIsGeneratingMatrix] = useState(false);
  const [alignmentResults, setAlignmentResults] = useState<AlignmentResult[]>([]);
  const [savingAlignmentIds, setSavingAlignmentIds] = useState<string[]>([]);

  // Edit States
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [tempRole, setTempRole] = useState<UserRole>('user');
  const [tempOrg, setTempOrg] = useState<string>('');
  const [selectedDefi, setSelectedDefi] = useState<DefiView | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  
  // Bulk Selection State
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [bulkOrgId, setBulkOrgId] = useState<string>('');
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  
  // Organisation State
  const [isOrgModalOpen, setIsOrgModalOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [editingOrgId, setEditingOrgId] = useState<string | null>(null);
  const [orgCreateError, setOrgCreateError] = useState<string | null>(null);

  // Marché et filière d'une organisation (étape 5c)
  const { marches: referentielMarches, filieres: referentielFilieres, rafraichir: rafraichirMarche } = useMarche();
  const [newOrgMarche, setNewOrgMarche] = useState('');
  const [newOrgFiliere, setNewOrgFiliere] = useState('');

  // À l'ouverture de la fenêtre : marché et filière de l'organisation
  // modifiée, ou champs vides pour une création. Volontairement sans
  // `organisations` dans les dépendances : un rafraîchissement de la liste
  // ne doit pas effacer une saisie en cours.
  useEffect(() => {
    if (!isOrgModalOpen) return;
    const org = editingOrgId ? organisations.find((o) => o.id === editingOrgId) : null;
    setNewOrgMarche(org?.marche_code || '');
    setNewOrgFiliere(org?.filiere_code || '');
  }, [isOrgModalOpen, editingOrgId]);

  // Une filière hors du marché choisi est retirée
  const choisirMarcheOrganisation = (code: string) => {
    setNewOrgMarche(code);
    if (!referentielFilieres.some((f) => f.code === newOrgFiliere && f.marche_code === code)) {
      setNewOrgFiliere('');
    }
  };

  // Changer le marché d'une organisation déplace tous ses membres :
  // on le dit avant d'enregistrer.
  const orgEnEdition = editingOrgId ? organisations.find((o) => o.id === editingOrgId) : null;
  const membresOrgEnEdition = editingOrgId ? users.filter((u) => u.organisation_id === editingOrgId).length : 0;
  const avertissementMarche =
    orgEnEdition && newOrgMarche && newOrgMarche !== (orgEnEdition.marche_code || '') && membresOrgEnEdition > 0
      ? `${membresOrgEnEdition} membre${membresOrgEnEdition > 1 ? 's basculeront' : ' basculera'} sur ce marché ; leurs filières hors de ce marché seront effacées.`
      : null;
  
  // View User Defis State
  const [viewUserDefisId, setViewUserDefisId] = useState<string | null>(null);

  // Delete Confirmation State
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, type: 'question' | 'resource' | 'organisation' } | null>(null);

  // Magic Link State
  const [isMagicLinkModalOpen, setIsMagicLinkModalOpen] = useState(false);
  const [magicLinkEmail, setMagicLinkEmail] = useState('');
  const [magicLinkStatus, setMagicLinkStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [magicLinkError, setMagicLinkError] = useState('');

  // Notification State
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'alert' } | null>(null);

  // Auto-hide notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Question Management State
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionType, setNewQuestionType] = useState<'text' | 'choice'>('text');
  const [newQuestionOptions, setNewQuestionOptions] = useState<string[]>([]);
  const [currentOptionInput, setCurrentOptionInput] = useState('');
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editingQuestionText, setEditingQuestionText] = useState('');
  const [editingQuestionType, setEditingQuestionType] = useState<'text' | 'choice'>('text');
  const [editingQuestionOptions, setEditingQuestionOptions] = useState<string[]>([]);
  const [editingOptionInput, setEditingOptionInput] = useState('');

  // Resource Management State (CMS)
  const [isResourceModalOpen, setIsResourceModalOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<UnifiedResource | null>(null);
  const [formData, setFormData] = useState<Partial<UnifiedResource>>({
    type: 'tool',
    title: '',
    description: '',
    image_url: '',
    external_link: '',
    metadata: {},
    published: false,
    started_at: ''
  });

  // Reset pagination when filters change
  useEffect(() => { setCurrentPageUsers(1); }, [userSearchQuery, userRoleFilter, userActivityFilter, userMaturityFilter, userFunctionFilter, selectedOrgFilter]);
  useEffect(() => { setCurrentPageDefis(1); }, [defiSearchQuery, defiQuadrantFilter, defiSourceFilter, defiStartDate, defiEndDate, defiRoiFilter, defiComplexityFilter, selectedOrgFilter]);
  useEffect(() => { setCurrentPageResources(1); }, [resourceSearch, resourceTypeFilter, resourceMarcheFilter]);

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

  // --- MOTEUR DE RENDU MARKDOWN LÉGER ---
  const renderMarkdown = (text: string) => {
    if (!text) return null;
    
    // 1. Gestion des listes à puces et paragraphes
    return text.split('\n').map((line, index) => {
      const cleanLine = line.trim();
      if (cleanLine.startsWith('- ') || cleanLine.startsWith('* ')) {
        return (
          <li key={index} className="ml-4 list-disc pl-1 mb-1 text-slate-700">
            {parseFormatting(cleanLine.substring(2))}
          </li>
        );
      }
      if (cleanLine.startsWith('### ')) {
        return <h4 key={index} className="text-md font-bold text-slate-900 mt-4 mb-2">{parseFormatting(cleanLine.substring(4))}</h4>;
      }
      if (cleanLine === '') return <div key={index} className="h-2"></div>;
      return <p key={index} className="mb-2 text-slate-700 leading-relaxed">{parseFormatting(line)}</p>;
    });
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

  // Helper pour générer une couleur unique (HSL) basée sur l'ID
  const getColorForId = (id: string) => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 70%, 50%)`;
  };

  useEffect(() => {
    fetchGlobalData();
  }, []);

  const fetchGlobalData = async () => {
    setLoading(true);
    
    // 1. Users
    const { data: allUsers } = await supabase.from('utilisateurs').select('*').eq('provenance', 'piloterra').order('created_at', { ascending: false });
    if (allUsers) {
        const parsedUsers = allUsers.map((u: any) => {
            if (typeof u.maturity_results === 'string') {
                u.maturity_results = safeParse(u.maturity_results);
            }
            return u;
        });
        setUsers(parsedUsers as Profile[]);
    }

    // 2. Defis
    const { data: rawDefis } = await supabase.from('diagnostics').select('*').eq('provenance', 'piloterra');
    if (rawDefis) {
        const mappedDefis: DefiView[] = rawDefis.map((d: any) => {
            const inputs = safeParse(d.inputs_client || d.inputs_clients);
            const outputAgent = safeParse(d.output_agent_defi || d.out_agent_defi);
            const outputMatrice = safeParse(d.output_agent_matrice || d.outpout_agent_matrice);
            const scraper = safeParse(d.enrichissement_scraper);
            const collective = outputMatrice.collective || {};

            return {
                id: d.id,
                user_id: d.user_id,
                created_at: d.created_at,
                email: 'Voir user', 
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
                analyse_web: scraper,
                alignment_data: outputMatrice.alignment_strategique ? {
                    score_roi: outputMatrice.alignment_strategique.score_roi,
                    score_complexite: outputMatrice.alignment_strategique.score_complexite,
                    quadrant: outputMatrice.alignment_strategique.quadrant_nom,
                    justification: outputMatrice.alignment_strategique.justification,
                    updated_at: outputMatrice.alignment_strategique.updated_at,
                    politique_interne: outputMatrice.alignment_strategique.politique_interne
                } : undefined,
                // Collective strategic analysis
                score_roi_collectif: collective.score_roi ?? outputMatrice.score_roi_collectif ?? undefined,
                score_complexite_collectif: collective.score_complexite ?? outputMatrice.score_complexite_collectif ?? undefined,
                quadrant_collectif: collective.quadrant_nom || collective.quadrant || outputMatrice.quadrant_collectif || undefined,
                justification_collectif: collective.justification || outputMatrice.justification_collectif || undefined,
                updated_at_collectif: collective.updated_at || outputMatrice.updated_at_collectif || undefined,
            };
        });
        setDefis(mappedDefis);
    }

    // 3. Resources (Unified Table)
    const { data: rawResources } = await supabase.from('piloterra_resources').select('*').order('created_at', { ascending: false });
    if (rawResources) {
        setResources(rawResources.filter((r: any) => r.type !== 'organisation' && !r.metadata?.is_public_prompt) as UnifiedResource[]);
    }

    // 3.5 Organisations
    const { data: orgsData } = await supabase.from('organisations').select('*').order('created_at', { ascending: false });
    if (orgsData) {
        setOrganisations((orgsData as Organisation[]).filter(o => !o.nom.startsWith('__DELETED__')));
    }

    // 4. Questions
    const { data: questionsData } = await supabase.from('maturity_questions').select('*').order('order_index', { ascending: true });
    if (questionsData) {
        setQuestions(questionsData);
    }

    // 5. Metrics
    const { data: agentMetricsData } = await supabase.from('piloterra_agent_metrics').select('*').order('created_at', { ascending: true });
    if (agentMetricsData) {
        setAgentMetrics(agentMetricsData);
    }

    const { data: platformMetricsData } = await supabase.from('piloterra_platform_metrics').select('*').order('created_at', { ascending: true });
    if (platformMetricsData) {
        setPlatformMetrics(platformMetricsData);
    }

    // 6. Chartes
    const { data: chartesData } = await supabase.from('chartes').select('id, organisation_id, status');
    if (chartesData) {
        setAllChartes(chartesData);
    }

    // 7. Cas d'usages
    const { data: casUsagesData } = await supabase.from('cas_usage').select('id, organisation_id');
    if (casUsagesData) {
        setAllCasUsages(casUsagesData);
    }
    
    setLoading(false);
  };

  const fetchQuestions = async () => {
    const { data: questionsData } = await supabase
      .from('maturity_questions')
      .select('*')
      .order('order_index', { ascending: true });
    if (questionsData) setQuestions(questionsData);
  };

  // --- ORGANISATION LOGIC ---
  const handleCreateOrganisation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setOrgCreateError(null);
    // Étape 5c : marché obligatoire, filière facultative
    if (!newOrgMarche) {
      setOrgCreateError("Choisissez le marché de l'organisation.");
      return;
    }
    const champsOrganisation = {
      nom: newOrgName.trim(),
      marche_code: newOrgMarche,
      filiere_code: newOrgFiliere || null,
    };
    try {
      // .select('id') : une écriture refusée par la RLS ne renvoie pas
      // d'erreur, seulement zéro ligne. Sans ce contrôle, l'écran annonçait
      // un succès sans que rien ne change en base.
      if (editingOrgId) {
        const { data, error } = await supabase
          .from('organisations')
          .update(champsOrganisation)
          .eq('id', editingOrgId)
          .select('id');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error("La base a refusé la modification (droits insuffisants).");
        setNotification({ message: "Organisation mise à jour avec succès !", type: 'success' });
      } else {
        const { data, error } = await supabase.from('organisations').insert({
          ...champsOrganisation,
          description: 'Organisation créée par le Super Admin'
        }).select('id');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error("La base a refusé la création (droits insuffisants).");
        setNotification({ message: "Organisation créée avec succès !", type: 'success' });
      }
      setNewOrgName('');
      setEditingOrgId(null);
      setIsOrgModalOpen(false);
      fetchGlobalData(); // Refresh data
      // Le marché effectif des membres a pu changer
      rafraichirMarche();
      if (onDataChange) onDataChange();
    } catch (err: any) {
      console.error("Erreur création/modification organisation:", err);
      setOrgCreateError(err.message || "Erreur lors de la création/modification de l'organisation.");
    }
  };

  // --- MAGIC LINK LOGIC ---
  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!magicLinkEmail) return;

    setMagicLinkStatus('loading');
    setMagicLinkError('');

    try {
        const { error } = await supabase.auth.signInWithOtp({
            email: magicLinkEmail,
            options: {
                // Pour rediriger l'utilisateur vers le dashboard après connexion
                emailRedirectTo: window.location.origin, 
                shouldCreateUser: true // Créera le compte si l'email n'existe pas
            }
        });

        if (error) throw error;

        setMagicLinkStatus('success');
        setTimeout(() => {
            setIsMagicLinkModalOpen(false);
            setMagicLinkStatus('idle');
            setMagicLinkEmail('');
        }, 2000);

    } catch (err: any) {
        console.error("Magic Link Error:", err);
        setMagicLinkStatus('error');
        setMagicLinkError(err.message || "Erreur lors de l'envoi du lien.");
    }
  };

  // --- CMS LOGIC (RESOURCES) ---
  const handleOpenResourceModal = (res?: UnifiedResource) => {
    if (res) {
        setEditingResource(res);
        setFormData({ 
            ...res, 
            published: res.published ?? false,
            started_at: res.started_at ? res.started_at.split('T')[0] : ''
        });
    } else {
        setEditingResource(null);
        setFormData({
            type: 'tool',
            title: '',
            description: '',
            image_url: '',
            external_link: '',
            metadata: {},
            published: false,
            started_at: new Date().toISOString().split('T')[0]
        });
    }
    setIsResourceModalOpen(true);
  };

  // Helpers pour éditer les array dans les métadata
  const updateMetadataArray = (key: string, valueStr: string) => {
      const arr = valueStr.split(',').map(s => s.trim()).filter(s => s !== '');
      setFormData(prev => ({
          ...prev,
          metadata: {
              ...prev.metadata,
              [key]: arr
          }
      }));
  };

  const getMetadataArrayString = (key: string): string => {
      const val = formData.metadata?.[key];
      if (Array.isArray(val)) return val.join(', ');
      return '';
  };

  const handleSaveResource = async () => {
    try {
        const payload = {
            type: formData.type,
            title: formData.title,
            description: formData.description,
            image_url: formData.image_url,
            external_link: formData.external_link,
            metadata: formData.metadata,
            published: !!formData.published, // Force booléen
            started_at: formData.started_at || null, // Date selector value
        };

        if (editingResource) {
            // Update
            const { error } = await supabase.from('piloterra_resources').update(payload).eq('id', editingResource.id);
            if (error) throw error;
        } else {
            // Create
            const { error } = await supabase.from('piloterra_resources').insert(payload);
            if (error) throw error;
        }

        setIsResourceModalOpen(false);
        fetchGlobalData(); // Refresh admin list
        if (onDataChange) onDataChange(); // Refresh public app list
    } catch (e: any) {
        console.error("Erreur save:", e);
        alert("Erreur sauvegarde : " + e.message);
    }
  };

  const handleDeleteResource = (id: string) => {
    setDeleteConfirm({ id, type: 'resource' });
  };

  const filteredResources = useMemo(() => {
    return resources.filter(r => {
        const matchSearch = r.title.toLowerCase().includes(resourceSearch.toLowerCase());
        const matchType = resourceTypeFilter === 'All' || r.type === resourceTypeFilter;

        const marches = Array.isArray(r.marches) ? r.marches : [];
        const matchMarche =
          resourceMarcheFilter === 'All' ? true
          : resourceMarcheFilter === 'transverse' ? marches.length === 0
          : resourceMarcheFilter === 'a_qualifier' ? !r.marche_qualifie_le
          : marches.includes(resourceMarcheFilter);

        return matchSearch && matchType && matchMarche;
    });
  }, [resources, resourceSearch, resourceTypeFilter, resourceMarcheFilter]);

  // --- EXPORT CSV LOGIC ---
  const handleExportDefis = () => {
    if (filteredDefis.length === 0) {
        alert("Aucun défi à exporter avec les filtres actuels.");
        return;
    }
    const headers = ["Date", "Utilisateur (Nom)", "Email (Utilisateur)", "Type (Membre/Visiteur)", "Titre du Défi", "Problème Initial", "Vision", "Ressources", "Quadrant Stratégique", "Score ROI", "Score Complexité", "Justification IA"];
    const rows = filteredDefis.map(d => {
        const user = users.find(u => u.id === d.user_id);
        const isMember = user && user.role !== 'visitor';
        const userName = user ? `${user.prenom} ${user.nom}` : "Visiteur Web";
        const userEmail = user ? user.email : "N/A";
        const clean = (text: string | null | undefined) => { if (!text) return ""; return `"${text.replace(/"/g, '""').replace(/\n/g, ' ')}"`; };
        return [
            `"${new Date(d.created_at).toLocaleDateString()}"`, clean(userName), clean(userEmail), isMember ? "Membre" : "Visiteur",
            clean(d.titreDefi || "Analyse en cours"), clean(d.probleme), clean(d.vision), clean(d.ressources), clean(d.quadrant), d.score_roi || "", d.score_complexite || "", clean(d.justification)
        ].join(',');
    });
    const csvContent = "\uFEFF" + headers.join(',') + "\n" + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `export_defis_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkOrgUpdate = async () => {
    if (!bulkOrgId || selectedUserIds.length === 0) return;
    
    setIsBulkUpdating(true);
    try {
      const targetOrgId = bulkOrgId === 'none' ? null : bulkOrgId;
      const { error } = await supabase
        .from('utilisateurs')
        .update({ organisation_id: targetOrgId })
        .in('id', selectedUserIds);

      if (error) throw error;
      
      // Refresh users locally
      setUsers(prev => prev.map(u => 
        selectedUserIds.includes(u.id) 
          ? { ...u, organisation_id: targetOrgId || undefined } 
          : u
      ));
      
      setSelectedUserIds([]);
      setBulkOrgId('');
      alert(`${selectedUserIds.length} utilisateurs mis à jour avec succès.`);
    } catch (err) {
      console.error('Error in bulk update:', err);
      alert("Erreur lors de la mise à jour groupée.");
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId) 
        : [...prev, userId]
    );
  };

  const toggleAllUsersSelection = (currentPageUsersList: Profile[]) => {
    const currentPageUserIds = currentPageUsersList.map(u => u.id);
    const allSelected = currentPageUserIds.every(id => selectedUserIds.includes(id));
    
    if (allSelected) {
      setSelectedUserIds(prev => prev.filter(id => !currentPageUserIds.includes(id)));
    } else {
      setSelectedUserIds(prev => [...new Set([...prev, ...currentPageUserIds])]);
    }
  };

  // --- STRATEGIC ALIGNMENT LOGIC ---
  const handleToggleDefiSelection = (id: string) => {
    setSelectedDefiIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleUpdateDefiTitle = async (id: string, newTitle: string) => {
    if (!id || !newTitle.trim()) return;
    setIsSavingTitle(true);
    try {
      const { data: current, error: fetchError } = await supabase
        .from('diagnostics')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      const currentOutput = safeParse(current.output_agent_defi || current.out_agent_defi);
      const updatedOutput = { 
        ...currentOutput, 
        titreDefi: newTitle.trim(),
        titre: newTitle.trim()
      };

      const updatePayload: any = {};
      if (Object.keys(current).includes('output_agent_defi')) {
        updatePayload.output_agent_defi = updatedOutput;
      } else if (Object.keys(current).includes('out_agent_defi')) {
        updatePayload.out_agent_defi = updatedOutput;
      } else {
        updatePayload.output_agent_defi = updatedOutput;
      }

      const { error: updateError } = await supabase
        .from('diagnostics')
        .update(updatePayload)
        .eq('id', id);

      if (updateError) throw updateError;

      const trimmedTitle = newTitle.trim();
      setDefis(prev => prev.map(d => d.id === id ? { ...d, titreDefi: trimmedTitle } : d));
      if (selectedDefi?.id === id) {
        setSelectedDefi(prev => prev ? { ...prev, titreDefi: trimmedTitle } : null);
      }
      setIsEditingTitle(false);
      setNotification({ message: "Titre du défi mis à jour avec succès.", type: 'success' });
    } catch (err: any) {
      console.error("Erreur lors de la mise à jour du titre du défi:", err);
      setNotification({ message: "Erreur lors de la mise à jour : " + (err.message || "Erreur inconnue"), type: 'alert' });
    } finally {
      setIsSavingTitle(false);
    }
  };

  const handleGenerateAlignment = async () => {
    if (selectedDefiIds.length === 0 || !internalPolicy.trim()) {
      alert("Veuillez sélectionner au moins un défi et saisir une politique interne.");
      return;
    }

    setIsGeneratingMatrix(true);
    setAlignmentResults([]);

    try {
      const response = await fetch(N8N.matriceAlignement, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: "generate_custom_matrix",
          metadata: {
            charge_de_compte_id: session.user.id
          },
          data: {
            diagnostic_ids: selectedDefiIds,
            politique_interne: internalPolicy
          }
        })
      });

      if (!response.ok) throw new Error("Erreur lors de l'appel au service d'alignement");

      const json = await response.json();
      console.log("Alignement response:", json);

      let rawResults: any[] = [];

      // 1. Extraction des résultats bruts selon le format de réponse
      if (json.status === "success" && Array.isArray(json.results)) {
        rawResults = json.results;
      } else if (Array.isArray(json)) {
        // Cas spécifique n8n: [{ results: [...] }]
        if (json.length > 0 && json[0].results && Array.isArray(json[0].results)) {
            rawResults = json[0].results;
        } else {
            rawResults = json;
        }
      } else if (json.output && Array.isArray(json.output)) {
         rawResults = json.output;
      } else if (json.data) {
          rawResults = Array.isArray(json.data) ? json.data : [json.data];
      } else {
        throw new Error("Format de réponse invalide: " + JSON.stringify(json));
      }

      // 2. Traitement et parsing de chaque résultat
      const processedResults = rawResults.map((item: any) => {
          // Si resultat_matrice est une string JSON, on la parse
          if (item.resultat_matrice && typeof item.resultat_matrice === 'string') {
              try {
                  const parsed = safeParse(item.resultat_matrice);
                  let content = parsed.output || parsed;
                  
                  // Fallback: Si matrice_sur_mesure n'existe pas, on essaie de parser le texte brut (state)
                  if (!content.matrice_sur_mesure && content.state) {
                      const stateText = content.state;
                      
                      // Extraction via Regex
                      const scoreAlignMatch = stateText.match(/Alignement strat(?:é|e)gique\s*[:=]?\s*(\d+)/i);
                      const scoreComplexMatch = stateText.match(/Complexit(?:é|e)\s*[:=]?\s*(\d+)/i);
                      const quadrantMatch = stateText.match(/Quadrant\s*[:=]?\s*([^.\n]+)/i);
                      
                      // Justification: soit dans 'cities' (array), soit extrait du texte
                      let justification = "Justification non trouvée";
                      if (Array.isArray(content.cities) && content.cities.length > 0) {
                          justification = content.cities.join('\n\n');
                      } else {
                          const justifMatch = stateText.match(/Justification\s*[:=]?\s*([\s\S]+)/i);
                          if (justifMatch) justification = justifMatch[1].trim();
                      }

                      content = {
                          ...content,
                          matrice_sur_mesure: {
                              score_alignement_strategique: scoreAlignMatch ? parseInt(scoreAlignMatch[1]) : 0,
                              score_complexite: scoreComplexMatch ? parseInt(scoreComplexMatch[1]) : 0,
                              quadrant_nom: quadrantMatch ? quadrantMatch[1].trim() : "Non défini",
                              justification: justification
                          }
                      };
                  }

                  return {
                      ...content,
                      diagnostic_id: item.diagnostic_id || content.diagnostic_id,
                      titre_defi: content.titre_defi || item.titre_defi || "Défi analysé"
                  };
              } catch (e) {
                  console.error("Error parsing resultat_matrice", e);
                  // On retourne l'item tel quel si échec, ou null si inutilisable
                  return { ...item, error: "Parsing failed" };
              }
          }
          
          // Si déjà objet ou pas de resultat_matrice à parser
          return item;
      }).filter((r: any) => r && !r.error);

      setAlignmentResults(processedResults);

    } catch (err: any) {
      console.error("Erreur alignement:", err);
      alert(err.message || "Une erreur est survenue lors de la génération de la matrice.");
    } finally {
      setIsGeneratingMatrix(false);
    }
  };

  const saveAlignmentToDefi = async (result: any) => {
    if (!result.diagnostic_id) {
        alert("ID du défi manquant.");
        return;
    }

    setSavingAlignmentIds(prev => [...prev, result.diagnostic_id]);

    try {
        // Fetch current data to preserve existing matrix
        const { data: currentDefi, error: fetchError } = await supabase
            .from('diagnostics')
            .select('output_agent_matrice')
            .eq('id', result.diagnostic_id)
            .single();

        if (fetchError) throw fetchError;

        const currentMatrix = currentDefi.output_agent_matrice || {};

        const newAlignmentData = {
            score_roi: result.matrice_sur_mesure.score_alignement_strategique,
            score_complexite: result.matrice_sur_mesure.score_complexite,
            quadrant_nom: result.matrice_sur_mesure.quadrant_nom,
            justification: result.matrice_sur_mesure.justification,
            updated_at: new Date().toISOString(),
            source: 'alignment_matrix_tool',
            politique_interne: internalPolicy
        };

        const updatedMatrix = {
            ...currentMatrix,
            alignment_strategique: newAlignmentData
        };

        const { error } = await supabase
            .from('diagnostics')
            .update({ output_agent_matrice: updatedMatrix })
            .eq('id', result.diagnostic_id);

        if (error) throw error;

        // Update local state to reflect changes in the "Defis" list
        setDefis(prev => prev.map(d => {
            if (d.id === result.diagnostic_id) {
                return {
                    ...d,
                    alignment_data: {
                        score_roi: newAlignmentData.score_roi,
                        score_complexite: newAlignmentData.score_complexite,
                        quadrant: newAlignmentData.quadrant_nom,
                        justification: newAlignmentData.justification,
                        updated_at: newAlignmentData.updated_at,
                        politique_interne: newAlignmentData.politique_interne
                    }
                };
            }
            return d;
        }));

        alert("Résultats sauvegardés avec succès dans la fiche défi !");

    } catch (err: any) {
        console.error("Error saving alignment:", err);
        alert("Erreur lors de la sauvegarde : " + err.message);
    } finally {
        setSavingAlignmentIds(prev => prev.filter(id => id !== result.diagnostic_id));
    }
  };

  // State for Collective Modal Editing
  const [isEditingCollective, setIsEditingCollective] = useState(false);
  const [collectiveRoiInput, setCollectiveRoiInput] = useState<number>(50);
  const [collectiveCplxInput, setCollectiveCplxInput] = useState<number>(50);
  const [collectiveJustifInput, setCollectiveJustifInput] = useState<string>('');
  const [isSavingCollectiveModal, setIsSavingCollectiveModal] = useState(false);

  // Update Collective Matrix Handler
  const handleUpdateCollectiveMatrix = async (defiId: string, roi: number, complexite: number, justification?: string) => {
    try {
        const { data: currentRecord, error: fetchErr } = await supabase
            .from('diagnostics')
            .select('output_agent_matrice')
            .eq('id', defiId)
            .single();

        if (fetchErr) throw fetchErr;

        const currentMatrice = safeParse(currentRecord?.output_agent_matrice || {});
        const quad = getQuadrantName(roi, complexite);

        const updatedMatrice = {
            ...currentMatrice,
            collective: {
                score_roi: roi,
                score_complexite: complexite,
                quadrant_nom: quad,
                justification: justification || currentMatrice.collective?.justification || "Positionnement ajusté lors de l'analyse collective",
                updated_at: new Date().toISOString()
            }
        };

        const { error: updateErr } = await supabase
            .from('diagnostics')
            .update({ output_agent_matrice: updatedMatrice })
            .eq('id', defiId);

        if (updateErr) throw updateErr;

        setDefis(prev => prev.map(d => {
            if (d.id === defiId) {
                const updated = {
                    ...d,
                    score_roi_collectif: roi,
                    score_complexite_collectif: complexite,
                    quadrant_collectif: quad,
                    justification_collectif: justification || d.justification_collectif || "Positionnement ajusté lors de l'analyse collective",
                    updated_at_collectif: new Date().toISOString()
                };
                if (selectedDefi?.id === defiId) {
                    setSelectedDefi(updated);
                }
                return updated;
            }
            return d;
        }));
    } catch (err: any) {
        console.error("Erreur lors de la mise à jour de l'analyse collective:", err);
        throw err;
    }
  };

  // --- QUESTION LOGIC & EDIT USER LOGIC ---
  const handleAddOption = (isEditing: boolean) => {
    if (isEditing) {
        if (!editingOptionInput.trim()) return;
        setEditingQuestionOptions([...editingQuestionOptions, editingOptionInput.trim()]);
        setEditingOptionInput('');
    } else {
        if (!currentOptionInput.trim()) return;
        setNewQuestionOptions([...newQuestionOptions, currentOptionInput.trim()]);
        setCurrentOptionInput('');
    }
  };
  const removeOption = (index: number, isEditing: boolean) => {
    if (isEditing) setEditingQuestionOptions(editingQuestionOptions.filter((_, i) => i !== index));
    else setNewQuestionOptions(newQuestionOptions.filter((_, i) => i !== index));
  };
  
  const handleDeleteQuestion = (id: string, e: React.MouseEvent) => { 
    e.stopPropagation();
    setDeleteConfirm({ id, type: 'question' });
  };

  const executeDelete = async () => {
    if (!deleteConfirm) return;
    const { id, type } = deleteConfirm;

    try {
        if (type === 'resource') {
            const { error } = await supabase.from('piloterra_resources').delete().eq('id', id);
            if (error) throw error;
            setResources(prev => prev.filter(r => r.id !== id));
            setNotification({ message: "Ressource supprimée avec succès.", type: 'success' });
            if (onDataChange) onDataChange();
        } else if (type === 'question') {
            const { error } = await supabase.from('maturity_questions').delete().eq('id', id);
            if (error) {
                if (error.code === '42501' || error.message.includes('row-level security')) {
                    throw new Error("Permission refusée (RLS). Vérifiez vos droits Supabase.");
                }
                throw error;
            }
            setQuestions(prev => prev.filter(q => q.id !== id));
            setNotification({ message: "Question supprimée avec succès.", type: 'success' });
        } else if (type === 'organisation') {
            // Unlink users from this organisation
            const { error: userUpdateError } = await supabase
                .from('utilisateurs')
                .update({ organisation_id: null })
                .eq('organisation_id', id);
            if (userUpdateError) {
                console.error("Could not unbind users:", userUpdateError);
                throw new Error("Impossible de détacher les utilisateurs : " + userUpdateError.message);
            }

            // Delete associated invitations
            const { error: inviteError } = await supabase
                .from('invitations')
                .delete()
                .eq('organisation_id', id);
            if (inviteError) {
                console.error("Could not delete invitations:", inviteError);
                throw new Error("Impossible de supprimer les invitations : " + inviteError.message);
            }

            // Delete associated chartes
            const { error: charteError } = await supabase
                .from('chartes')
                .delete()
                .eq('organisation_id', id);
            if (charteError) {
                console.error("Could not delete chartes:", charteError);
                throw new Error("Impossible de supprimer les chartes liées : " + charteError.message);
            }

            // Delete organisation with dynamic fallback to soft-delete
            const { error, count } = await supabase
                .from('organisations')
                .delete({ count: 'exact' })
                .eq('id', id);

            if (error || !count || count === 0) {
                console.log("Ressenti d'une restriction RLS pour la suppression directe. Exécution du soft-delete de secours...");
                const { error: updateError } = await supabase
                    .from('organisations')
                    .update({ nom: `__DELETED__${id}` })
                    .eq('id', id);
                if (updateError) {
                    throw new Error("Impossible de supprimer ou de masquer l'organisation : " + updateError.message);
                }
            }

            setOrganisations(prev => prev.filter(org => org.id !== id && !org.nom.startsWith('__DELETED__')));
            setUsers(prev => prev.map(u => u.organisation_id === id ? { ...u, organisation_id: undefined } : u));
            setNotification({ message: "Organisation supprimée avec succès.", type: 'success' });
            if (onDataChange) onDataChange();
        }
        setDeleteConfirm(null);
    } catch (e: any) {
        console.error("Erreur suppression:", e);
        setNotification({ message: "Erreur lors de la suppression : " + e.message, type: 'alert' });
    }
  };

  const handleEditQuestionStart = (q: MaturityQuestion) => { setEditingQuestionId(q.id); setEditingQuestionText(q.question_text); setEditingQuestionType(q.question_type || 'text'); setEditingQuestionOptions(q.options || []); };
  const handleEditQuestionSave = async (id: string) => { await supabase.from('maturity_questions').update({ question_text: editingQuestionText, question_type: editingQuestionType, options: editingQuestionOptions }).eq('id', id); setEditingQuestionId(null); fetchQuestions(); };
  
  const handleMoveQuestion = async (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === questions.length - 1)) return;
    
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const currentQuestion = questions[index];
    const targetQuestion = questions[targetIndex];

    // Calcul des nouveaux ordres (swap)
    const newCurrentOrder = targetQuestion.order_index;
    const newTargetOrder = currentQuestion.order_index;

    // Mise à jour Optimiste : on intervertit dans le tableau local
    const updatedQuestions = [...questions];
    updatedQuestions[index] = { ...currentQuestion, order_index: newCurrentOrder };
    updatedQuestions[targetIndex] = { ...targetQuestion, order_index: newTargetOrder };
    
    // On trie pour l'affichage visuel immédiat
    updatedQuestions.sort((a, b) => a.order_index - b.order_index);
    setQuestions(updatedQuestions);

    try {
        // Mise à jour DB
        await supabase.from('maturity_questions').update({ order_index: newCurrentOrder }).eq('id', currentQuestion.id);
        await supabase.from('maturity_questions').update({ order_index: newTargetOrder }).eq('id', targetQuestion.id);
    } catch (error) {
        console.error("Erreur lors du déplacement", error);
        // En cas d'erreur, on recharge pour remettre d'équerre
        fetchQuestions();
    }
  };

  const getMaturityBadge = (title: string | undefined) => {
    if (!title) return <span className="text-slate-300 text-xs italic">-</span>;
    let colorClass = "bg-slate-100 text-slate-600 border-slate-200";
    if (title.includes("GRAINE")) colorClass = "bg-amber-50 text-amber-700 border-amber-200";
    if (title.includes("POUSSE")) colorClass = "bg-lime-50 text-lime-700 border-lime-200";
    if (title.includes("ARBRE")) colorClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (title.includes("SEMEUR")) colorClass = "bg-pilo-brown/10 text-pilo-brown border-pilo-brown/20";
    return <span className={`inline-flex px-2 py-1 rounded-full text-[10px] font-bold border whitespace-nowrap ${colorClass}`}>{title}</span>;
  };

  const isUserMember = (user: Profile) => user.role !== 'visitor';
  const quadrants = ['Gains Rapides', 'Projets Majeurs', 'Tactiques', 'À Éviter', 'Tous'];
  
  const getUserDetails = (userId: string) => {
    const user = users.find(u => u.id === userId || u.auth_id === userId);
    const userOrgId = user?.organisation_id || user?.organisation?.id;
    const org = organisations.find(o => o.id === userOrgId);
    return {
        name: user ? `${user.prenom} ${user.nom}` : "Utilisateur Inconnu",
        isMember: user ? user.role !== 'visitor' : false,
        organisation_id: userOrgId,
        organisation_name: user?.organisation?.nom || org?.nom
    };
  };

  const handleAddQuestion = async () => {
    if (!newQuestionText.trim()) return;
    try {
        await supabase.from('maturity_questions').insert({
            question_text: newQuestionText,
            question_type: newQuestionType,
            options: newQuestionType === 'choice' ? newQuestionOptions : null,
            order_index: questions.length > 0 ? Math.max(...questions.map(q => q.order_index)) + 1 : 1,
            is_active: true
        });
        setNewQuestionText('');
        setNewQuestionOptions([]);
        setNewQuestionType('text');
        fetchQuestions();
    } catch (e) {
        console.error(e);
        alert("Erreur lors de l'ajout");
    }
  };

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
            
            {data.typologie_clients && Array.isArray(data.typologie_clients) && (
                <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-1"><Users className="w-3 h-3" /> Clients</h4>
                    <div className="flex flex-wrap gap-2">
                        {data.typologie_clients.map((c: string, i: number) => (
                            <span key={i} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-100">{c}</span>
                        ))}
                    </div>
                </div>
            )}

            {data.valeurs_clés && (
                <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-1"><Award className="w-3 h-3" /> Valeurs Clés</h4>
                    <div className="flex flex-wrap gap-2">
                        {Array.isArray(data.valeurs_clés) 
                            ? data.valeurs_clés.map((v: string | any, i: number) => (
                                <span key={i} className="px-2 py-1 bg-emerald-50 text-emerald-700 text-xs rounded-full border border-emerald-100">
                                    {typeof v === 'string' ? v : v.thème || JSON.stringify(v)}
                                </span>
                              ))
                            : <p className="text-xs text-slate-500 italic">Format non supporté</p>
                        }
                    </div>
                </div>
            )}

            {data.tonalite && (
                <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-1"><Quote className="w-3 h-3" /> Tonalité</h4>
                    <div className="text-sm text-slate-600 italic border-l-2 border-slate-200 pl-3">
                        {renderMarkdown(typeof data.tonalite === 'string' ? data.tonalite : (data.tonalite.globale || "N/A"))}
                    </div>
                </div>
            )}
        </div>
    );
  };

  // --- FILTERING LOGIC ---
  
  const checkUserFilters = useCallback((u: Profile) => {
      const matchSearch = (u.nom + u.prenom + u.email).toLowerCase().includes(userSearchQuery.toLowerCase());
      const matchRole = userRoleFilter === 'All' || u.role === userRoleFilter;
      
      let matchDate = true;
      if (userActivityFilter !== 'All' && u.updated_at) {
        const diffDays = Math.ceil(Math.abs(new Date().getTime() - new Date(u.updated_at).getTime()) / (1000 * 60 * 60 * 24)); 
        if (userActivityFilter === '7days') matchDate = diffDays <= 7;
        if (userActivityFilter === '30days') matchDate = diffDays <= 30;
        if (userActivityFilter === '90days') matchDate = diffDays <= 90;
      } else if (userActivityFilter !== 'All') matchDate = false; 
      
      let matchMaturity = true;
      if (userMaturityFilter !== 'All') matchMaturity = u.maturity_results?.profil_titre?.includes(userMaturityFilter) || false;
      
      const matchFunction = userFunctionFilter === 'All' || u.fonction_profil === userFunctionFilter;
      const matchOrg = selectedOrgFilter === 'All' || u.organisation_id === selectedOrgFilter;
      
      return matchSearch && matchRole && matchDate && matchMaturity && matchFunction && matchOrg;
  }, [userSearchQuery, userRoleFilter, userActivityFilter, userMaturityFilter, userFunctionFilter, selectedOrgFilter]);

  const checkDefiFilters = useCallback((d: DefiView) => {
      // Quadrant filter logic
      const matchQuadrant = defiQuadrantFilter === 'Tous' || (d.quadrant && d.quadrant.includes(defiQuadrantFilter));
      
      // Search logic
      const user = users.find(u => u.id === d.user_id);
      const matchOrg = selectedOrgFilter === 'All' || (user && user.organisation_id === selectedOrgFilter);
      
      const userName = user ? `${user.prenom} ${user.nom}` : '';
      const userEmail = user ? user.email : '';
      const searchLower = defiSearchQuery.toLowerCase();
      const matchSearch = (d.titreDefi || '').toLowerCase().includes(searchLower) || 
                          (d.probleme || '').toLowerCase().includes(searchLower) ||
                          userName.toLowerCase().includes(searchLower) ||
                          (userEmail || '').toLowerCase().includes(searchLower);

      // Source filter logic
      const isMember = user && user.role !== 'visitor';
      const matchSource = defiSourceFilter === 'Tous' || (defiSourceFilter === 'Membres' && isMember) || (defiSourceFilter === 'Visiteurs' && !isMember);
      
      // Date logic
      let matchDate = true;
      const itemDate = new Date(d.created_at);
      if (defiStartDate) {
          matchDate = matchDate && itemDate >= new Date(defiStartDate);
      }
      if (defiEndDate) {
          const end = new Date(defiEndDate);
          end.setHours(23, 59, 59, 999);
          matchDate = matchDate && itemDate <= end;
      }
      
      // ROI logic
      const matchRoi = defiRoiFilter === 'All'
        ? true
        : defiRoiFilter === 'High' ? (d.score_roi || 0) >= 70
        : defiRoiFilter === 'Medium' ? (d.score_roi || 0) >= 40 && (d.score_roi || 0) < 70
        : (d.score_roi || 0) < 40;

      // Complexity logic
      const matchComplexity = defiComplexityFilter === 'All'
        ? true
        : defiComplexityFilter === 'High' ? (d.score_complexite || 0) >= 70
        : defiComplexityFilter === 'Medium' ? (d.score_complexite || 0) >= 40 && (d.score_complexite || 0) < 70
        : (d.score_complexite || 0) < 40;

      return matchQuadrant && matchSearch && matchSource && matchDate && matchRoi && matchComplexity && matchOrg;
  }, [defiQuadrantFilter, defiSearchQuery, users, defiSourceFilter, defiStartDate, defiEndDate, defiRoiFilter, defiComplexityFilter, selectedOrgFilter]);

  // Sorting Helper Functions
  const handleSort = (key: string) => {
    if (userSortKey === key) {
      setUserSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setUserSortKey(key);
      setUserSortOrder('asc');
    }
  };

  const renderSortIcon = (key: string) => {
    if (userSortKey !== key) {
      return <ArrowUp className="w-3.5 h-3.5 text-slate-300 opacity-50 inline-block ml-1 transition-all" />;
    }
    return userSortOrder === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-indigo-600 inline-block ml-1" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-indigo-600 inline-block ml-1" />
    );
  };

  // Filter Helpers
  const filteredUsers = useMemo(() => {
    const list = users.filter(u => {
      // 1. Check User Filters
      if (!checkUserFilters(u)) return false;

      // 2. Check Defi Filters (Cross-Filtering)
      // Check if any Defi filters are active
      const areDefiFiltersActive = defiSearchQuery !== '' || 
                                   defiQuadrantFilter !== 'Tous' || 
                                   defiSourceFilter !== 'Tous' || 
                                   defiStartDate !== '' || 
                                   defiEndDate !== '' || 
                                   defiRoiFilter !== 'All' || 
                                   defiComplexityFilter !== 'All';
      
      if (areDefiFiltersActive) {
          // If Defi filters are active, the user MUST have at least one matching defi
          const userDefis = defis.filter(d => d.user_id === u.id);
          // If user has no defis, they don't match the defi filters
          if (userDefis.length === 0) return false;
          // User must have at least one defi that matches the current defi filters
          return userDefis.some(d => checkDefiFilters(d));
      }

      return true;
    });

    // Sort the list based on sortKey and sortOrder
    return [...list].sort((a, b) => {
      let valA: any = '';
      let valB: any = '';

      if (userSortKey === 'name') {
        valA = `${a.prenom || ''} ${a.nom || ''}`.trim().toLowerCase();
        valB = `${b.prenom || ''} ${b.nom || ''}`.trim().toLowerCase();
      } else if (userSortKey === 'fonction') {
        valA = (a.fonction_profil || '').toLowerCase();
        valB = (b.fonction_profil || '').toLowerCase();
      } else if (userSortKey === 'organisation') {
        const orgA = organisations.find(o => o.id === a.organisation_id)?.nom || '';
        const orgB = organisations.find(o => o.id === b.organisation_id)?.nom || '';
        valA = orgA.toLowerCase();
        valB = orgB.toLowerCase();
      } else if (userSortKey === 'role') {
        valA = (a.role || '').toLowerCase();
        valB = (b.role || '').toLowerCase();
      } else if (userSortKey === 'maturity') {
        valA = (a.maturity_results?.profil_titre || '').toLowerCase();
        valB = (b.maturity_results?.profil_titre || '').toLowerCase();
      } else if (userSortKey === 'score') {
        valA = a.maturity_results?.score_maturite || 0;
        valB = b.maturity_results?.score_maturite || 0;
      } else if (userSortKey === 'updated_at') {
        valA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        valB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      }

      if (valA < valB) return userSortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return userSortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [users, defis, organisations, checkUserFilters, checkDefiFilters, defiSearchQuery, defiQuadrantFilter, defiSourceFilter, defiStartDate, defiEndDate, defiRoiFilter, defiComplexityFilter, selectedOrgFilter, userSortKey, userSortOrder]);

  const availableFunctions = useMemo(() => {
      const funcs = new Set<string>();
      users.forEach(u => {
          if (u.fonction_profil) funcs.add(u.fonction_profil);
      });
      return Array.from(funcs).sort();
  }, [users]);

  const filteredDefis = useMemo(() => {
    return defis.filter(d => {
      // 1. Check Defi Filters
      if (!checkDefiFilters(d)) return false;

      // 2. Check User Filters (Cross-Filtering)
      const user = users.find(u => u.id === d.user_id);
      if (!user) return false; // Should not happen
      
      return checkUserFilters(user);
    });
  }, [defis, users, checkDefiFilters, checkUserFilters]);

  const startEdit = (user: Profile) => { setEditingUser(user.id); setTempRole(user.role); setTempOrg(user.organisation_id || ''); };
  const saveEdit = async (userId: string) => {
    const { error } = await supabase.from('utilisateurs').update({ role: tempRole, organisation_id: tempOrg || null }).eq('id', userId);
    if (!error) { setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: tempRole, organisation_id: tempOrg || undefined } : u)); setEditingUser(null); }
    else alert("Erreur lors de la mise à jour");
  };

  const PaginationControls = ({ currentPage, totalItems, itemsPerPage, onPageChange }: any) => {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (totalPages <= 1) return null;

    return (
        <div className="flex justify-center items-center gap-4 mt-6 py-4">
            <button 
                onClick={() => onPageChange(currentPage - 1)} 
                disabled={currentPage === 1}
                className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-white transition-colors"
            >
                <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm font-bold text-slate-500">
                Page {currentPage} sur {totalPages}
            </span>
            <button 
                onClick={() => onPageChange(currentPage + 1)} 
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-white transition-colors"
            >
                <ChevronRight className="w-5 h-5" />
            </button>
        </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f8f7f1] text-slate-900 p-8">
      {/* Header and layout */}
      <div className="max-w-[1600px] mx-auto">
        <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between mb-8 gap-6">
           <div>
               <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
                <ShieldAlert className="w-10 h-10 text-red-600" />
                SUPER ADMIN CONSOLE
               </h1>
           </div>
           
           <div className="flex flex-col gap-6 w-full xl:w-auto">
             {/* Category Switcher */}
             <div className="flex p-1 bg-slate-200/50 rounded-xl self-start">
                <button 
                  onClick={() => {
                    setActiveCategory('analysis');
                    setActiveView('users');
                  }}
                  className={`px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeCategory === 'analysis' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <BarChart2 className="w-4 h-4" />
                  Pilotage & Analyse
                </button>
                <button 
                  onClick={() => {
                    setActiveCategory('management');
                    setActiveView('organisations');
                  }}
                  className={`px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeCategory === 'management' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <Settings className="w-4 h-4" />
                  Gestion & Ressources
                </button>
             </div>

             <div className="flex flex-wrap gap-4">
                {(activeCategory === 'analysis' ? [
                    { id: 'users', label: 'Utilisateurs', count: filteredUsers.length, color: 'pilo-green', border: 'border-pilo-green' },
                    { id: 'defis', label: 'Défis IA', count: filteredDefis.length, color: 'pilo-brown', border: 'border-pilo-brown' },
                    { id: 'matrix', label: 'Matrice IA', icon: <ScatterChart className="w-5 h-5" />, color: 'blue-600', border: 'border-blue-600' },
                    { id: 'alignment', label: 'Matrice Strat.', icon: <LayoutTemplate className="w-5 h-5" />, color: 'emerald-600', border: 'border-emerald-600' },
                ] : [
                    { id: 'organisations', label: 'Organisations', icon: <Building2 className="w-5 h-5" />, color: 'indigo-600', border: 'border-indigo-600' },
                    { id: 'resources', label: 'Contenus', count: resources.length, icon: <Database className="w-5 h-5" />, color: 'purple-600', border: 'border-purple-600' },
                    { id: 'questions', label: 'Maturité IA', count: questions.length, color: 'blue-600', border: 'border-blue-600' },
                    { id: 'metrics_dashboard', label: 'Tour de Contrôle', icon: <LayoutDashboard className="w-5 h-5" />, color: 'red-600', border: 'border-red-600' },
                    { id: 'external_tools', label: 'Outils Externes', icon: <Globe className="w-5 h-5" />, color: 'orange-600', border: 'border-orange-600' },
                    { id: 'prompts_moderation', label: 'Prompts', icon: <CheckSquare className="w-5 h-5" />, color: 'orange-600', border: 'border-orange-600' },
                    { id: 'marche_qualification', label: 'Marchés', icon: <Tag className="w-5 h-5" />, color: 'cyan-600', border: 'border-cyan-600' }
                ]).map((tab: any) => (
                    <button 
                      key={tab.id}
                      onClick={() => setActiveView(tab.id as any)}
                      className={`p-4 rounded-xl border transition-all min-w-[130px] text-center ${
                        activeView === tab.id 
                          ? `bg-white ${tab.border} shadow-xl` 
                          : 'bg-white/50 border-slate-200 hover:bg-white'
                      }`}
                    >
                       <div className={`text-xs font-bold uppercase ${activeView === tab.id ? `text-${tab.color}` : 'text-slate-400'}`}>{tab.label}</div>
                       {tab.icon ? <div className="flex justify-center mt-1 text-slate-800">{tab.icon}</div> : <div className="text-2xl font-black text-slate-900">{tab.count}</div>}
                    </button>
                ))}
             </div>
           </div>
        </div>

        {/* ... USERS, DEFIS, MATRIX, QUESTIONS Views ... */}
        {activeView === 'users' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* User Filters Toolbar */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 mb-4 flex flex-col md:flex-row gap-4 items-center shadow-sm">
                <div className="relative w-full md:w-auto">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input type="text" placeholder="Rechercher..." className="w-full md:w-64 bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-900 focus:outline-none focus:border-pilo-green" value={userSearchQuery} onChange={(e) => setUserSearchQuery(e.target.value)} />
                </div>
                <div className="flex gap-3 w-full md:w-auto overflow-x-auto">
                    <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-slate-400" /><select className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm" value={selectedOrgFilter} onChange={(e) => setSelectedOrgFilter(e.target.value)}><option value="All">Toutes organisations</option>{organisations.map(org => <option key={org.id} value={org.id}>{org.nom}</option>)}</select></div>
                    <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-slate-400" /><select className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm" value={userRoleFilter} onChange={(e) => setUserRoleFilter(e.target.value)}><option value="All">Tous rôles</option><option value="user">Membre</option><option value="member_orga">Manager</option><option value="admin_coop">Admin Organisation</option><option value="visitor">Visiteur</option><option value="super_admin">Super Admin</option></select></div>
                    <div className="flex items-center gap-2"><Briefcase className="w-4 h-4 text-slate-400" /><select className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm" value={userFunctionFilter} onChange={(e) => setUserFunctionFilter(e.target.value)}><option value="All">Toutes fonctions</option>{availableFunctions.map(f => <option key={f} value={f}>{f}</option>)}</select></div>
                    <div className="flex items-center gap-2"><Award className="w-4 h-4 text-slate-400" /><select className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm" value={userMaturityFilter} onChange={(e) => setUserMaturityFilter(e.target.value)}><option value="All">Toutes maturités</option><option value="🌱 La Graine">🌱 GRAINE</option><option value="🌿 La Pousse">🌿 POUSSE</option><option value="🌳 L'Arbre">🌳 ARBRE</option><option value="🚜 Le Semeur">🚜 SEMEUR</option></select></div>
                    <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-slate-400" /><select className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm" value={userActivityFilter} onChange={(e) => setUserActivityFilter(e.target.value)}><option value="All">Toute activité</option><option value="7days">7j</option><option value="30days">30j</option><option value="90days">3 mois</option></select></div>
                </div>
                <div className="ml-auto flex items-center gap-4">
                    <button 
                        onClick={() => setIsMagicLinkModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold shadow hover:bg-slate-800 transition-colors"
                    >
                        <Send className="w-4 h-4" /> Envoyer Magic Link
                    </button>
                </div>
            </div>

            {/* Bulk Actions Bar */}
            {selectedUserIds.length > 0 && (
              <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-xl mb-4 flex flex-col md:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-2 duration-200">
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                    {selectedUserIds.length}
                  </div>
                  <span className="text-sm font-bold text-indigo-900">utilisateurs sélectionnés</span>
                  <button 
                    onClick={() => setSelectedUserIds([])}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium underline"
                  >
                    Tout désélectionner
                  </button>
                </div>
                
                <div className="flex items-center gap-3 w-full md:w-auto">
                  <span className="text-sm font-medium text-slate-700 whitespace-nowrap">Assigner à :</span>
                  <select 
                    className="bg-white border border-indigo-200 rounded-lg px-3 py-2 text-sm flex-1 md:flex-none md:w-64"
                    value={bulkOrgId}
                    onChange={(e) => setBulkOrgId(e.target.value)}
                  >
                    <option value="">Choisir une organisation...</option>
                    <option value="none">Aucune organisation</option>
                    {organisations.map(org => (
                      <option key={org.id} value={org.id}>{org.nom}</option>
                    ))}
                  </select>
                  <button 
                    onClick={handleBulkOrgUpdate}
                    disabled={!bulkOrgId || isBulkUpdating}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                  >
                    {isBulkUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Appliquer
                  </button>
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-bold text-slate-500 uppercase">
                        <th className="p-4 w-10">
                          <button 
                            onClick={() => toggleAllUsersSelection(filteredUsers.slice((currentPageUsers - 1) * USERS_PER_PAGE, currentPageUsers * USERS_PER_PAGE))}
                            className="p-1 hover:bg-slate-200 rounded transition-colors"
                          >
                            {filteredUsers.slice((currentPageUsers - 1) * USERS_PER_PAGE, currentPageUsers * USERS_PER_PAGE).every(u => selectedUserIds.includes(u.id)) ? (
                              <CheckSquare className="w-4 h-4 text-indigo-600" />
                            ) : (
                              <div className="w-4 h-4 border-2 border-slate-300 rounded" />
                            )}
                          </button>
                        </th>
                        <th className="p-4 cursor-pointer select-none hover:bg-slate-100/80 transition-colors" onClick={() => handleSort('name')}>
                          <span className="flex items-center gap-1">
                            Utilisateur
                            {renderSortIcon('name')}
                          </span>
                        </th>
                        <th className="p-4 cursor-pointer select-none hover:bg-slate-100/80 transition-colors" onClick={() => handleSort('fonction')}>
                          <span className="flex items-center gap-1">
                            Fonction
                            {renderSortIcon('fonction')}
                          </span>
                        </th>
                        <th className="p-4 cursor-pointer select-none hover:bg-slate-100/80 transition-colors" onClick={() => handleSort('organisation')}>
                          <span className="flex items-center gap-1">
                            Organisation
                            {renderSortIcon('organisation')}
                          </span>
                        </th>
                        <th className="p-4 cursor-pointer select-none hover:bg-slate-100/80 transition-colors" onClick={() => handleSort('role')}>
                          <span className="flex items-center gap-1">
                            Rôle
                            {renderSortIcon('role')}
                          </span>
                        </th>
                        <th className="p-4 cursor-pointer select-none hover:bg-slate-100/80 transition-colors" onClick={() => handleSort('maturity')}>
                          <span className="flex items-center gap-1">
                            Maturité IA
                            {renderSortIcon('maturity')}
                          </span>
                        </th>
                        <th className="p-4 cursor-pointer select-none hover:bg-slate-100/80 transition-colors" onClick={() => handleSort('score')}>
                          <span className="flex items-center gap-1">
                            Score de Maturité
                            {renderSortIcon('score')}
                          </span>
                        </th>
                        <th className="p-4 cursor-pointer select-none hover:bg-slate-100/80 transition-colors" onClick={() => handleSort('updated_at')}>
                          <span className="flex items-center gap-1">
                            Dernière activité
                            {renderSortIcon('updated_at')}
                          </span>
                        </th>
                        <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-slate-100">
                    {filteredUsers.slice((currentPageUsers - 1) * USERS_PER_PAGE, currentPageUsers * USERS_PER_PAGE).map(user => {
                      const isEditing = editingUser === user.id;
                      const userDefisCount = defis.filter(d => d.user_id === user.id).length;
                      const isMember = isUserMember(user);
                      const isSelected = selectedUserIds.includes(user.id);
                      return (
                        <tr key={user.id} className={`hover:bg-slate-50 transition-colors ${isSelected ? 'bg-indigo-50/50' : ''}`}>
                            <td className="p-4">
                              <button 
                                onClick={() => toggleUserSelection(user.id)}
                                className="p-1 hover:bg-slate-200 rounded transition-colors"
                              >
                                {isSelected ? (
                                  <CheckSquare className="w-4 h-4 text-indigo-600" />
                                ) : (
                                  <div className="w-4 h-4 border-2 border-slate-300 rounded" />
                                )}
                              </button>
                            </td>
                            <td className="p-4">
                                <div className="font-bold text-slate-900">{user.prenom} {user.nom}</div>
                                <div className="text-xs text-slate-500">{user.email}</div>
                                <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] text-slate-500"><LayoutDashboard className="w-3 h-3" /> {userDefisCount} défis</div>
                            </td>
                            <td className="p-4"><span className="text-sm text-slate-600 font-medium bg-slate-50 px-2 py-1 rounded border border-slate-100">{user.fonction_profil || '-'}</span></td>
                            <td className="p-4">
                                {isEditing ? (
                                    <select className="bg-white border border-slate-300 rounded px-2 py-1 text-slate-900 w-full max-w-[150px]" value={tempOrg} onChange={(e) => setTempOrg(e.target.value)}>
                                        <option value="">Aucune</option>
                                        {organisations.map(org => (
                                            <option key={org.id} value={org.id}>{org.nom}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <span className="text-sm text-slate-600">{organisations.find(o => o.id === user.organisation_id)?.nom || '-'}</span>
                                )}
                            </td>
                            <td className="p-4">
                                {isEditing ? (
                                    <select className="bg-white border border-slate-300 rounded px-2 py-1 text-slate-900" value={tempRole} onChange={(e) => setTempRole(e.target.value as UserRole)}>
                                        <option value="user">Membre</option>
                                        <option value="member_orga">Manager</option>
                                        <option value="admin_coop">Admin Organisation</option>
                                        <option value="super_admin">Super Admin</option>
                                        <option value="visitor">Visiteur</option>
                                    </select>
                                ) : (
                                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                                        user.role === 'super_admin' ? 'bg-red-100 text-red-700 border-red-200' : 
                                        user.role === 'admin_coop' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 
                                        user.role === 'member_orga' ? 'bg-blue-100 text-blue-700 border-blue-200' : 
                                        isMember ? 'bg-emerald-100 text-pilo-green border-emerald-200' : 
                                        'bg-amber-100 text-pilo-brown border-amber-200'
                                    }`}>
                                        {user.role === 'user' ? 'Membre' : 
                                         user.role === 'visitor' ? 'Visiteur' : 
                                         user.role === 'super_admin' ? 'Super Admin' : 
                                         user.role === 'admin_coop' ? 'Admin Org' : 
                                         user.role === 'member_orga' ? "Manager" : 
                                         user.role}
                                    </span>
                                )}
                            </td>
                            <td className="p-4">{getMaturityBadge(user.maturity_results?.profil_titre)}</td>
                            <td className="p-4">
                              {user.maturity_results?.score_maturite !== undefined && user.maturity_results?.score_maturite !== null ? (
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-800 text-sm">{user.maturity_results.score_maturite}</span>
                                  <span className="text-[10px] text-slate-400 font-medium">/100</span>
                                  <div className="w-12 bg-slate-100 h-1.5 rounded-full overflow-hidden hidden sm:block">
                                    <div 
                                      className={`h-full rounded-full ${
                                        user.maturity_results.score_maturite >= 75 ? 'bg-succes-500' :
                                        user.maturity_results.score_maturite >= 50 ? 'bg-succes-600' :
                                        user.maturity_results.score_maturite >= 25 ? 'bg-amber-500' :
                                        'bg-red-500'
                                      }`}
                                      style={{ width: `${user.maturity_results.score_maturite}%` }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-300 italic text-xs">-</span>
                              )}
                            </td>
                            <td className="p-4 text-slate-500 text-xs">{user.updated_at ? new Date(user.updated_at).toLocaleString() : 'Jamais'}</td>
                            <td className="p-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                    <button 
                                        onClick={() => setViewUserDefisId(user.id)}
                                        className="p-1.5 bg-slate-50 border border-slate-200 text-slate-500 rounded hover:bg-slate-100 hover:text-pilo-brown transition-colors"
                                        title="Voir les défis"
                                    >
                                        <LayoutDashboard className="w-4 h-4" />
                                    </button>
                                    {isEditing ? <button onClick={() => saveEdit(user.id)} className="px-3 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-50 font-bold text-xs flex items-center gap-1"><Check className="w-3 h-3" /> Sauver</button> : <button onClick={() => startEdit(user)} className="px-3 py-1 bg-white border border-slate-200 text-slate-500 rounded hover:bg-slate-50 font-bold text-xs shadow-sm">Éditer</button>}
                                </div>
                            </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <PaginationControls currentPage={currentPageUsers} totalItems={filteredUsers.length} itemsPerPage={USERS_PER_PAGE} onPageChange={setCurrentPageUsers} />
            </div>
          </div>
        )}

        {activeView === 'prompts_moderation' && (
          <GestionPrompts session={session} />
        )}

        {activeView === 'marche_qualification' && (
          <>
            <CouleursMarches />
            <QualificationMarche onDataChange={onDataChange} />
          </>
        )}

        {/* ... (Resources View, Defis View, Matrix View, Questions View remain unchanged) ... */}
        {activeView === 'organisations' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="bg-white p-4 rounded-xl border border-slate-200 mb-8 flex justify-between items-center shadow-sm">
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <Building2 className="w-6 h-6 text-indigo-600" />
                    Gestion des Organisations
                </h2>
                <button 
                    onClick={() => {
                      setEditingOrgId(null);
                      setNewOrgName('');
                      setIsOrgModalOpen(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow hover:bg-indigo-700 transition-colors"
                >
                    <Plus className="w-4 h-4" /> Nouvelle Organisation
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {organisations.map(org => {
                    const orgUsers = users.filter(u => u.organisation_id === org.id);
                    const membersCount = orgUsers.length;
                    const orgUserIds = orgUsers.map(u => u.id);
                    const defisCount = defis.filter(d => orgUserIds.includes(d.user_id)).length;
                    const casUsagesCount = allCasUsages.filter(cu => cu.organisation_id === org.id).length;
                    const hasPublishedCharter = allChartes.some(c => c.organisation_id === org.id && c.status === 'published');

                    return (
                        <div 
                          key={org.id} 
                          onClick={() => {
                            if (onSelectOrg) {
                              onSelectOrg(org.id);
                            }
                          }}
                          className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-lg transition-all cursor-pointer hover:border-indigo-400 flex flex-col justify-between group relative overflow-hidden"
                        >
                            {/* Subtle hover effect background */}
                            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none group-hover:bg-indigo-100/50 transition-colors"></div>
                            
                            <div className="relative z-10 w-full">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                                            <Building2 className="w-5 h-5" />
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{org.nom}</h3>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingOrgId(org.id);
                                                setNewOrgName(org.nom);
                                                setIsOrgModalOpen(true);
                                            }}
                                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                            title="Modifier l'organisation"
                                        >
                                            <Edit className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setDeleteConfirm({ id: org.id, type: 'organisation' });
                                            }}
                                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                            title="Supprimer l'organisation"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                
                                {/* Marché et filière de l'organisation (étape 5c) */}
                                {(() => {
                                    const marcheOrg = referentielMarches.find((m) => m.code === org.marche_code);
                                    const filiereOrg = referentielFilieres.find((f) => f.code === org.filiere_code);
                                    return (
                                        <div className="flex flex-wrap items-center gap-1.5 mb-3">
                                            {marcheOrg ? (
                                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-50 text-slate-700 border border-slate-200">
                                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: marcheOrg.couleur_accent }} />
                                                    {marcheOrg.libelle}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                    Marché à définir
                                                </span>
                                            )}
                                            {filiereOrg && (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-50 text-slate-500 border border-slate-200">
                                                    {filiereOrg.libelle}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })()}

                                {org.description && (
                                    <p className="text-sm text-slate-500 mb-5 line-clamp-2 min-h-[40px]">{org.description}</p>
                                )}
                                
                                {/* Bento-like metrics grid */}
                                <div className="grid grid-cols-2 gap-3 mb-4">
                                    <div className="bg-slate-50/75 p-3 rounded-xl border border-slate-100 flex flex-col justify-between">
                                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                                            <Users className="w-3.5 h-3.5 text-indigo-500" />
                                            <span>Membres</span>
                                        </div>
                                        <div className="text-xl font-black text-slate-800">{membersCount}</div>
                                    </div>
                                    
                                    <div className="bg-slate-50/75 p-3 rounded-xl border border-slate-100 flex flex-col justify-between">
                                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                                            <Target className="w-3.5 h-3.5 text-emerald-500" />
                                            <span>Fiches Défis</span>
                                        </div>
                                        <div className="text-xl font-black text-slate-800">{defisCount}</div>
                                    </div>

                                    <div className="bg-slate-50/75 p-3 rounded-xl border border-slate-100 flex flex-col justify-between">
                                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                                            <BrainCircuit className="w-3.5 h-3.5 text-purple-500" />
                                            <span>Cas d'Usage</span>
                                        </div>
                                        <div className="text-xl font-black text-slate-800">{casUsagesCount}</div>
                                    </div>

                                    <div className="bg-slate-50/75 p-3 rounded-xl border border-slate-100 flex flex-col justify-between">
                                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1.5">
                                            <Award className="w-3.5 h-3.5 text-amber-500" />
                                            <span>Charte IA</span>
                                        </div>
                                        <div>
                                            {hasPublishedCharter ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                    Publiée
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                                                    Non publiée
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="text-[10px] text-slate-400 border-t border-slate-100 pt-3 flex justify-between items-center relative z-10 w-full mt-2">
                                <span>Créée le {new Date(org.created_at).toLocaleDateString()}</span>
                                <span className="text-indigo-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                                    Accéder à l'espace <ChevronRight className="w-3.5 h-3.5" />
                                </span>
                            </div>
                        </div>
                    );
                })}
                {organisations.length === 0 && (
                    <div className="col-span-full text-center py-12 bg-white rounded-xl border border-slate-200">
                        <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-slate-900 mb-2">Aucune organisation</h3>
                        <p className="text-slate-500 mb-4">Commencez par créer une organisation pour y ajouter des membres.</p>
                        <button 
                            onClick={() => {
                              setEditingOrgId(null);
                              setNewOrgName('');
                              setIsOrgModalOpen(true);
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow hover:bg-indigo-700 transition-colors"
                        >
                            <Plus className="w-4 h-4" /> Créer une organisation
                        </button>
                    </div>
                )}
            </div>
          </div>
        )}

        {activeView === 'resources' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* ... Resource View content ... */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 mb-8 flex flex-col md:flex-row gap-4 items-center shadow-sm">
                    <div className="relative w-full md:w-auto">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input type="text" placeholder="Rechercher un contenu..." className="w-full md:w-64 bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-900 focus:outline-none focus:border-purple-500" value={resourceSearch} onChange={(e) => setResourceSearch(e.target.value)} />
                    </div>
                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <Filter className="w-4 h-4 text-slate-400" />
                        <select className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm cursor-pointer" value={resourceTypeFilter} onChange={(e) => setResourceTypeFilter(e.target.value)}>
                            <option value="All">Tous les types</option>
                            {RESOURCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        {/* Filtre marché : indispensable dès que les actualités
                            des trois marchés arrivent dans la même liste. */}
                        <select className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm cursor-pointer" value={resourceMarcheFilter} onChange={(e) => setResourceMarcheFilter(e.target.value)}>
                            <option value="All">Tous les marchés</option>
                            {referentielMarches.map(m => <option key={m.code} value={m.code}>{m.libelle}</option>)}
                            <option value="transverse">Transverse (aucun marché)</option>
                            <option value="a_qualifier">À qualifier</option>
                        </select>
                    </div>
                    <div className="ml-auto">
                        <button onClick={() => handleOpenResourceModal()} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-bold shadow-lg transition-all">
                            <Plus className="w-4 h-4" /> Ajouter un contenu
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredResources.slice((currentPageResources - 1) * CARDS_PER_PAGE, currentPageResources * CARDS_PER_PAGE).map(res => (
                        <div key={res.id} className={`group bg-white rounded-xl border p-5 hover:shadow-xl transition-all relative overflow-hidden flex flex-col ${res.published ? 'border-slate-200' : 'border-slate-300 bg-slate-50/50'}`}>
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex gap-2">
                                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${
                                        res.type === 'tool' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                        res.type === 'news' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                        res.type === 'usecase' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                        res.type === 'agent' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                                        res.type === 'learning' ? 'bg-teal-50 text-teal-700 border-teal-200' :
                                        res.type === 'elearning' ? 'bg-cyan-50 text-cyan-700 border-cyan-200' :
                                        'bg-slate-50 text-slate-600 border-slate-200'
                                    }`}>
                                        {RESOURCE_TYPES.find(t => t.value === res.type)?.label || res.type}
                                    </span>
                                    {/* PUBLICATION STATUS BADGE */}
                                    {res.published ? (
                                        <span className="px-2 py-1 rounded text-[10px] font-bold uppercase border bg-green-50 text-green-700 border-green-200 flex items-center gap-1">
                                            <Globe className="w-3 h-3" /> Publié
                                        </span>
                                    ) : (
                                        <span className="px-2 py-1 rounded text-[10px] font-bold uppercase border bg-slate-200 text-slate-600 border-slate-300 flex items-center gap-1">
                                            <EyeOff className="w-3 h-3" /> Brouillon
                                        </span>
                                    )}
                                    {/* Marché(s) du contenu : vide = transverse, visible partout */}
                                    {(Array.isArray(res.marches) && res.marches.length > 0) ? (
                                        res.marches.map((code) => {
                                            const m = referentielMarches.find((x) => x.code === code);
                                            return (
                                                <span
                                                    key={code}
                                                    className="px-2 py-1 rounded text-[10px] font-bold uppercase border bg-white flex items-center gap-1"
                                                    style={{ color: m?.couleur_accent, borderColor: m?.couleur_accent }}
                                                    title={`Marché : ${m?.libelle || code}`}
                                                >
                                                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m?.couleur_accent || '#94a3b8' }} />
                                                    {m?.libelle || code}
                                                </span>
                                            );
                                        })
                                    ) : (
                                        <span className="px-2 py-1 rounded text-[10px] font-bold uppercase border bg-slate-50 text-slate-500 border-slate-200" title="Aucun marché : visible sur les trois">
                                            Transverse
                                        </span>
                                    )}
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => handleOpenResourceModal(res)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit className="w-4 h-4" /></button>
                                    <button onClick={() => handleDeleteResource(res.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            </div>
                            
                            <div className="flex gap-4 items-start">
                                {res.image_url && <img src={res.image_url} alt="" className={`w-12 h-12 rounded-lg object-cover border border-slate-100 shrink-0 ${!res.published ? 'grayscale opacity-60' : ''}`} />}
                                <div>
                                    <h4 className="font-bold text-slate-900 text-sm mb-1 line-clamp-2">{res.title}</h4>
                                    <p className="text-xs text-slate-500 line-clamp-2">{res.description}</p>
                                </div>
                            </div>

                            <div className="mt-auto pt-4 flex flex-wrap gap-1">
                                {res.type === 'tool' && res.metadata?.tagsOutilsIA?.slice(0, 3).map((t:string,i:number) => <span key={i} className="text-[9px] px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded border border-emerald-100">{t}</span>)}
                                {res.type === 'agent' && (res.metadata?.tagsMetiers || res.metadata?.tags || []).slice(0, 3).map((t:string,i:number) => <span key={i} className="text-[9px] px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded border border-indigo-100">{t}</span>)}
                                {res.type === 'usecase' && res.metadata?.tagsMetiers?.slice(0, 3).map((t:string,i:number) => <span key={i} className="text-[9px] px-2 py-0.5 bg-amber-50 text-amber-700 rounded border border-amber-100">{t}</span>)}
                                {res.type === 'news' && res.metadata?.tagsOutilsIA?.slice(0, 3).map((t:string,i:number) => <span key={i} className="text-[9px] px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-100">{t}</span>)}
                                {res.type === 'data' && res.metadata?.tags?.slice(0, 3).map((t:string,i:number) => <span key={i} className="text-[9px] px-2 py-0.5 bg-slate-50 text-slate-600 rounded border border-slate-100">{t}</span>)}
                                {res.type === 'learning' && res.metadata?.publics?.slice(0, 2).map((t:string,i:number) => <span key={i} className="text-[9px] px-2 py-0.5 bg-teal-50 text-teal-700 rounded border border-teal-100">{t}</span>)}
                                {(res.type === 'elearning' || (res.type === 'learning' && res.metadata?.nature)) && <span className="text-[9px] px-2 py-0.5 bg-cyan-50 text-cyan-700 rounded border border-cyan-100">{res.metadata?.nature || 'ebook'}</span>}
                            </div>
                        </div>
                    ))}
                </div>
                <PaginationControls currentPage={currentPageResources} totalItems={filteredResources.length} itemsPerPage={CARDS_PER_PAGE} onPageChange={setCurrentPageResources} />
            </div>
        )}

        {/* --- DEFIS VIEW --- */}
        {activeView === 'defis' && (
           <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
             <div className="bg-white p-4 rounded-xl border border-slate-200 mb-8 flex flex-col xl:flex-row gap-4 items-center shadow-sm">
                 <div className="relative w-full xl:w-auto">
                     <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                     <input type="text" placeholder="Chercher un défi..." className="w-full xl:w-80 bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-900 focus:outline-none focus:border-pilo-green" value={defiSearchQuery} onChange={(e) => setDefiSearchQuery(e.target.value)} />
                 </div>
                 <div className="flex gap-3 w-full xl:w-auto overflow-x-auto">
                    <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-slate-400" /><select className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm" value={selectedOrgFilter} onChange={(e) => setSelectedOrgFilter(e.target.value)}><option value="All">Toutes organisations</option>{organisations.map(org => <option key={org.id} value={org.id}>{org.nom}</option>)}</select></div>
                    <div className="flex items-center gap-2"><LayoutDashboard className="w-4 h-4 text-slate-400" /><select className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm" value={defiQuadrantFilter} onChange={(e) => setDefiQuadrantFilter(e.target.value)}><option value="Tous">Toutes matrices</option>{quadrants.filter(q => q !== 'Tous').map(q => <option key={q} value={q}>{q}</option>)}</select></div>
                    {/* ROI FILTER */}
                    <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-slate-400" />
                        <select 
                            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm" 
                            value={defiRoiFilter} 
                            onChange={(e) => setDefiRoiFilter(e.target.value)}
                        >
                            <option value="All">Tout ROI</option>
                            <option value="High">Haut (&gt;70)</option>
                            <option value="Medium">Moyen (40-70)</option>
                            <option value="Low">Faible (&lt;40)</option>
                        </select>
                    </div>
                    {/* COMPLEXITY FILTER */}
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-slate-400" />
                        <select 
                            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm" 
                            value={defiComplexityFilter} 
                            onChange={(e) => setDefiComplexityFilter(e.target.value)}
                        >
                            <option value="All">Toute Complexité</option>
                            <option value="High">Haute (&gt;70)</option>
                            <option value="Medium">Moyenne (40-70)</option>
                            <option value="Low">Faible (&lt;40)</option>
                        </select>
                    </div>
                    {/* DATE RANGE FILTER */}
                    <div className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <span className="text-xs font-bold text-slate-400">Du</span>
                        <input 
                            type="date" 
                            className="bg-transparent text-sm text-slate-600 focus:outline-none w-28"
                            value={defiStartDate}
                            onChange={(e) => setDefiStartDate(e.target.value)}
                        />
                        <span className="text-xs font-bold text-slate-400">Au</span>
                        <input 
                            type="date" 
                            className="bg-transparent text-sm text-slate-600 focus:outline-none w-28"
                            value={defiEndDate}
                            onChange={(e) => setDefiEndDate(e.target.value)}
                        />
                    </div>
                 </div>
                 <div className="ml-auto flex items-center gap-4">
                    <button onClick={handleExportDefis} className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold border border-emerald-100 hover:bg-emerald-100 transition-colors"><Download className="w-4 h-4" /> Exporter</button>
                 </div>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredDefis.slice((currentPageDefis - 1) * CARDS_PER_PAGE, currentPageDefis * CARDS_PER_PAGE).map(d => {
                  const { name, isMember } = getUserDetails(d.user_id);
                  return (
                    <div key={d.id} onClick={() => setSelectedDefi(d)} className={`group bg-white rounded-xl border p-5 cursor-pointer hover:shadow-2xl hover:-translate-y-1 transition-all relative overflow-hidden ${isMember ? 'border-pilo-green/30 hover:border-pilo-green' : 'border-pilo-brown/30 hover:border-pilo-brown'}`}>
                       <div className="absolute top-0 right-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">{isMember ? <UserCheck className="w-24 h-24 text-pilo-green" /> : <Globe className="w-24 h-24 text-pilo-brown" />}</div>
                       <div className="relative z-10">
                          <div className="flex justify-between items-start mb-3">
                             <div className="flex flex-col">
                                <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1 ${isMember ? 'text-pilo-green' : 'text-pilo-brown'}`}>{isMember ? <UserCheck className="w-3 h-3" /> : <Globe className="w-3 h-3" />}{isMember ? "Membre" : "Visiteur Web"}</div>
                                <div className="text-xs text-slate-500 font-medium">{name}</div>
                             </div>
                             <span className="text-[10px] font-bold text-slate-400 border border-slate-100 px-2 py-1 rounded bg-slate-50">{new Date(d.created_at).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-start justify-between gap-2 mb-2">
                             <h4 className={`font-bold text-lg line-clamp-2 transition-colors flex-1 ${isMember ? 'text-slate-800 group-hover:text-pilo-green' : 'text-slate-800 group-hover:text-pilo-brown'}`}>{d.titreDefi || "Analyse en cours..."}</h4>
                             <button 
                                onClick={(e) => {
                                   e.stopPropagation();
                                   setSelectedDefi(d);
                                   setEditTitleValue(d.titreDefi || '');
                                   setIsEditingTitle(true);
                                }}
                                className="p-1 text-slate-400 hover:text-pilo-green hover:bg-slate-100 rounded transition-colors shrink-0"
                                title="Modifier le titre"
                             >
                                <Edit3 className="w-4 h-4" />
                             </button>
                          </div>
                          <p className="text-slate-500 text-sm mb-4 line-clamp-3">{d.probleme}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-auto">
                            {d.quadrant ? (
                              <>
                                <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase border ${d.quadrant.includes('Gains Rapides') ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : d.quadrant.includes('Majeurs') ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-slate-50 text-slate-600 border-slate-100'}`}>{d.quadrant}</span>
                                {d.score_roi && <span className="text-[10px] px-2 py-1 bg-slate-50 border border-slate-100 text-slate-600 rounded font-bold">ROI: {d.score_roi}</span>}
                                {d.score_complexite && <span className="text-[10px] px-2 py-1 bg-slate-50 border border-slate-100 text-orange-600 rounded font-bold">CPLX: {d.score_complexite}</span>}
                              </>
                            ) : <span className="text-[10px] px-2 py-1 bg-yellow-50 text-yellow-700 border border-yellow-100 rounded font-bold uppercase animate-pulse flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> En cours</span>}
                          </div>
                       </div>
                    </div>
                  );
                })}
             </div>
             <PaginationControls currentPage={currentPageDefis} totalItems={filteredDefis.length} itemsPerPage={CARDS_PER_PAGE} onPageChange={setCurrentPageDefis} />
           </div>
        )}

        {/* --- MATRIX VIEW --- */}
        {activeView === 'matrix' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <MatriceIAView
                    defis={defis}
                    onSelectDefi={(d) => setSelectedDefi(d)}
                    onUpdateDefiCollective={handleUpdateCollectiveMatrix}
                    organisations={organisations}
                    getUserDetails={getUserDetails}
                />
            </div>
        )}

        {/* --- STRATEGIC ALIGNMENT VIEW (NEW) --- */}
        {activeView === 'alignment' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                    {/* Left Panel: Configuration */}
                    <div className="xl:col-span-1 space-y-6">
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm sticky top-8">
                            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <LayoutTemplate className="w-5 h-5 text-emerald-600" />
                                Configuration
                            </h2>
                            
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">
                                        Politique Interne Cible
                                    </label>
                                    <textarea 
                                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm text-slate-700 min-h-[150px] resize-none"
                                        placeholder="Décrivez ici les objectifs stratégiques, les valeurs ou la vision de l'entreprise (ex: Réduire l'empreinte carbone de 30%...)"
                                        value={internalPolicy}
                                        onChange={(e) => setInternalPolicy(e.target.value)}
                                    />
                                </div>

                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <div className="flex justify-between items-center text-sm font-medium text-slate-600 mb-2">
                                        <span>Défis sélectionnés</span>
                                        <span className="font-bold text-emerald-600">{selectedDefiIds.length}</span>
                                    </div>
                                    <p className="text-xs text-slate-400">
                                        Cochez les cartes dans la liste à droite pour les inclure dans l'analyse.
                                    </p>
                                </div>

                                <button 
                                    onClick={handleGenerateAlignment}
                                    disabled={isGeneratingMatrix || selectedDefiIds.length === 0 || !internalPolicy.trim()}
                                    className="w-full py-4 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isGeneratingMatrix ? (
                                        <>
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            Analyse IA en cours...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-5 h-5" />
                                            Générer la Matrice
                                        </>
                                    )}
                                </button>
                                {alignmentResults.length > 0 && (
                                    <button 
                                        onClick={() => { setAlignmentResults([]); setSelectedDefiIds([]); }}
                                        className="w-full py-2 text-slate-400 text-xs font-bold hover:text-red-500 transition-colors"
                                    >
                                        Réinitialiser l'analyse
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right Panel: Selection List OR Results */}
                    <div className="xl:col-span-2 space-y-8">
                        
                        {/* RESULTS SECTION */}
                        {alignmentResults.length > 0 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-top-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                                        <Target className="w-6 h-6" />
                                    </div>
                                    <h2 className="text-2xl font-black text-slate-900">Résultats de l'Alignement</h2>
                                </div>

                                <div className="grid grid-cols-1 gap-4">
                                    {alignmentResults.map((res, idx) => (
                                        <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-lg relative overflow-hidden">
                                            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none"></div>
                                            
                                            <div className="relative z-10">
                                                <h3 className="text-lg font-bold text-slate-900 mb-4">{res.titre_defi || "Défi"}</h3>
                                                
                                                {res.matrice_sur_mesure ? (
                                                <>
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1">Alignement Stratégique</span>
                                                        <div className="flex items-end gap-2">
                                                            <span className="text-3xl font-black text-emerald-600">{res.matrice_sur_mesure.score_alignement_strategique ?? "?"}</span>
                                                            <span className="text-sm text-slate-400 mb-1">/100</span>
                                                        </div>
                                                        <div className="w-full h-2 bg-slate-200 rounded-full mt-2 overflow-hidden">
                                                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${res.matrice_sur_mesure.score_alignement_strategique || 0}%` }}></div>
                                                        </div>
                                                    </div>

                                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1">Complexité</span>
                                                        <div className="flex items-end gap-2">
                                                            <span className="text-3xl font-black text-orange-500">{res.matrice_sur_mesure.score_complexite ?? "?"}</span>
                                                            <span className="text-sm text-slate-400 mb-1">/100</span>
                                                        </div>
                                                        <div className="w-full h-2 bg-slate-200 rounded-full mt-2 overflow-hidden">
                                                            <div className="h-full bg-orange-500 rounded-full" style={{ width: `${res.matrice_sur_mesure.score_complexite || 0}%` }}></div>
                                                        </div>
                                                    </div>

                                                    <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 flex flex-col justify-center text-center">
                                                        <span className="text-xs font-bold text-emerald-800 uppercase tracking-widest block mb-1">Positionnement</span>
                                                        <span className="text-lg font-black text-emerald-700 leading-tight">{res.matrice_sur_mesure.quadrant_nom || "N/A"}</span>
                                                    </div>
                                                </div>

                                                <div className="bg-slate-50 p-4 rounded-xl border-l-4 border-emerald-400 italic text-slate-600 text-sm mb-4">
                                                    "{res.matrice_sur_mesure.justification || "Pas de justification"}"
                                                </div>

                                                <button
                                                    onClick={() => saveAlignmentToDefi(res)}
                                                    disabled={savingAlignmentIds.includes(res.diagnostic_id)}
                                                    className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                                >
                                                    {savingAlignmentIds.includes(res.diagnostic_id) ? (
                                                        <>
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                            Sauvegarde...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Save className="w-4 h-4" />
                                                            Sauvegarder dans la fiche
                                                        </>
                                                    )}
                                                </button>
                                                </>
                                                ) : (
                                                    <div className="text-red-500 italic">Données d'analyse manquantes pour ce résultat.</div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* SELECTION LIST */}
                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold text-slate-700">Sélectionner les défis à analyser</h3>
                                <div className="relative">
                                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                    <input 
                                        type="text" 
                                        placeholder="Filtrer la liste..." 
                                        className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
                                        value={defiSearchQuery}
                                        onChange={(e) => setDefiSearchQuery(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[600px] overflow-y-auto pr-2">
                                {filteredDefis.map(d => {
                                    const isSelected = selectedDefiIds.includes(d.id);
                                    return (
                                        <div 
                                            key={d.id}
                                            onClick={() => handleToggleDefiSelection(d.id)}
                                            className={`p-4 rounded-xl border cursor-pointer transition-all relative group ${
                                                isSelected 
                                                ? 'bg-emerald-50 border-emerald-500 shadow-md' 
                                                : 'bg-white border-slate-200 hover:border-emerald-300'
                                            }`}
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-slate-300'}`}>
                                                        {isSelected && <Check className="w-3 h-3 text-white" />}
                                                    </div>
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                        {new Date(d.created_at).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                {d.quadrant && <span className="text-[10px] px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-600 font-bold">{d.quadrant}</span>}
                                            </div>
                                            
                                            <h4 className={`font-bold text-sm mb-1 line-clamp-2 ${isSelected ? 'text-emerald-900' : 'text-slate-800'}`}>
                                                {d.titreDefi || "Analyse en cours..."}
                                            </h4>
                                            <p className={`text-xs line-clamp-2 ${isSelected ? 'text-emerald-700' : 'text-slate-500'}`}>
                                                {d.probleme}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* --- QUESTIONS VIEW --- */}
        {activeView === 'questions' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-4xl mx-auto">
                <div className="bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">
                    <div className="p-6 space-y-4">
                        <div className="space-y-3">
                            {questions.map((q, index) => (
                                <div key={q.id} className="group bg-white border border-slate-200 p-4 rounded-lg flex flex-col gap-4 hover:border-blue-300 transition-all shadow-sm">
                                    <div className="flex items-center gap-4">
                                        <div className="flex flex-col gap-1">
                                            <button onClick={() => handleMoveQuestion(index, 'up')} disabled={index === 0} className="text-slate-400 hover:text-blue-600 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                                            <button onClick={() => handleMoveQuestion(index, 'down')} disabled={index === questions.length - 1} className="text-slate-400 hover:text-blue-600 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                                        </div>
                                        <div className="flex-grow">
                                            {editingQuestionId === q.id ? (
                                                <div className="flex flex-col gap-3">
                                                    <input type="text" className="w-full border border-blue-300 rounded px-3 py-2 text-sm" value={editingQuestionText} onChange={(e) => setEditingQuestionText(e.target.value)} />
                                                    <div className="flex items-center gap-4"><label className="flex items-center gap-2 text-sm"><input type="radio" checked={editingQuestionType === 'text'} onChange={() => setEditingQuestionType('text')} /> Texte</label><label className="flex items-center gap-2 text-sm"><input type="radio" checked={editingQuestionType === 'choice'} onChange={() => setEditingQuestionType('choice')} /> Choix</label></div>
                                                    {editingQuestionType === 'choice' && (
                                                        <div className="bg-slate-50 p-3 rounded-lg"><div className="flex gap-2 mb-2"><input type="text" className="flex-grow border rounded px-2 py-1 text-sm" value={editingOptionInput} onChange={(e) => setEditingOptionInput(e.target.value)} /><button onClick={() => handleAddOption(true)} className="px-3 py-1 bg-slate-200 rounded text-xs font-bold">Ajouter</button></div><div>{editingQuestionOptions.map((opt, i) => (<div key={i} className="flex justify-between bg-white px-2 py-1 rounded text-sm mb-1"><span>{opt}</span><button onClick={() => removeOption(i, true)}><X className="w-3 h-3 text-red-400" /></button></div>))}</div></div>
                                                    )}
                                                    <div className="flex gap-2 mt-2"><button onClick={() => handleEditQuestionSave(q.id)} className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm font-bold">Enregistrer</button><button onClick={() => setEditingQuestionId(null)} className="px-3 py-1 bg-slate-100 rounded text-sm">Annuler</button></div>
                                                </div>
                                            ) : (
                                                <div className="flex items-start justify-between">
                                                    <div><span className="font-medium text-slate-700 block mb-1">{q.question_text}</span><span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded">{q.question_type}</span></div>
                                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100">
                                                      <button onClick={() => handleEditQuestionStart(q)} className="text-xs font-bold text-blue-600">Modifier</button>
                                                      <button type="button" onClick={(e) => handleDeleteQuestion(q.id, e)} className="p-1 text-red-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        
                        <div className="mt-6 pt-6 border-t bg-slate-50 p-6 rounded-xl">
                            <h3 className="text-sm font-bold mb-4">Ajouter une question</h3>
                            <div className="space-y-4">
                                <input 
                                    type="text" 
                                    className="w-full px-4 py-2 border rounded-lg text-sm" 
                                    placeholder="Intitulé de la question..." 
                                    value={newQuestionText} 
                                    onChange={(e) => setNewQuestionText(e.target.value)} 
                                />

                                <div className="flex items-center gap-6">
                                    <label className="flex items-center gap-2 text-sm text-slate-700 font-medium cursor-pointer">
                                        <input 
                                            type="radio" 
                                            name="newQType" 
                                            checked={newQuestionType === 'text'} 
                                            onChange={() => setNewQuestionType('text')} 
                                            className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                                        />
                                        Réponse libre (Texte)
                                    </label>
                                    <label className="flex items-center gap-2 text-sm text-slate-700 font-medium cursor-pointer">
                                        <input 
                                            type="radio" 
                                            name="newQType" 
                                            checked={newQuestionType === 'choice'} 
                                            onChange={() => setNewQuestionType('choice')} 
                                            className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                                        />
                                        Choix multiples
                                    </label>
                                </div>

                                {newQuestionType === 'choice' && (
                                    <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm animate-in fade-in slide-in-from-top-2">
                                        <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Options de réponse</label>
                                        <div className="flex gap-2 mb-3">
                                            <input 
                                                type="text" 
                                                className="flex-grow border rounded-lg px-3 py-2 text-sm" 
                                                placeholder="Ajouter une option..." 
                                                value={currentOptionInput} 
                                                onChange={(e) => setCurrentOptionInput(e.target.value)} 
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        handleAddOption(false);
                                                    }
                                                }}
                                            />
                                            <button 
                                                onClick={() => handleAddOption(false)} 
                                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-700 transition-colors"
                                            >
                                                Ajouter
                                            </button>
                                        </div>
                                        
                                        {newQuestionOptions.length > 0 ? (
                                            <ul className="space-y-2">
                                                {newQuestionOptions.map((opt, i) => (
                                                    <li key={i} className="flex justify-between items-center bg-slate-50 px-3 py-2 rounded text-sm border border-slate-100">
                                                        <span className="font-medium text-slate-700">{opt}</span>
                                                        <button onClick={() => removeOption(i, false)} className="text-slate-400 hover:text-red-500 transition-colors">
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="text-xs text-slate-400 italic text-center py-2">Aucune option ajoutée pour le moment.</p>
                                        )}
                                    </div>
                                )}

                                <button 
                                    onClick={handleAddQuestion} 
                                    disabled={!newQuestionText.trim() || (newQuestionType === 'choice' && newQuestionOptions.length < 1)} 
                                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
                                >
                                    Enregistrer la question
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {activeView === 'external_tools' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-4xl mx-auto">
                <div className="bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden p-8">
                    <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
                        <Globe className="w-6 h-6 text-orange-600" />
                        Outils Externes
                    </h2>
                    <p className="text-slate-600 mb-8">
                        Accédez rapidement aux différents outils de gestion et d'analyse de la plateforme PiloTerra.
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <a 
                            href="https://piloterra-scope.lovable.app/" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="group bg-slate-50 border border-slate-200 p-6 rounded-2xl hover:border-orange-400 hover:shadow-lg transition-all flex flex-col items-start gap-4"
                        >
                            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Target className="w-6 h-6 text-orange-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 mb-1 group-hover:text-orange-600 transition-colors">PiloTerra Scope</h3>
                                <p className="text-sm text-slate-500">Outil de scoping et de gestion de projet.</p>
                            </div>
                            <div className="mt-auto pt-4 flex items-center gap-2 text-sm font-bold text-orange-600">
                                Ouvrir l'outil <ExternalLink className="w-4 h-4" />
                            </div>
                        </a>

                        <a 
                            href="https://analytics.google.com/analytics/web/?hl=fr#/a314212414p441591115/reports/reportinghub?params=_u..nav%3Dmaui" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="group bg-slate-50 border border-slate-200 p-6 rounded-2xl hover:border-blue-400 hover:shadow-lg transition-all flex flex-col items-start gap-4"
                        >
                            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                <BarChart2 className="w-6 h-6 text-blue-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 mb-1 group-hover:text-blue-600 transition-colors">Google Analytics</h3>
                                <p className="text-sm text-slate-500">Tableau de bord de suivi du trafic et de l'engagement.</p>
                            </div>
                            <div className="mt-auto pt-4 flex items-center gap-2 text-sm font-bold text-blue-600">
                                Ouvrir l'outil <ExternalLink className="w-4 h-4" />
                            </div>
                        </a>
                    </div>
                </div>
            </div>
        )}

        {activeView === 'metrics_dashboard' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-8">
                {/* Filters Bar */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-slate-400" />
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                            {[
                                { id: '1j', label: '24h' },
                                { id: '7j', label: '7j' },
                                { id: '30j', label: '30j' },
                                { id: 'overall', label: 'Global' },
                                { id: 'custom', label: 'Sur-mesure' }
                            ].map((range) => (
                                <button
                                    key={range.id}
                                    onClick={() => setMetricsTimeRange(range.id as any)}
                                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${metricsTimeRange === range.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    {range.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {metricsTimeRange === 'custom' && (
                        <div className="flex items-center gap-3 animate-in fade-in slide-in-from-left-2 duration-200">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">Du</span>
                                <input 
                                    type="date" 
                                    value={metricsStartDate}
                                    onChange={(e) => setMetricsStartDate(e.target.value)}
                                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">Au</span>
                                <input 
                                    type="date" 
                                    value={metricsEndDate}
                                    onChange={(e) => setMetricsEndDate(e.target.value)}
                                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <button 
                                onClick={() => { setMetricsStartDate(''); setMetricsEndDate(''); }}
                                className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                                title="Réinitialiser"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        <Tag className="w-5 h-5 text-slate-400" />
                        <select
                            value={metricsMarche}
                            onChange={(e) => setMetricsMarche(e.target.value)}
                            className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                            title="Filtre les graphiques de coûts et de carbone IA ; met le marché en avant dans le tableau"
                        >
                            <option value="tous">Tous les marchés</option>
                            {referentielMarches.map((m) => (
                                <option key={m.code} value={m.code}>{m.libelle}</option>
                            ))}
                            <option value="sans_marche">Sans marché</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                        <button
                            onClick={downloadMetricsCSV}
                            className="px-4 py-1.5 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-900 transition-all flex items-center gap-2 shadow-lg shadow-slate-900/10"
                        >
                            <Download className="w-4 h-4" />
                            Exporter CSV
                        </button>
                        <div className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-bold uppercase border border-emerald-100 flex items-center gap-1">
                            <Activity className="w-3 h-3" />
                            Live Data
                        </div>
                    </div>
                </div>

                {/* Activité par marché (étape 10) : calculée en base, même période */}
                <ReportingMarches
                    plage={metricsTimeRange}
                    debutPerso={metricsStartDate}
                    finPerso={metricsEndDate}
                    marcheFiltre={metricsMarche}
                />

                {metricsMarche !== 'tous' && (
                    <p className="text-xs text-slate-500 -mb-2">
                        Coûts et carbone ci-dessous filtrés sur ce marché (appels IA et navigation des comptes connectés).
                    </p>
                )}

                {/* Header Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                                <Coins className="w-6 h-6 text-red-600" />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase">Coût Total API</p>
                                <p className="text-2xl font-black text-slate-800">${metricsData?.totalCost.toFixed(2)}</p>
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1 text-xs text-slate-500">
                                <TrendingUp className="w-3 h-3 text-emerald-500" />
                                <span>En temps réel</span>
                            </div>
                            {metricsData && (
                                <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${metricsData.trends.cost > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                    {metricsData.trends.cost > 0 ? '+' : ''}{metricsData.trends.cost.toFixed(1)}%
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                                <Leaf className="w-6 h-6 text-emerald-600" />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase">Impact Carbone</p>
                                <p className="text-2xl font-black text-slate-800">{(metricsData?.totalCarbon || 0).toFixed(1)}g <span className="text-sm font-normal text-slate-400">CO2eq</span></p>
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1 text-xs text-slate-500">
                                <Activity className="w-3 h-3 text-blue-500" />
                                <span>Agents + Infra</span>
                            </div>
                            {metricsData && (
                                <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${metricsData.trends.carbon > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                    {metricsData.trends.carbon > 0 ? '+' : ''}{metricsData.trends.carbon.toFixed(1)}%
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                                <Zap className="w-6 h-6 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase">Volume Requêtes</p>
                                <p className="text-2xl font-black text-slate-800">{metricsData?.totalRequests}</p>
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1 text-xs text-slate-500">
                                <CheckSquare className="w-3 h-3 text-emerald-500" />
                                <span>Défis analysés</span>
                            </div>
                            {metricsData && (
                                <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${metricsData.trends.requests > 0 ? 'bg-succes-50 text-succes-600' : 'bg-red-50 text-red-600'}`}>
                                    {metricsData.trends.requests > 0 ? '+' : ''}{metricsData.trends.requests.toFixed(1)}%
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                                <Building2 className="w-6 h-6 text-indigo-600" />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase">Coût Moyen / Org</p>
                                <p className="text-2xl font-black text-slate-800">${metricsData?.avgCostPerOrg.toFixed(2)}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                            <Users className="w-3 h-3 text-slate-400" />
                            <span>{organisations.length} organisations B2B</span>
                        </div>
                    </div>
                </div>

                {/* Charts Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Daily Cost Evolution */}
                    <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                        <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-red-600" />
                            Évolution des Coûts API ({metricsData?.useHourly ? '24h' : 'Période'})
                        </h3>
                        <div className="h-[300px] w-full">
                            {metricsData?.timeSeriesChart.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400 italic text-sm">
                                    <BarChart2 className="w-8 h-8 mb-2 opacity-20" />
                                    Aucune donnée sur cette période
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={metricsData?.timeSeriesChart}>
                                        <defs>
                                            <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                                                <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} tickFormatter={(value) => `$${value}`} />
                                        <Tooltip 
                                            contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                            labelStyle={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}
                                        />
                                        <Area type="monotone" dataKey="cost" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorCost)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>

                    {/* Cost by Model */}
                    <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                        <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                            <BrainCircuit className="w-5 h-5 text-blue-600" />
                            Répartition des Coûts par Modèle
                        </h3>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={metricsData?.costByModelChart} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 'bold', fill: '#475569'}} width={100} />
                                    <Tooltip 
                                        cursor={{fill: '#f8fafc'}}
                                        contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                                    />
                                    <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Carbon Impact by Source */}
                    <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                        <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                            <Leaf className="w-5 h-5 text-emerald-600" />
                            Impact Carbone par Source
                        </h3>
                        <div className="h-[300px] w-full flex items-center justify-center">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={metricsData?.carbonBySource}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {metricsData?.carbonBySource.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : '#3b82f6'} />
                                        ))}
                                    </Pie>
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                                    />
                                    <Legend verticalAlign="bottom" height={36}/>
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Efficiency Comparison */}
                    <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                        <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                            <Award className="w-5 h-5 text-purple-600" />
                            Efficacité des Modèles (Coût/Requête)
                        </h3>
                        <div className="space-y-4">
                            {[...(metricsData?.costByModelChart || [])].sort((a, b) => b.value - a.value).map((model, idx) => {
                                const modelRequests = metricsData.filteredAgentMetrics.filter((m: any) => m.model === model.name).length;
                                const costPerReq = modelRequests > 0 ? (model.value / modelRequests) : 0;
                                return (
                                    <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center border border-slate-200 font-bold text-xs text-slate-600">
                                                {idx + 1}
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-800 text-sm">{model.name}</p>
                                                <p className="text-[10px] text-slate-400 uppercase font-bold">{modelRequests} requêtes</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-black text-slate-900">${costPerReq.toFixed(4)}</p>
                                            <p className="text-[10px] text-slate-400 uppercase font-bold">par requête</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        )}

      </div>

      {/* MAGIC LINK MODAL */}
      {isMagicLinkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Send className="w-5 h-5 text-emerald-600" />
                        Envoyer un Magic Link
                    </h3>
                    <button onClick={() => setIsMagicLinkModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-6">
                    <p className="text-sm text-slate-600 mb-4">
                        Cela enverra un lien de connexion direct à l'email spécifié. Si l'utilisateur n'existe pas, un compte sera créé.
                    </p>
                    <form onSubmit={handleSendMagicLink}>
                        <div className="mb-4">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email du destinataire</label>
                            <input 
                                type="email" 
                                required
                                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                placeholder="nom@exemple.com"
                                value={magicLinkEmail}
                                onChange={(e) => setMagicLinkEmail(e.target.value)}
                            />
                        </div>
                        
                        {magicLinkStatus === 'error' && (
                            <div className="mb-4 p-3 bg-red-50 text-red-600 text-xs rounded border border-red-100">
                                {magicLinkError}
                            </div>
                        )}

                        {magicLinkStatus === 'success' && (
                            <div className="mb-4 p-3 bg-green-50 text-green-600 text-xs rounded border border-green-100 flex items-center gap-2">
                                <Check className="w-4 h-4" /> Lien envoyé avec succès !
                            </div>
                        )}

                        <div className="flex justify-end gap-3">
                            <button type="button" onClick={() => setIsMagicLinkModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold text-sm hover:bg-slate-200">Annuler</button>
                            <button 
                                type="submit" 
                                disabled={magicLinkStatus === 'loading' || magicLinkStatus === 'success'}
                                className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold text-sm hover:bg-emerald-700 flex items-center gap-2 disabled:opacity-50"
                            >
                                {magicLinkStatus === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                Envoyer
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
      )}

      {/* ... (Resource Modal and Defi Modal remain the same) ... */}
      {isResourceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto relative animate-in zoom-in-95 duration-200 flex flex-col">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0 z-10">
                    <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        {editingResource ? <Edit className="w-5 h-5 text-purple-600" /> : <Plus className="w-5 h-5 text-purple-600" />}
                        {editingResource ? 'Modifier le contenu' : 'Ajouter un contenu'}
                    </h3>
                    <button onClick={() => setIsResourceModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full"><X className="w-5 h-5" /></button>
                </div>
                
                <div className="p-8 space-y-6">
                    <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                            {formData.published ? <Globe className="w-5 h-5 text-green-600" /> : <EyeOff className="w-5 h-5 text-slate-400" />}
                            Statut de la ressource
                        </div>
                        <button
                            type="button"
                            onClick={() => setFormData({ ...formData, published: !formData.published })}
                            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${formData.published ? 'bg-green-500' : 'bg-slate-300'}`}
                        >
                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${formData.published ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* TYPE */}
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Type de ressource</label>
                            <select 
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none"
                                value={formData.type}
                                onChange={(e) => setFormData({...formData, type: e.target.value as ResourceType, metadata: {}})} // Reset metadata on type change
                            >
                                {RESOURCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                        </div>

                        {/* TITLE */}
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Titre</label>
                            <input 
                                type="text" 
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none"
                                value={formData.title}
                                onChange={(e) => setFormData({...formData, title: e.target.value})}
                            />
                        </div>

                        {/* DESCRIPTION */}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Description</label>
                            <textarea 
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none min-h-[100px]"
                                value={formData.description}
                                onChange={(e) => setFormData({...formData, description: e.target.value})}
                            />
                        </div>

                        {/* LINKS */}
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1"><ImageIcon className="w-3 h-3" /> Image URL</label>
                            <input 
                                type="text" 
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none"
                                placeholder="https://..."
                                value={formData.image_url || ''}
                                onChange={(e) => setFormData({...formData, image_url: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1"><LinkIcon className="w-3 h-3" /> Lien Externe</label>
                            <input 
                                type="text" 
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none"
                                placeholder="https://..."
                                value={formData.external_link || ''}
                                onChange={(e) => setFormData({...formData, external_link: e.target.value})}
                            />
                        </div>

                        {/* DATE */}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> Date de publication / événement</label>
                            <input
                                type="date"
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none"
                                value={formData.started_at || ''}
                                onChange={(e) => setFormData({...formData, started_at: e.target.value})}
                            />
                        </div>
                    </div>

                    {/* DYNAMIC METADATA SECTION */}
                    <div className="bg-purple-50 p-6 rounded-2xl border border-purple-100">
                        <h4 className="text-sm font-bold text-purple-800 mb-4 flex items-center gap-2"><Database className="w-4 h-4" /> Métadonnées spécifiques ({RESOURCE_TYPES.find(t => t.value === formData.type)?.label})</h4>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* --- TOOL METADATA --- */}
                            {formData.type === 'tool' && (
                                <>
                                    <div className="md:col-span-2 grid grid-cols-3 gap-4">
                                        <div>
                                            <label className="text-xs font-bold text-purple-700 block mb-1">Catégorie</label>
                                            <select className="w-full p-2 rounded border border-purple-200 text-sm" value={formData.metadata?.category || ''} onChange={(e) => setFormData({...formData, metadata: {...formData.metadata, category: e.target.value}})}>
                                                <option value="">Choisir...</option>
                                                <option value="Administration">Administration</option>
                                                <option value="Marketing & Com">Marketing & Com</option>
                                                <option value="Agronomie">Agronomie</option>
                                                <option value="RH">RH</option>
                                                <option value="Gestion de Data">Gestion de Data</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-purple-700 block mb-1">ROI (1-5)</label>
                                            <input type="number" min="1" max="5" className="w-full p-2 rounded border border-purple-200 text-sm" value={formData.metadata?.roi || 0} onChange={(e) => setFormData({...formData, metadata: {...formData.metadata, roi: parseInt(e.target.value)}})} />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-purple-700 block mb-1">Licence</label>
                                            <select className="w-full p-2 rounded border border-purple-200 text-sm" value={formData.metadata?.licence || ''} onChange={(e) => setFormData({...formData, metadata: {...formData.metadata, licence: e.target.value}})}>
                                                <option value="payant">Payant</option>
                                                <option value="gratuit">Gratuit</option>
                                                <option value="open source">Open Source</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-purple-700 block mb-1">Pays Editeur</label>
                                            <select className="w-full p-2 rounded border border-purple-200 text-sm" value={formData.metadata?.paysEditeur || ''} onChange={(e) => setFormData({...formData, metadata: {...formData.metadata, paysEditeur: e.target.value}})}>
                                                <option value="Autres">Autres</option>
                                                <option value="France">France</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-xs font-bold text-purple-700 block mb-1">Tags Outils IA (séparés par virgules)</label>
                                        <input type="text" className="w-full p-2 rounded border border-purple-200 text-sm" placeholder="LLM, OCR, Transcription..." value={getMetadataArrayString('tagsOutilsIA')} onChange={(e) => updateMetadataArray('tagsOutilsIA', e.target.value)} />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-xs font-bold text-purple-700 block mb-1">Tags Outils Métiers (séparés par virgules)</label>
                                        <input type="text" className="w-full p-2 rounded border border-purple-200 text-sm" placeholder="Traçabilité, IoT..." value={getMetadataArrayString('tagsOutilsMetiers')} onChange={(e) => updateMetadataArray('tagsOutilsMetiers', e.target.value)} />
                                    </div>
                                </>
                            )}

                            {/* --- AGENT METADATA --- */}
                            {formData.type === 'agent' && (
                                <>
                                    <div className="md:col-span-2">
                                        <label className="text-xs font-bold text-purple-700 block mb-1">Editeur</label>
                                        <input type="text" className="w-full p-2 rounded border border-purple-200 text-sm" placeholder="Nom de l'éditeur" value={formData.metadata?.editor || ''} onChange={(e) => setFormData({...formData, metadata: {...formData.metadata, editor: e.target.value}})} />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-xs font-bold text-purple-700 block mb-1">Tags Métiers / Catégories (séparés par virgules)</label>
                                        <input type="text" className="w-full p-2 rounded border border-purple-200 text-sm" placeholder="Conseiller, Exploitant, Technicien, Juridique..." value={getMetadataArrayString('tagsMetiers')} onChange={(e) => updateMetadataArray('tagsMetiers', e.target.value)} />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-xs font-bold text-purple-700 block mb-1">Frameworks (JSON Array ou virgules)</label>
                                        <input type="text" className="w-full p-2 rounded border border-purple-200 text-sm" placeholder="LangChain, CrewAI..." value={getMetadataArrayString('frameworks')} onChange={(e) => updateMetadataArray('frameworks', e.target.value)} />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-xs font-bold text-purple-700 block mb-1">Capacités (JSON Array ou virgules)</label>
                                        <input type="text" className="w-full p-2 rounded border border-purple-200 text-sm" placeholder="Recherche Web, Coding..." value={getMetadataArrayString('capabilities')} onChange={(e) => updateMetadataArray('capabilities', e.target.value)} />
                                    </div>
                                </>
                            )}

                            {/* --- NEWS METADATA --- */}
                            {formData.type === 'news' && (
                                <>
                                    <div className="md:col-span-2">
                                        <label className="text-xs font-bold text-purple-700 block mb-1">Tags Métiers (Grandes cultures, Viticulture...)</label>
                                        <input type="text" className="w-full p-2 rounded border border-purple-200 text-sm" placeholder="Grandes cultures, Elevage..." value={getMetadataArrayString('tagsMetiers')} onChange={(e) => updateMetadataArray('tagsMetiers', e.target.value)} />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-xs font-bold text-purple-700 block mb-1">Tags Outils IA (LLM, App...)</label>
                                        <input type="text" className="w-full p-2 rounded border border-purple-200 text-sm" placeholder="LLM, App..." value={getMetadataArrayString('tagsOutilsIA')} onChange={(e) => updateMetadataArray('tagsOutilsIA', e.target.value)} />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-xs font-bold text-purple-700 block mb-1">Tags Outils Métiers (IoT, Traçabilité...)</label>
                                        <input type="text" className="w-full p-2 rounded border border-purple-200 text-sm" placeholder="IoT, Traçabilité..." value={getMetadataArrayString('tagsOutilsMetiers')} onChange={(e) => updateMetadataArray('tagsOutilsMetiers', e.target.value)} />
                                    </div>
                                </>
                            )}

                            {/* --- USECASE METADATA --- */}
                            {formData.type === 'usecase' && (
                                <>
                                    <div className="md:col-span-2">
                                        <label className="text-xs font-bold text-purple-700 block mb-1">Tags Métiers (secteurs)</label>
                                        <input type="text" className="w-full p-2 rounded border border-purple-200 text-sm" placeholder="Elevage, Viti..." value={getMetadataArrayString('tagsMetiers')} onChange={(e) => updateMetadataArray('tagsMetiers', e.target.value)} />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-xs font-bold text-purple-700 block mb-1">Tags Processus (Compta, RH...)</label>
                                        <input type="text" className="w-full p-2 rounded border border-purple-200 text-sm" placeholder="RH, Compta..." value={getMetadataArrayString('tagsProcess')} onChange={(e) => updateMetadataArray('tagsProcess', e.target.value)} />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-xs font-bold text-purple-700 block mb-1">Tags Outils IA</label>
                                        <input type="text" className="w-full p-2 rounded border border-purple-200 text-sm" placeholder="LLM, OCR..." value={getMetadataArrayString('tagsOutilsIA')} onChange={(e) => updateMetadataArray('tagsOutilsIA', e.target.value)} />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-xs font-bold text-purple-700 block mb-1">Tags Outils Métiers</label>
                                        <input type="text" className="w-full p-2 rounded border border-purple-200 text-sm" placeholder="IoT, Geo..." value={getMetadataArrayString('tagsOutilsMetiers')} onChange={(e) => updateMetadataArray('tagsOutilsMetiers', e.target.value)} />
                                    </div>
                                </>
                            )}

                            {/* --- DATA METADATA --- */}
                            {formData.type === 'data' && (
                                <div className="md:col-span-2">
                                    <label className="text-xs font-bold text-purple-700 block mb-1">Tags (Types de données)</label>
                                    <input type="text" className="w-full p-2 rounded border border-purple-200 text-sm" placeholder="alim, biodiv, phyto..." value={getMetadataArrayString('tags')} onChange={(e) => updateMetadataArray('tags', e.target.value)} />
                                </div>
                            )}

                            {/* --- E-LEARNING METADATA (VIDEO/PDF) --- */}
                            {(formData.type === 'elearning' || (formData.type === 'learning' && formData.metadata?.nature)) && (
                                <>
                                    <div>
                                        <label className="text-xs font-bold text-purple-700 block mb-1">Nature (Ressource Digitale)</label>
                                        <select className="w-full p-2 rounded border border-purple-200 text-sm" value={formData.metadata?.nature || ''} onChange={(e) => setFormData({...formData, metadata: {...formData.metadata, nature: e.target.value}})}>
                                            <option value="video">Vidéo</option>
                                            <option value="pdf">PDF</option>
                                            <option value="cours">Cours en ligne</option>
                                            <option value="podcast">Podcast</option>
                                            <option value="replay">Replay</option>
                                        </select>
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-xs font-bold text-purple-700 block mb-1">Tags Sujets (Outils Métiers)</label>
                                        <input type="text" className="w-full p-2 rounded border border-purple-200 text-sm" placeholder="iot, geo, climate..." value={getMetadataArrayString('tagsOutilsMetiers')} onChange={(e) => updateMetadataArray('tagsOutilsMetiers', e.target.value)} />
                                    </div>
                                </>
                            )}

                            {/* --- TRAINING METADATA (FORMATION PRESENTIAL) --- */}
                            {formData.type === 'learning' && !formData.metadata?.nature && (
                                <>
                                    <div className="md:col-span-2 grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-bold text-purple-700 block mb-1">Niveau</label>
                                            <input type="text" className="w-full p-2 rounded border border-purple-200 text-sm" placeholder="Ex: 3 - IA Spécialiste" value={formData.metadata?.niveau || ''} onChange={(e) => setFormData({...formData, metadata: {...formData.metadata, niveau: e.target.value}})} />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-purple-700 block mb-1">Lieu / Ville</label>
                                            <input type="text" className="w-full p-2 rounded border border-purple-200 text-sm" placeholder="Ex: Bordeaux" value={formData.metadata?.lieu || ''} onChange={(e) => setFormData({...formData, metadata: {...formData.metadata, lieu: e.target.value}})} />
                                        </div>
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-xs font-bold text-purple-700 block mb-1">Publics Cibles (séparés par virgules)</label>
                                        <input type="text" className="w-full p-2 rounded border border-purple-200 text-sm" placeholder="Dirigeants, Techniciens..." value={getMetadataArrayString('publics')} onChange={(e) => updateMetadataArray('publics', e.target.value)} />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-xs font-bold text-purple-700 block mb-1">Objectifs (séparés par virgules)</label>
                                        <input type="text" className="w-full p-2 rounded border border-purple-200 text-sm" placeholder="Comprendre l'IA, ..." value={getMetadataArrayString('objectif')} onChange={(e) => updateMetadataArray('objectif', e.target.value)} />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-xs font-bold text-purple-700 block mb-1">Compétences visées (séparés par virgules)</label>
                                        <input type="text" className="w-full p-2 rounded border border-purple-200 text-sm" placeholder="Prompt engineering..." value={getMetadataArrayString('competences')} onChange={(e) => updateMetadataArray('competences', e.target.value)} />
                                    </div>
                                </>
                            )}

                            {/* JSON RAW EDIT FALLBACK */}
                            <div className="md:col-span-2 mt-4 pt-4 border-t border-purple-200">
                                <label className="text-xs font-bold text-slate-500 flex items-center gap-1"><FileJson className="w-3 h-3" /> Éditeur JSON Brut (Avancé)</label>
                                <textarea 
                                    className="w-full p-3 bg-slate-900 text-emerald-400 font-mono text-xs rounded-lg h-24"
                                    value={JSON.stringify(formData.metadata, null, 2)}
                                    onChange={(e) => { try { setFormData({...formData, metadata: safeParse(e.target.value)}) } catch {} }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-6 bg-slate-50 border-t border-slate-200 sticky bottom-0 z-10 flex justify-end gap-3">
                    <button type="button" onClick={() => setIsResourceModalOpen(false)} className="px-6 py-2.5 bg-white border border-slate-300 text-slate-700 font-bold rounded-xl hover:bg-slate-100">Annuler</button>
                    <button type="button" onClick={handleSaveResource} className="px-6 py-2.5 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 shadow-lg shadow-purple-600/20 flex items-center gap-2">
                        <Save className="w-4 h-4" /> Enregistrer le contenu
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Detail Modal & Delete Modal (unchanged) */}
      {selectedDefi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-200">
             <div className="bg-gradient-to-r from-emerald-900 to-slate-900 p-8 shrink-0 text-white">
                <div className="flex items-start justify-between">
                    <div className="flex-1 pr-4">
                        {isEditingTitle ? (
                            <div className="flex items-center gap-2 mb-2">
                                <input 
                                    type="text" 
                                    value={editTitleValue}
                                    onChange={(e) => setEditTitleValue(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleUpdateDefiTitle(selectedDefi.id, editTitleValue);
                                        } else if (e.key === 'Escape') {
                                            setIsEditingTitle(false);
                                        }
                                    }}
                                    className="w-full px-3 py-1.5 bg-white/10 text-white border border-white/30 rounded-lg text-lg font-bold focus:outline-none focus:ring-2 focus:ring-emerald-400 placeholder-white/50"
                                    placeholder="Nouveau titre du défi..."
                                    autoFocus
                                />
                                <button 
                                    onClick={() => handleUpdateDefiTitle(selectedDefi.id, editTitleValue)}
                                    disabled={isSavingTitle || !editTitleValue.trim()}
                                    className="px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 shrink-0 disabled:opacity-50"
                                >
                                    {isSavingTitle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    Enregistrer
                                </button>
                                <button 
                                    onClick={() => setIsEditingTitle(false)}
                                    className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold transition-all shrink-0"
                                >
                                    Annuler
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 mb-1 group">
                                <h2 className="text-2xl font-bold">{selectedDefi.titreDefi || "Détail de la demande"}</h2>
                                <button 
                                    onClick={() => {
                                        setEditTitleValue(selectedDefi.titreDefi || '');
                                        setIsEditingTitle(true);
                                    }}
                                    className="p-1.5 text-emerald-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                    title="Modifier le titre"
                                >
                                    <Edit3 className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                        <p className="text-emerald-200 text-sm">Défi soumis par <span className="font-bold text-white">{getUserDetails(selectedDefi.user_id).name}</span> le {new Date(selectedDefi.created_at).toLocaleDateString()}</p>
                        <div className="flex flex-wrap gap-2 mt-4">
                            {selectedDefi.motsCles ? (selectedDefi.motsCles.split(',').map((tag, idx) => (<span key={idx} className="flex items-center gap-1 px-2.5 py-1 bg-white/10 rounded-full text-xs font-medium border border-white/20"><Tag className="w-3 h-3" /> {tag.trim()}</span>))) : (<span className="text-white/60 text-xs italic">Mots clés en cours...</span>)}
                        </div>
                    </div>
                    <button onClick={() => { setSelectedDefi(null); setIsEditingTitle(false); }} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X className="w-5 h-5" /></button>
                </div>
             </div>
             <div className="overflow-y-auto p-8 bg-slate-50">
                {selectedDefi.contexte_ia && (<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-8"><h3 className="flex items-center gap-2 text-lg font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100"><Quote className="w-5 h-5 text-indigo-600" /> Contexte</h3><div className="text-slate-700 text-sm leading-relaxed">{renderMarkdown(selectedDefi.contexte_ia)}</div></div>)}
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
                        {selectedDefi.titreDefi ? (<div className="space-y-6"><div className="bg-emerald-50 p-4 rounded-xl border-l-4 border-emerald-500"><h4 className="text-xs font-bold text-emerald-800 uppercase mb-2">La Question Clé</h4><p className="text-emerald-900 font-medium italic">"{selectedDefi.questionCle}"</p></div><div><h4 className="text-xs font-bold text-slate-400 uppercase mb-3">Pistes de réflexion</h4><ul className="space-y-3">{[selectedDefi.pistesDeReflexion1, selectedDefi.pistesDeReflexion2, selectedDefi.pistesDeReflexion3].filter(Boolean).map((piste, idx) => (<li key={idx} className="flex items-start gap-3 text-sm text-slate-700 bg-slate-50 p-3 rounded-lg"><span className="bg-emerald-200 text-emerald-800 w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold shrink-0">{idx + 1}</span>{renderMarkdown(piste || '')}</li>))}</ul></div></div>) : (<div className="flex flex-col items-center justify-center h-48 text-center text-slate-400"><Loader2 className="w-8 h-8 mb-2 animate-spin" /><p>L'IA est en train d'analyser la demande...</p></div>)}
                    </div>
                </div>
                {/* SECTION 3.1 ANALYSE STRATÉGIQUE PILOTERRA */}
                {selectedDefi.quadrant && (
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-8">
                        <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800 mb-6 pb-4 border-b border-slate-100">
                            <BarChart2 className="w-5 h-5 text-purple-600" /> Analyse Stratégique PiloTerra
                            <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-extrabold uppercase">Initial IA</span>
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
                            <div className="space-y-4">
                                <div><div className="flex justify-between text-xs font-bold mb-1"><span className="text-slate-500">Retour sur Investissement (ROI)</span><span className="text-emerald-600">{selectedDefi.score_roi}/100</span></div><div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${selectedDefi.score_roi}%` }}></div></div></div>
                                <div><div className="flex justify-between text-xs font-bold mb-1"><span className="text-slate-500">Complexité de mise en œuvre</span><span className="text-orange-600">{selectedDefi.score_complexite}/100</span></div><div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-orange-500 rounded-full" style={{ width: `${selectedDefi.score_complexite}%` }}></div></div></div>
                            </div>
                            <div className="flex flex-col items-center justify-center p-4 bg-purple-50 rounded-xl border border-purple-100 text-center h-full"><span className="text-xs font-bold text-purple-400 uppercase mb-1">Positionnement</span><span className="text-xl font-black text-purple-800">{selectedDefi.quadrant}</span></div>
                            <div className="text-sm text-slate-600 italic bg-slate-50 p-4 rounded-xl border-l-4 border-purple-300">"{selectedDefi.justification}"</div>
                        </div>
                    </div>
                )}

                {/* SECTION 3.2 ANALYSE STRATÉGIQUE COLLECTIVE */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-indigo-100 mb-8 relative overflow-hidden">
                    <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                        <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800">
                            <Users className="w-5 h-5 text-indigo-600" /> Analyse Stratégique Collective
                            <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full font-extrabold uppercase">
                                Consensus Group
                            </span>
                        </h3>
                        <button
                            onClick={() => {
                                if (isEditingCollective) {
                                    setIsEditingCollective(false);
                                } else {
                                    setCollectiveRoiInput(selectedDefi.score_roi_collectif ?? selectedDefi.score_roi ?? 50);
                                    setCollectiveCplxInput(selectedDefi.score_complexite_collectif ?? selectedDefi.score_complexite ?? 50);
                                    setCollectiveJustifInput(selectedDefi.justification_collectif || '');
                                    setIsEditingCollective(true);
                                }
                            }}
                            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 transition-colors flex items-center gap-1"
                        >
                            <Edit3 className="w-3.5 h-3.5" />
                            {isEditingCollective ? 'Annuler' : 'Éditer l\'analyse collective'}
                        </button>
                    </div>

                    {isEditingCollective ? (
                        <div className="space-y-6 bg-slate-50 p-5 rounded-xl border border-slate-200">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <div className="flex justify-between text-xs font-bold mb-1">
                                        <span className="text-slate-700">ROI Collectif (0 - 100)</span>
                                        <span className="text-emerald-700 font-extrabold">{collectiveRoiInput}/100</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={collectiveRoiInput}
                                        onChange={(e) => setCollectiveRoiInput(parseInt(e.target.value))}
                                        className="w-full accent-emerald-600"
                                    />
                                </div>
                                <div>
                                    <div className="flex justify-between text-xs font-bold mb-1">
                                        <span className="text-slate-700">Complexité Collective (0 - 100)</span>
                                        <span className="text-orange-700 font-extrabold">{collectiveCplxInput}/100</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={collectiveCplxInput}
                                        onChange={(e) => setCollectiveCplxInput(parseInt(e.target.value))}
                                        className="w-full accent-orange-600"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Note / Justification Collective</label>
                                <textarea
                                    value={collectiveJustifInput}
                                    onChange={(e) => setCollectiveJustifInput(e.target.value)}
                                    placeholder="Explications ou conclusions du groupe d'experts..."
                                    className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none min-h-[80px]"
                                />
                            </div>

                            <div className="flex items-center justify-between pt-2">
                                <span className="text-xs text-slate-500">
                                    Quadrant résultant : <span className="font-extrabold text-indigo-700">{getQuadrantName(collectiveRoiInput, collectiveCplxInput)}</span>
                                </span>
                                <button
                                    onClick={async () => {
                                        setIsSavingCollectiveModal(true);
                                        try {
                                            await handleUpdateCollectiveMatrix(selectedDefi.id, collectiveRoiInput, collectiveCplxInput, collectiveJustifInput);
                                            setIsEditingCollective(false);
                                        } catch (err) {
                                            console.error(err);
                                        } finally {
                                            setIsSavingCollectiveModal(false);
                                        }
                                    }}
                                    disabled={isSavingCollectiveModal}
                                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 shadow-md disabled:opacity-50"
                                >
                                    {isSavingCollectiveModal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    Enregistrer l'Analyse Collective
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between text-xs font-bold mb-1">
                                        <span className="text-slate-500">ROI Collectif</span>
                                        <span className="text-emerald-600">
                                            {selectedDefi.score_roi_collectif ?? selectedDefi.score_roi ?? 'Non défini'}/100
                                        </span>
                                    </div>
                                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-emerald-500 rounded-full"
                                            style={{ width: `${selectedDefi.score_roi_collectif ?? selectedDefi.score_roi ?? 0}%` }}
                                        ></div>
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between text-xs font-bold mb-1">
                                        <span className="text-slate-500">Complexité Collective</span>
                                        <span className="text-orange-600">
                                            {selectedDefi.score_complexite_collectif ?? selectedDefi.score_complexite ?? 'Non défini'}/100
                                        </span>
                                    </div>
                                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-orange-500 rounded-full"
                                            style={{ width: `${selectedDefi.score_complexite_collectif ?? selectedDefi.score_complexite ?? 0}%` }}
                                        ></div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col items-center justify-center p-4 bg-indigo-50 rounded-xl border border-indigo-100 text-center h-full">
                                <span className="text-xs font-bold text-indigo-400 uppercase mb-1">Positionnement Collectif</span>
                                <span className="text-xl font-black text-indigo-800">
                                    {selectedDefi.quadrant_collectif || selectedDefi.quadrant || 'Non défini'}
                                </span>
                            </div>

                            <div className="text-sm text-slate-600 italic bg-slate-50 p-4 rounded-xl border-l-4 border-indigo-300">
                                "{selectedDefi.justification_collectif || selectedDefi.justification || 'Pas encore de note collective'}"
                            </div>
                        </div>
                    )}
                </div>
                
                {selectedDefi.alignment_data && (
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-8 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                        <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800 mb-6 pb-4 border-b border-slate-100 relative z-10">
                            <Target className="w-5 h-5 text-emerald-600" /> 
                            Nouvel Alignement Stratégique
                            <span className="ml-2 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase rounded-full">Sur-mesure</span>
                        </h3>
                        
                        {selectedDefi.alignment_data.politique_interne && (
                            <div className="mb-6 relative z-10">
                                <h4 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-2">
                                    <Building2 className="w-3 h-3" /> Politique Interne Cible
                                </h4>
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm text-slate-700 italic">
                                    "{selectedDefi.alignment_data.politique_interne}"
                                </div>
                            </div>
                        )}
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center relative z-10">
                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between text-xs font-bold mb-1">
                                        <span className="text-slate-500">Alignement Stratégique</span>
                                        <span className="text-emerald-600">{selectedDefi.alignment_data.score_roi}/100</span>
                                    </div>
                                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${selectedDefi.alignment_data.score_roi}%` }}></div>
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between text-xs font-bold mb-1">
                                        <span className="text-slate-500">Complexité</span>
                                        <span className="text-orange-600">{selectedDefi.alignment_data.score_complexite}/100</span>
                                    </div>
                                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-orange-500 rounded-full" style={{ width: `${selectedDefi.alignment_data.score_complexite}%` }}></div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex flex-col items-center justify-center p-4 bg-emerald-50 rounded-xl border border-emerald-100 text-center h-full">
                                <span className="text-xs font-bold text-emerald-800 uppercase mb-1">Nouveau Positionnement</span>
                                <span className="text-xl font-black text-emerald-700">{selectedDefi.alignment_data.quadrant}</span>
                            </div>
                            
                            <div className="text-sm text-slate-600 italic bg-slate-50 p-4 rounded-xl border-l-4 border-emerald-400">
                                "{selectedDefi.alignment_data.justification}"
                            </div>
                        </div>
                    </div>
                )}

                {selectedDefi.analyse_web && (<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"><h3 className="flex items-center gap-2 text-lg font-bold text-slate-800 mb-6 pb-4 border-b border-slate-100"><Globe className="w-5 h-5 text-indigo-600" /> Analyse Web</h3>{renderScraperData(selectedDefi.analyse_web)}</div>)}
             </div>
             <div className="p-4 bg-white border-t border-slate-200 flex justify-end shrink-0 z-10">
                <button onClick={() => setSelectedDefi(null)} className="px-6 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg hover:bg-slate-200 transition-colors">Fermer</button>
             </div>
          </div>
        </div>
      )}

      {/* NEW MODAL: LIST USER DEFIS */}
      {viewUserDefisId && (() => {
        const targetUser = users.find(u => u.id === viewUserDefisId);
        const userDefis = defis.filter(d => d.user_id === viewUserDefisId);

        return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <LayoutDashboard className="w-5 h-5 text-pilo-brown" />
                            Défis de {targetUser?.prenom} {targetUser?.nom}
                        </h3>
                        <button onClick={() => setViewUserDefisId(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X className="w-5 h-5" /></button>
                    </div>
                    <div className="p-6 overflow-y-auto bg-slate-50/50 flex-grow">
                        {userDefis.length === 0 ? (
                            <div className="text-center py-12">
                                <LayoutDashboard className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                                <p className="text-slate-500 italic">Aucun défi généré par cet utilisateur.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4">
                                {userDefis.map(d => (
                                    <div 
                                        key={d.id} 
                                        onClick={() => setSelectedDefi(d)}
                                        className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-pilo-brown hover:shadow-md transition-all cursor-pointer group"
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                                <Calendar className="w-3 h-3" /> {new Date(d.created_at).toLocaleDateString()}
                                            </span>
                                            {d.quadrant && <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-bold border border-slate-200">{d.quadrant}</span>}
                                        </div>
                                        <h4 className="font-bold text-slate-900 mb-1 group-hover:text-pilo-brown transition-colors">{d.titreDefi || "Analyse en cours..."}</h4>
                                        <p className="text-xs text-slate-500 line-clamp-2">{d.probleme}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
      })()}

      {deleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative animate-in zoom-in-95 duration-200">
                <div className="p-6 text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <ShieldAlert className="w-8 h-8 text-red-600" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">Confirmer la suppression</h3>
                    <p className="text-slate-500 text-sm">
                        {deleteConfirm.type === 'resource' 
                            ? "Voulez-vous vraiment supprimer définitivement ce contenu ?" 
                            : deleteConfirm.type === 'organisation'
                                ? "Voulez-vous vraiment supprimer définitivement cette organisation ? Les membres associés n'auront plus d'organisation rattachée."
                                : "Voulez-vous vraiment supprimer cette question du diagnostic ?"}
                    </p>
                    <p className="text-red-500 text-xs font-bold mt-2">Cette action est irréversible.</p>
                </div>
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3">
                    <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-100 transition-colors">Annuler</button>
                    <button onClick={executeDelete} className="flex-1 py-2.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-600/20">Supprimer</button>
                </div>
            </div>
        </div>
      )}

      {/* Organisation Creation Modal */}
      {isOrgModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-indigo-600" />
                        {editingOrgId ? 'Modifier l\'organisation' : 'Nouvelle Organisation'}
                    </h3>
                    <button onClick={() => setIsOrgModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X className="w-5 h-5" /></button>
                </div>
                <form onSubmit={handleCreateOrganisation} className="p-6">
                    {orgCreateError && (
                        <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
                            {orgCreateError}
                        </div>
                    )}
                    <div className="mb-4">
                        <label className="block text-sm font-bold text-slate-700 mb-2">Nom de l'organisation</label>
                        <input 
                            type="text" 
                            value={newOrgName} 
                            onChange={(e) => setNewOrgName(e.target.value)} 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all"
                            placeholder="Ex : Coopérative du Sud, Syndicat des eaux, Transports Martin"
                            required
                        />
                    </div>
                    {/* Marché (obligatoire) et filière (facultative) — étape 5c */}
                    <div className="mb-4">
                        <label className="block text-sm font-bold text-slate-700 mb-2">Marché *</label>
                        <select
                            required
                            value={newOrgMarche}
                            onChange={(e) => choisirMarcheOrganisation(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all"
                        >
                            <option value="">Sélectionnez le marché...</option>
                            {referentielMarches.map((m) => (
                                <option key={m.code} value={m.code}>{m.libelle}</option>
                            ))}
                        </select>
                        <p className="mt-1 text-xs text-slate-400">S'applique à tous ses membres, à la place du marché de leur profil.</p>
                        {avertissementMarche && (
                            <p className="mt-2 p-2.5 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg">
                                {avertissementMarche}
                            </p>
                        )}
                    </div>
                    <div className="mb-4">
                        <label className="block text-sm font-bold text-slate-700 mb-2">Filière</label>
                        <select
                            value={newOrgFiliere}
                            onChange={(e) => setNewOrgFiliere(e.target.value)}
                            disabled={!newOrgMarche}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all disabled:opacity-60"
                        >
                            <option value="">{newOrgMarche ? 'Non précisée' : "Choisissez d'abord un marché"}</option>
                            {filieresDuMarche(referentielFilieres, newOrgMarche || null).map((f) => (
                                <option key={f.code} value={f.code}>{f.libelle}</option>
                            ))}
                        </select>
                        <p className="mt-1 text-xs text-slate-400">Proposée par défaut à ses membres, qui peuvent choisir la leur.</p>
                    </div>
                    <div className="flex gap-3 mt-6">
                        <button type="button" onClick={() => setIsOrgModalOpen(false)} className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-colors">Annuler</button>
                        <button type="submit" disabled={!newOrgName.trim() || !newOrgMarche} className="flex-1 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-600/20">
                            {editingOrgId ? 'Enregistrer' : 'Créer'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* Notification Toast */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-[100] animate-in fade-in slide-in-from-right-4 duration-300">
          <div className={`${notification.type === 'success' ? 'bg-indigo-600' : 'bg-red-600'} text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 border border-white/20`}>
            {notification.type === 'success' ? <Sparkles className="w-5 h-5" /> : <X className="w-5 h-5" />}
            <span className="font-bold">{notification.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};
