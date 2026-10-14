/// <reference types="vite/client" />
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import {
  FileText, CheckSquare, Square, ChevronRight, ChevronLeft, Sparkles,
  Loader2, Download, Copy, Check, RefreshCw, Eye, EyeOff, AlertTriangle,
  Shield, Cpu, Database, Users, BookOpen, Scale, X, ExternalLink,
  Building2, Calendar, Tag, BarChart2, Target, Zap, ArrowRight,
  ScrollText, Globe, ChevronDown, ChevronUp, RotateCcw, Save,
  Archive, Send, FileDown, Pencil, Info, User, ChevronRight as ChevronRightIcon
} from 'lucide-react';
import { Page, DefiView } from '../types';
import { N8N } from '../n8nConfig';
import { couleursDocument } from './paletteMarche';
import { useMarche } from './MarcheContext';

// ============================================================
// CONFIG — webhook n8n, dépend de l'environnement (voir n8nConfig.ts)
// ============================================================
const N8N_CHARTER_WEBHOOK_URL = N8N.charte;

// ============================================================
// TYPES
// ============================================================
interface CharterConfig {
  tools: {
    ai_assistants: boolean;
    code_assistants: boolean;
    image_generation: boolean;
    video_audio_generation: boolean;
    autonomous_agents: boolean;
  };
  data: {
    client_data: boolean;
    confidential_docs: boolean;
    personal_data: boolean;
    eu_hosted_only: boolean;
  };
  usage: {
    personal_use_tolerated: boolean;
    limited_to_challenges: boolean;
    human_review_required: boolean;
    ai_disclosure_required: boolean;
  };
  governance: {
    mandatory_training: boolean;
    incident_reporting: boolean;
    cio_approval_for_new_tools: boolean;
    quarterly_audit: boolean;
    ai_act_compliance: boolean;
    gdpr_compliance: boolean;
    sector_compliance: string;
  };
  free_fields: {
    csr_commitments: string;
    forbidden_tools: string;
    internal_referent_name: string;
    internal_referent_email: string;
  };
}

interface CompanyMeta {
  name: string;
  sector: string;
  size: string;
  effective_date: string;
  referent_name: string;
  referent_email: string;
}

interface CharterSection {
  id: string;
  title: string;
  content: string;
}

interface GeneratedCharter {
  title: string;
  version: string;
  sections: CharterSection[];
  raw_markdown: string;
}

interface SavedCharter {
  id: string;
  title: string;
  version: string;
  status: 'draft' | 'published' | 'archived';
  created_at: string;
  updated_at: string;
  raw_markdown: string;
  content: CharterSection[];
}

interface CharteIAProps {
  session: any;
  onNavigate: (page: Page) => void;
  onBack: () => void; // retour à AdminOrganisation
}

// ============================================================
// HELPERS
// ============================================================
const defaultConfig = (): CharterConfig => ({
  tools: {
    ai_assistants: true,
    code_assistants: false,
    image_generation: false,
    video_audio_generation: false,
    autonomous_agents: false,
  },
  data: {
    client_data: false,
    confidential_docs: false,
    personal_data: false,
    eu_hosted_only: true,
  },
  usage: {
    personal_use_tolerated: false,
    limited_to_challenges: true,
    human_review_required: true,
    ai_disclosure_required: true,
  },
  governance: {
    mandatory_training: true,
    incident_reporting: true,
    cio_approval_for_new_tools: false,
    quarterly_audit: false,
    ai_act_compliance: true,
    gdpr_compliance: true,
    sector_compliance: '',
  },
  free_fields: {
    csr_commitments: '',
    forbidden_tools: '',
    internal_referent_name: '',
    internal_referent_email: '',
  },
});

const effectiveDateDefault = () => {
  // J+30 en heure locale (évite le décalage UTC qui donnait J-1)
  const d = new Date();
  d.setDate(d.getDate() + 30);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const safeParse = (val: any) => {
  if (!val) return {};
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return {}; }
};

// ============================================================
// RENDU MARKDOWN LÉGER (sans dépendance externe)
// Gère : ## titres, **gras**, - listes, lignes vides
// ============================================================
const renderMarkdown = (text: string): React.ReactNode => {
  if (!text) return null;
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = (key: string) => {
    if (listItems.length === 0) return;
    elements.push(
      <ul key={`ul-${key}`} className="list-disc list-inside space-y-1 mb-3 text-slate-600 text-sm">
        {listItems.map((li, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: parseinline(li) }} />
        ))}
      </ul>
    );
    listItems = [];
  };

  const parseinline = (s: string): string =>
    s
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code class="bg-slate-100 px-1 rounded text-xs font-mono">$1</code>');

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    // Titre ### ou ####
    if (/^#{3,4}\s/.test(trimmed)) {
      flushList(String(idx));
      const content = trimmed.replace(/^#{3,4}\s/, '');
      elements.push(
        <h4 key={idx} className="font-bold text-slate-700 text-sm mt-3 mb-1"
          dangerouslySetInnerHTML={{ __html: parseinline(content) }} />
      );
      return;
    }

    // Titre ## ou #
    if (/^#{1,2}\s/.test(trimmed)) {
      flushList(String(idx));
      const content = trimmed.replace(/^#{1,2}\s/, '');
      elements.push(
        <h3 key={idx} className="font-bold text-slate-700 text-base mt-4 mb-2"
          dangerouslySetInnerHTML={{ __html: parseinline(content) }} />
      );
      return;
    }

    // Ligne de liste - ou *
    if (/^[-*]\s/.test(trimmed)) {
      listItems.push(trimmed.replace(/^[-*]\s/, ''));
      return;
    }

    // Ligne vide
    if (trimmed === '') {
      flushList(String(idx));
      return;
    }

    // Paragraphe normal
    flushList(String(idx));
    elements.push(
      <p key={idx} className="text-sm text-slate-600 leading-relaxed mb-2"
        dangerouslySetInnerHTML={{ __html: parseinline(trimmed) }} />
    );
  });

  flushList('end');
  return <>{elements}</>;
};

/** Stepper horizontal cliquable */
const Stepper = ({ step, onStepClick }: { step: number; onStepClick: (i: number) => void }) => {
  const steps = [
    { label: 'Défis', icon: <Target className="w-4 h-4" /> },
    { label: 'Configuration', icon: <Shield className="w-4 h-4" /> },
    { label: 'Entreprise', icon: <Building2 className="w-4 h-4" /> },
    { label: 'Génération', icon: <Sparkles className="w-4 h-4" /> },
  ];
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          <div
            className={`flex flex-col items-center gap-1 min-w-[70px] ${i <= step ? 'cursor-pointer' : 'cursor-not-allowed'}`}
            onClick={() => i <= step && onStepClick(i)}
            title={i <= step ? `Aller à l'étape ${i + 1}` : 'Complétez les étapes précédentes'}
          >
            <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm transition-all border-2
              ${i < step ? 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700' :
                i === step ? 'bg-white border-emerald-600 text-emerald-600 shadow-md shadow-emerald-100' :
                'bg-slate-100 border-slate-200 text-slate-400'}`}>
              {i < step ? <Check className="w-4 h-4" /> : s.icon}
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wide
              ${i === step ? 'text-emerald-700' : i < step ? 'text-emerald-500' : 'text-slate-400'}`}>
              {s.label}
            </span>
          </div>
          {i < 3 && (
            <div className={`flex-1 h-0.5 mb-4 transition-all ${i < step ? 'bg-emerald-400' : 'bg-slate-200'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

/** Checkbox toggle stylisé */
const Toggle = ({
  checked, onChange, label, description
}: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) => (
  <label className="flex items-start gap-3 cursor-pointer group py-2">
    <div
      onClick={() => onChange(!checked)}
      className={`shrink-0 w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center transition-all
        ${checked ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300 group-hover:border-emerald-400'}`}
    >
      {checked && <Check className="w-3 h-3 text-white" />}
    </div>
    <div>
      <p className={`text-sm font-medium ${checked ? 'text-slate-800' : 'text-slate-600'}`}>{label}</p>
      {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
    </div>
  </label>
);

/** Toggle avec champ de précision qui apparaît quand coché */
const ToggleWithPrecision = ({
  checked, onChange, label, precisionKey, precisionValue, onPrecisionChange, placeholder
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  precisionKey: string;
  precisionValue: string;
  onPrecisionChange: (k: string, v: string) => void;
  placeholder: string;
}) => (
  <div className="py-2">
    <div className="flex items-start gap-3">
      <div
        onClick={() => onChange(!checked)}
        className={`shrink-0 w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center cursor-pointer transition-all
          ${checked ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300 hover:border-emerald-400'}`}
      >
        {checked && <Check className="w-3 h-3 text-white" />}
      </div>
      <div className="flex-1">
        <p
          className={`text-sm font-medium cursor-pointer ${checked ? 'text-slate-800' : 'text-slate-600'}`}
          onClick={() => onChange(!checked)}
        >
          {label}
        </p>
        {checked && (
          <input
            type="text"
            value={precisionValue}
            onChange={e => onPrecisionChange(precisionKey, e.target.value)}
            placeholder={placeholder}
            className="mt-1.5 w-full px-3 py-1.5 rounded-lg border border-emerald-200 bg-white text-xs text-slate-700 focus:ring-2 focus:ring-emerald-400 outline-none placeholder:text-slate-400"
            onClick={e => e.stopPropagation()}
          />
        )}
      </div>
    </div>
  </div>
);

/** Section de config avec titre */
const ConfigSection = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
  <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 mb-4">
    <h4 className="font-bold text-slate-700 flex items-center gap-2 mb-3 text-sm uppercase tracking-wide">
      {icon} {title}
    </h4>
    {children}
  </div>
);

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================
export const CharteIA: React.FC<CharteIAProps> = ({ session, onNavigate, onBack }) => {
  const [step, setStep] = useState(0);

  // Données organisation
  const [orgId, setOrgId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<'user' | 'admin_coop' | 'super_admin' | 'member_orga'>('user');
  const isAdmin = userRole === 'admin_coop' || userRole === 'super_admin';
  const [allDefis, setAllDefis] = useState<DefiView[]>([]);
  const [loadingDefis, setLoadingDefis] = useState(true);

  // Étape 1 — Sélection défis
  const [selectedDefis, setSelectedDefis] = useState<string[]>([]);
  const [defiSearch, setDefiSearch] = useState('');
  const [defiFilter, setDefiFilter] = useState<'all' | 'Projets Majeurs' | 'Gains Rapides'>('all');

  // Étape 2 — Config charte
  const [config, setConfig] = useState<CharterConfig>(defaultConfig());

  // Étape 3 — Métadonnées
  const [meta, setMeta] = useState<CompanyMeta>({
    name: '', sector: '', size: '50-200',
    effective_date: effectiveDateDefault(),
    referent_name: '', referent_email: '',
  });

  // Étape 4 — Génération & prévisualisation
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedCharter | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [editSection, setEditSection] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<string[]>([]);
  const [markdownMode, setMarkdownMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedCharterId, setSavedCharterId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'published'>('idle');

  // Liste chartes existantes
  const [chartes, setChartes] = useState<SavedCharter[]>([]);
  const [charteAuthors, setCharteAuthors] = useState<Record<string, string>>({}); // id → "Prénom Nom"
  const [viewMode, setViewMode] = useState<'wizard' | 'list' | 'reader'>('list');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Étape 1 — défi expandé pour résumé inline
  const [expandedDefi, setExpandedDefi] = useState<string | null>(null);

  // Étape 2 — précisions textuelles par option cochée
  const [configPrecisions, setConfigPrecisions] = useState<Record<string, string>>({
    ai_assistants: 'ChatGPT, Claude, Gemini, Mistral',
    code_assistants: 'GitHub Copilot, Cursor, Codeium',
    image_generation: 'Midjourney, DALL-E, Stable Diffusion',
    video_audio_generation: 'Sora, ElevenLabs, Synthesia',
    autonomous_agents: 'Automatisation de workflows sans supervision humaine',
    client_data: '',
    confidential_docs: '',
    personal_data: '',
    eu_hosted_only: '',
    personal_use_tolerated: '',
    limited_to_challenges: '',
    human_review_required: '',
    ai_disclosure_required: '',
    mandatory_training: '',
    incident_reporting: '',
    cio_approval_for_new_tools: '',
    quarterly_audit: '',
    ai_act_compliance: '',
    gdpr_compliance: '',
  });
  const setPrecision = (k: string, v: string) =>
    setConfigPrecisions(prev => ({ ...prev, [k]: v }));

  const previewRef = useRef<HTMLDivElement>(null);

  // ── Init ──────────────────────────────────────────────────
  // Secteur préremplis de la charte (étape 5b) : libellé de la filière de
  // l'utilisateur, sinon de son marché — la filière remplace l'ancien champ
  // libre secteur_activite. Le référentiel arrive de façon asynchrone, d'où
  // un effet séparé. undefined = profil pas encore chargé. Une valeur déjà
  // présente n'est jamais écrasée.
  const { filieres, marcheCourant } = useMarche();
  const [filiereUtilisateur, setFiliereUtilisateur] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (session?.user?.id) initData();
  }, [session]);

  useEffect(() => {
    if (filiereUtilisateur === undefined) return;
    const libelle = filieres.find((f) => f.code === filiereUtilisateur)?.libelle || marcheCourant?.libelle;
    if (!libelle) return;
    setMeta((m) => (m.sector ? m : { ...m, sector: libelle }));
  }, [filieres, marcheCourant, filiereUtilisateur]);

  const initData = async () => {
    setLoadingDefis(true);
    try {
      // Récupère profil utilisateur
      const { data: userProfile } = await supabase
        .from('utilisateurs')
        .select('id, organisation_id, role, entreprise, filiere_code, email, nom, prenom')
        .eq('auth_id', session.user.id)
        .single();

      if (userProfile) {
        setUserId(userProfile.id);
        setOrgId(userProfile.organisation_id);
        setUserRole((userProfile.role as any) || 'user');
        setFiliereUtilisateur(userProfile.filiere_code ?? null);
        setMeta(prev => ({
          ...prev,
          name: userProfile.entreprise || '',
          referent_name: `${userProfile.prenom || ''} ${userProfile.nom || ''}`.trim(),
          referent_email: userProfile.email || session.user.email || '',
        }));

        // Récupère les défis de l'organisation
        if (userProfile.organisation_id) {
          const { data: membersData } = await supabase
            .from('utilisateurs')
            .select('id')
            .eq('organisation_id', userProfile.organisation_id)
            .eq('provenance', 'piloterra');

          const memberIds = membersData?.map((m: any) => m.id) || [userProfile.id];

          const { data: rawDefis } = await supabase
            .from('diagnostics')
            .select('*')
            .in('user_id', memberIds)
            .eq('provenance', 'piloterra')
            .order('created_at', { ascending: false });

          if (rawDefis) {
            // Récupérer les noms des auteurs des défis
            const defiAuthorIds = [...new Set(rawDefis.map((d: any) => d.user_id).filter(Boolean))];
            const authorMap: Record<string, string> = {};
            if (defiAuthorIds.length > 0) {
              const { data: defiAuthors } = await supabase
                .from('utilisateurs')
                .select('id, prenom, nom')
                .in('id', defiAuthorIds);
              defiAuthors?.forEach((a: any) => {
                authorMap[a.id] = `${a.prenom || ''} ${a.nom || ''}`.trim();
              });
            }

            const mapped: DefiView[] = rawDefis.map((d: any) => {
              const inputs = safeParse(d.inputs_client || d.inputs_clients);
              const outputAgent = safeParse(d.output_agent_defi || d.out_agent_defi);
              const outputMatrice = safeParse(d.output_agent_matrice || d.outpout_agent_matrice);
              return {
                id: d.id,
                user_id: d.user_id,
                created_at: d.created_at,
                email: authorMap[d.user_id] || '',
                probleme: inputs.question_1 || inputs.probleme || 'Non défini',
                vision: inputs.question_2 || inputs.vision || 'Non défini',
                ressources: inputs.question_3 || inputs.ressources || 'Non défini',
                titreDefi: outputAgent.titreDefi || outputAgent.titre || null,
                contexte_ia: outputAgent.contexteProbleme || null,
                questionCle: outputAgent.questionCle || null,
                pistesDeReflexion1: Array.isArray(outputAgent.pistesDeReflexion) ? outputAgent.pistesDeReflexion[0] : null,
                pistesDeReflexion2: Array.isArray(outputAgent.pistesDeReflexion) ? outputAgent.pistesDeReflexion[1] : null,
                pistesDeReflexion3: Array.isArray(outputAgent.pistesDeReflexion) ? outputAgent.pistesDeReflexion[2] : null,
                motsCles: (outputAgent.motsCles || outputAgent.mots_cles || []).join(', '),
                quadrant: outputMatrice.quadrant_nom || outputMatrice.quadrant || null,
                score_roi: outputMatrice.score_roi || null,
                score_complexite: outputMatrice.score_complexite || null,
                justification: outputMatrice.justification || null,
                analyse_web: null,
              };
            });
            setAllDefis(mapped);
          }

          // Chartes existantes
          await fetchChartes(userProfile.organisation_id, userProfile.role || 'user');
        }
      }
    } catch (e) {
      console.error('Erreur init CharteIA:', e);
    } finally {
      setLoadingDefis(false);
    }
  };

  const fetchChartes = async (orgId: string, role?: string) => {
    let query = supabase
      .from('chartes')
      .select('*')
      .eq('organisation_id', orgId)
      .order('created_at', { ascending: false });

    // Les users simples ne voient que les chartes publiées
    const effectiveRole = role || userRole;
    if (effectiveRole === 'user') {
      query = query.eq('status', 'published');
    }

    const { data } = await query;
    if (data) {
      setChartes(data as SavedCharter[]);
      // Récupérer les noms des auteurs
      const creatorIds = [...new Set(data.map((c: any) => c.created_by).filter(Boolean))];
      if (creatorIds.length > 0) {
        const { data: authors } = await supabase
          .from('utilisateurs')
          .select('id, prenom, nom')
          .in('id', creatorIds);
        if (authors) {
          const map: Record<string, string> = {};
          authors.forEach((a: any) => {
            map[a.id] = `${a.prenom || ''} ${a.nom || ''}`.trim();
          });
          setCharteAuthors(map);
        }
      }
    }
  };

  const deleteCharter = async (id: string) => {
    await supabase.from('chartes').delete().eq('id', id);
    setDeleteConfirm(null);
    if (orgId) await fetchChartes(orgId);
  };

  // ── Filtrage défis ──────────────────────────────────────
  const filteredDefis = allDefis.filter(d => {
    const matchSearch =
      !defiSearch ||
      (d.titreDefi || '').toLowerCase().includes(defiSearch.toLowerCase()) ||
      (d.probleme || '').toLowerCase().includes(defiSearch.toLowerCase());
    const matchFilter =
      defiFilter === 'all' ||
      (d.quadrant || '').toLowerCase().includes(defiFilter.toLowerCase());
    return matchSearch && matchFilter;
  });

  const toggleDefi = (id: string) => {
    setSelectedDefis(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 20 ? [...prev, id] : prev
    );
  };

  // ── Config helpers ──────────────────────────────────────
  const setTools = (k: keyof CharterConfig['tools'], v: boolean) =>
    setConfig(c => ({ ...c, tools: { ...c.tools, [k]: v } }));
  const setData = (k: keyof CharterConfig['data'], v: boolean) =>
    setConfig(c => ({ ...c, data: { ...c.data, [k]: v } }));
  const setUsage = (k: keyof CharterConfig['usage'], v: boolean) =>
    setConfig(c => ({ ...c, usage: { ...c.usage, [k]: v } }));
  const setGov = (k: keyof CharterConfig['governance'], v: boolean | string) =>
    setConfig(c => ({ ...c, governance: { ...c.governance, [k]: v } }));
  const setFree = (k: keyof CharterConfig['free_fields'], v: string) =>
    setConfig(c => ({ ...c, free_fields: { ...c.free_fields, [k]: v } }));

  // ── Génération ──────────────────────────────────────────
  const handleGenerate = async (retrying = false) => {
    setGenerating(true);
    setGenError(null);
    if (!retrying) setGenerated(null);

    const defiObjects = allDefis.filter(d => selectedDefis.includes(d.id));

    const payload = {
      request_id: crypto.randomUUID(),
      organisation_id: orgId,
      user_id: userId,
      company: {
        name: meta.name,
        sector: meta.sector,
        size: meta.size,
        effective_date: meta.effective_date,
        referent: { name: meta.referent_name, email: meta.referent_email },
      },
      challenges: defiObjects.map(d => ({
        id: d.id,
        title: d.titreDefi || d.probleme,
        description: d.contexte_ia || d.probleme,
        author: d.user_id,
        tags: d.quadrant ? [d.quadrant] : [],
        roi: d.score_roi || 0,
        complexity: d.score_complexite || 0,
        created_at: d.created_at,
      })),
      charter_config: {
        tools: config.tools,
        data: config.data,
        usage: config.usage,
        governance: config.governance,
        free_fields: config.free_fields,
        precisions: configPrecisions,
      },
      generation_date: new Date().toISOString(),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    try {
      const res = await fetch(N8N_CHARTER_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`Erreur HTTP ${res.status}`);
      }

      const data = await res.json();

      if (data.status === 'success' && data.charter) {
        setGenerated(data.charter);
        await saveCharter(data.charter, 'draft', payload);
      } else {
        throw new Error(data.message || 'Réponse inattendue du serveur');
      }
    } catch (e: any) {
      clearTimeout(timeout);
      if (e.name === 'AbortError') {
        setGenError('Délai dépassé (120s). Le serveur met trop de temps à répondre.');
      } else {
        setGenError(e.message || 'Une erreur est survenue');
      }
    } finally {
      setGenerating(false);
    }
  };

  // ── Sauvegarde Supabase ────────────────────────────────
  const saveCharter = async (
    charter: GeneratedCharter,
    status: 'draft' | 'published',
    originalPayload?: any
  ) => {
    if (!orgId || !userId) return;
    setSaving(true);
    try {
      const upsertData: any = {
        organisation_id: orgId,
        created_by: userId,
        status,
        title: charter.title,
        version: charter.version || '1.0',
        content: charter.sections,
        raw_markdown: charter.raw_markdown,
        linked_challenges: selectedDefis,
        charter_config: config,
        generation_metadata: originalPayload
          ? { generated_at: new Date().toISOString() }
          : undefined,
        updated_at: new Date().toISOString(),
        // Si on dépublie (draft), on efface la date de publication
        published_at: status === 'published' ? new Date().toISOString() : null,
      };

      if (savedCharterId) {
        await supabase.from('chartes').update(upsertData).eq('id', savedCharterId);
      } else {
        const { data } = await supabase.from('chartes').insert(upsertData).select().single();
        if (data) setSavedCharterId(data.id);
      }

      setSaveStatus(status === 'published' ? 'published' : 'saved');
      if (orgId) await fetchChartes(orgId);
    } catch (e) {
      console.error('Erreur sauvegarde charte:', e);
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = () => {
    if (generated) saveCharter(generated, 'published');
  };

  // ── Édition section ────────────────────────────────────
  const startEdit = (s: CharterSection) => {
    setEditSection(s.id);
    setEditContent(s.content);
  };

  const saveEdit = () => {
    if (!generated || !editSection) return;
    const updated = {
      ...generated,
      sections: generated.sections.map(s =>
        s.id === editSection ? { ...s, content: editContent } : s
      ),
      raw_markdown: generated.sections
        .map(s => (s.id === editSection ? `## ${s.title}\n\n${editContent}` : `## ${s.title}\n\n${s.content}`))
        .join('\n\n'),
    };
    setGenerated(updated);
    setEditSection(null);
  };

  const toggleSection = (id: string) =>
    setCollapsedSections(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // ── Export ──────────────────────────────────────────────
  const exportMarkdown = () => {
    if (!generated) return;
    const blob = new Blob([generated.raw_markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `charte-ia-${meta.name.replace(/\s+/g, '-').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    if (!generated) return;
    // Génération PDF via window.print avec styles dédiés
    const c = couleursDocument(); // couleurs du marché actif (étape 10)
    const printContent = `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <title>${generated.title}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background: white; padding: 0; }
          .header { background: linear-gradient(135deg, ${c[900]}, #1e293b); color: white; padding: 40px 50px; }
          .header-badge { font-size: 10px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: ${c[300]}; margin-bottom: 8px; }
          .header h1 { font-size: 24px; font-weight: 900; margin-bottom: 8px; }
          .header p { font-size: 13px; color: ${c[200]}; }
          .content { padding: 40px 50px; }
          .section { margin-bottom: 28px; page-break-inside: avoid; }
          .section h2 { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: ${c[600]}; border-bottom: 2px solid ${c[100]}; padding-bottom: 6px; margin-bottom: 12px; }
          .section p { font-size: 13px; line-height: 1.7; color: #475569; margin-bottom: 8px; }
          .footer { margin-top: 40px; padding: 16px 50px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; }
          .meta { display: flex; gap: 24px; margin-top: 8px; }
          .meta span { font-size: 11px; color: #94a3b8; }
          .notice { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin: 24px 0; font-size: 12px; color: #92400e; }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-badge">Charte IA Officielle</div>
          <h1>${generated.title}</h1>
          <p>Version ${generated.version} &nbsp;·&nbsp; En vigueur le ${new Date(meta.effective_date).toLocaleDateString('fr-FR')}</p>
        </div>
        <div class="content">
          <div class="notice">
            ⚠️ <strong>Validation juriste recommandée</strong> — Ce document est généré automatiquement à partir des défis IA de votre organisation. Faites-le relire par un expert juridique avant toute diffusion officielle.
          </div>
          ${generated.sections.map(s => `
            <div class="section">
              <h2>${s.title}</h2>
              ${s.content.split('\n').filter(l => l.trim()).map(l => `<p>${l}</p>`).join('')}
            </div>
          `).join('')}
        </div>
        <div class="footer">
          <strong>Référent charte :</strong> ${meta.referent_name} — ${meta.referent_email}
          <div class="meta">
            <span>Organisation : ${meta.name}</span>
            <span>Secteur : ${meta.sector || 'Non précisé'}</span>
            <span>Document généré par PiloTerra</span>
          </div>
        </div>
        <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }</script>
      </body>
      </html>
    `;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
    }
  };

  const copyToClipboard = () => {
    if (!generated) return;
    navigator.clipboard.writeText(generated.raw_markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Validation étapes ──────────────────────────────────
  const canGoNext = () => {
    if (step === 0) return selectedDefis.length >= 1;
    if (step === 2) return meta.name.trim().length > 0;
    return true;
  };

  // ── RENDU ───────────────────────────────────────────────
  if (loadingDefis) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  // Vue liste des chartes
  if (viewMode === 'list') {
    return (
      <div className="min-h-screen bg-slate-50 py-10 px-4">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                  <ScrollText className="w-6 h-6 text-emerald-600" />
                  Chartes IA
                </h1>
                <p className="text-slate-500 text-sm">
                  {isAdmin
                    ? 'Gérez et générez la charte IA de votre organisation'
                    : 'Consultez la charte IA de votre organisation'}
                </p>
              </div>
            </div>
            {/* Bouton Nouvelle charte — admins uniquement */}
            {isAdmin && (
              <button
                onClick={() => { setViewMode('wizard'); setStep(0); setGenerated(null); setSavedCharterId(null); setSaveStatus('idle'); }}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
              >
                <Sparkles className="w-4 h-4" />
                Nouvelle charte
              </button>
            )}
          </div>

          {/* Mention légale */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              <strong>Validation juriste recommandée.</strong> La charte générée est un point de départ basé sur vos défis et votre configuration. Faites-la relire par un expert juridique avant publication officielle.
            </p>
          </div>

          {/* Liste */}
          {chartes.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
              <ScrollText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              {isAdmin ? (
                <>
                  <h3 className="font-bold text-slate-700 mb-1">Aucune charte générée</h3>
                  <p className="text-slate-400 text-sm mb-6">Lancez le générateur pour créer votre première charte IA.</p>
                  <button
                    onClick={() => setViewMode('wizard')}
                    className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all"
                  >
                    Générer ma première charte
                  </button>
                </>
              ) : (
                <>
                  <h3 className="font-bold text-slate-700 mb-1">Aucune charte disponible</h3>
                  <p className="text-slate-400 text-sm">Votre organisation n'a pas encore publié de charte IA. Contactez votre administrateur.</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {chartes.map(c => (
                <div key={c.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex items-center justify-between hover:border-emerald-200 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0
                      ${c.status === 'published' ? 'bg-succes-500' :
                        c.status === 'draft' ? 'bg-amber-400' : 'bg-slate-300'}`} />
                    <div>
                      <p className="font-bold text-slate-800">{c.title}</p>
                      <p className="text-xs text-slate-400">
                        v{c.version} · {new Date(c.created_at).toLocaleDateString('fr-FR')}
                        {charteAuthors[(c as any).created_by] && (
                          <span className="ml-1">· <span className="font-medium text-slate-500">{charteAuthors[(c as any).created_by]}</span></span>
                        )}
                        <span className={`ml-1 font-medium
                          ${c.status === 'published' ? 'text-succes-600' :
                            c.status === 'draft' ? 'text-amber-600' : 'text-slate-400'}`}>
                          · {c.status === 'published' ? 'Publiée' : c.status === 'draft' ? 'Brouillon' : 'Archivée'}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setGenerated({ title: c.title, version: c.version, sections: c.content, raw_markdown: c.raw_markdown });
                        setSavedCharterId(c.id);
                        setSaveStatus(c.status === 'published' ? 'published' : 'saved');
                        setStep(3);
                        setViewMode(isAdmin ? 'wizard' : 'reader');
                      }}
                      className="px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" /> {isAdmin ? 'Gérer' : 'Lire'}
                    </button>
                    {/* Bouton supprimer — admins uniquement */}
                    {isAdmin && (
                      deleteConfirm === c.id ? (
                        <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                          <span className="text-xs text-red-700 font-medium">Confirmer ?</span>
                          <button
                            onClick={() => deleteCharter(c.id)}
                            className="text-xs font-bold text-red-700 hover:text-red-900 transition-colors"
                          >
                            Oui
                          </button>
                          <span className="text-red-300">·</span>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
                          >
                            Non
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(c.id)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Supprimer cette charte"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── VUE LECTURE SEULE (users simples) ─────────────────
  if (viewMode === 'reader' && generated) {
    return (
      <div className="min-h-screen bg-slate-50 py-10 px-4">
        <div className="max-w-4xl mx-auto">

          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => setViewMode('list')}
              className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-xl font-black text-slate-900">Charte IA</h2>
              <p className="text-slate-400 text-xs">Lecture seule</p>
            </div>
          </div>

          {/* Actions lecture */}
          <div className="flex items-center justify-end gap-2 mb-5">
            <button
              onClick={copyToClipboard}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-succes-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copié !' : 'Copier'}
            </button>
            <button
              onClick={exportMarkdown}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <FileDown className="w-3.5 h-3.5" /> Markdown
            </button>
            <button
              onClick={exportPDF}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> PDF
            </button>
          </div>

          {/* Contenu charte */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            {/* En-tête */}
            <div className="bg-gradient-to-r from-emerald-900 to-slate-800 px-8 py-6 text-white">
              <div className="flex items-center gap-2 mb-1">
                <ScrollText className="w-5 h-5 text-emerald-300" />
                <span className="text-emerald-300 text-xs font-bold uppercase tracking-widest">Charte IA officielle</span>
              </div>
              <h2 className="text-xl font-black mb-1">{generated.title}</h2>
              <p className="text-emerald-200 text-sm">Version {generated.version} · En vigueur le {new Date(meta.effective_date).toLocaleDateString('fr-FR')}</p>
            </div>

            {/* Sections — lecture seule, pas de crayon */}
            <div className="divide-y divide-slate-50">
              {generated.sections.map(section => (
                <div key={section.id}>
                  <div
                    className="flex items-center justify-between px-6 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => toggleSection(section.id)}
                  >
                    <h3 className="font-bold text-slate-700 text-sm">{section.title}</h3>
                    {collapsedSections.includes(section.id)
                      ? <ChevronDown className="w-4 h-4 text-slate-400" />
                      : <ChevronUp className="w-4 h-4 text-slate-400" />
                    }
                  </div>
                  {!collapsedSections.includes(section.id) && (
                    <div className="px-6 pb-5">
                      <div className="leading-relaxed">
                        {renderMarkdown(section.content)}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-8 py-4 border-t border-slate-100">
              <p className="text-xs text-slate-400">
                Référent : <span className="font-medium text-slate-600">{meta.referent_name} — {meta.referent_email}</span>
              </p>
            </div>
          </div>

        </div>
      </div>
    );
  }

  // ── WIZARD — réservé aux admins ────────────────────────
  // Sécurité : si un user simple arrive ici malgré tout, on le redirige
  if (viewMode === 'wizard' && !isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 py-10 px-4 flex items-center justify-center">
        <div className="text-center bg-white rounded-2xl border border-dashed border-slate-200 p-16 max-w-md">
          <Shield className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="font-bold text-slate-700 mb-1">Accès restreint</h3>
          <p className="text-slate-400 text-sm mb-4">Seuls les administrateurs peuvent créer ou modifier une charte.</p>
          <button onClick={() => setViewMode('list')} className="px-5 py-2 bg-slate-100 text-slate-600 rounded-xl font-medium text-sm hover:bg-slate-200 transition-colors">
            Retour aux chartes
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-4xl mx-auto">

        {/* Header wizard */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-black text-slate-900">Générateur de Charte IA</h2>
            <p className="text-slate-400 text-xs">Étape {step + 1} / 4</p>
          </div>
          <button
            onClick={() => setViewMode('list')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-slate-500 bg-white border border-slate-200 hover:border-emerald-400 hover:text-emerald-700 transition-all"
          >
            <ScrollText className="w-4 h-4" />
            Retour aux chartes
          </button>
        </div>

        {/* Stepper cliquable */}
        <Stepper step={step} onStepClick={(i) => setStep(i)} />

        {/* ─── ÉTAPE 0 : Sélection des défis ─────────────── */}
        {step === 0 && (
          <div>
            <div className="mb-5">
              <h3 className="text-lg font-bold text-slate-800 mb-1">Sélectionnez vos défis IA</h3>
              <p className="text-slate-500 text-sm">
                Choisissez entre 1 et 20 défis à intégrer dans la charte.
                La charte sera alignée avec vos cas d'usage réels.
              </p>
            </div>

            {/* Filtres */}
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="relative flex-1 min-w-[200px]">
                <input
                  type="text"
                  placeholder="Rechercher un défi..."
                  value={defiSearch}
                  onChange={e => setDefiSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <svg className="absolute left-3 top-3 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
              <div className="flex gap-2">
                {(['all', 'Projets Majeurs', 'Gains Rapides'] as const).map(f => (
                  <button key={f} onClick={() => setDefiFilter(f)}
                    className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border
                      ${defiFilter === f ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300'}`}>
                    {f === 'all' ? 'Tous' : f}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 ml-auto">
                <button onClick={() => setSelectedDefis(filteredDefis.slice(0, 20).map(d => d.id))}
                  className="px-3 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                  Tout sélectionner
                </button>
                <button onClick={() => setSelectedDefis([])}
                  className="px-3 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                  Tout désélectionner
                </button>
              </div>
            </div>

            {/* Compteur */}
            <div className="mb-4 text-sm font-bold text-emerald-700 bg-emerald-50 px-4 py-2 rounded-lg inline-flex items-center gap-2">
              <Target className="w-4 h-4" />
              {selectedDefis.length} défi{selectedDefis.length > 1 ? 's' : ''} sélectionné{selectedDefis.length > 1 ? 's' : ''}
              {selectedDefis.length === 20 && <span className="text-amber-600 font-normal text-xs ml-1">(maximum atteint)</span>}
            </div>

            {/* Grille des défis */}
            {filteredDefis.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-200">
                <Target className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">Aucun défi trouvé</p>
                <p className="text-slate-400 text-sm">Votre organisation n'a pas encore de fiches Défi ou aucune ne correspond à la recherche.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-1">
                {filteredDefis.map(d => {
                  const selected = selectedDefis.includes(d.id);
                  const isExpanded = expandedDefi === d.id;
                  // Chercher le nom de l'auteur dans allDefis via user_id
                  return (
                    <div
                      key={d.id}
                      className={`rounded-xl border-2 transition-all
                        ${selected
                          ? 'border-emerald-500 bg-emerald-50 shadow-md shadow-emerald-100'
                          : 'border-slate-100 bg-white hover:border-emerald-200'}`}
                    >
                      {/* Zone principale cliquable pour sélectionner */}
                      <div
                        className="p-4 cursor-pointer"
                        onClick={() => toggleDefi(d.id)}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`shrink-0 w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center transition-all
                            ${selected ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 hover:border-emerald-400'}`}>
                            {selected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-slate-800 text-sm line-clamp-2 mb-1">
                              {d.titreDefi || d.probleme}
                            </p>
                            {/* Auteur + date */}
                            <p className="text-[11px] text-slate-400 mb-1.5 flex items-center gap-2 flex-wrap">
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3" />
                                {d.email || 'Auteur inconnu'}
                              </span>
                              <span className="text-slate-300">·</span>
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(d.created_at).toLocaleDateString('fr-FR')}
                              </span>
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {d.quadrant && (
                                <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium">{d.quadrant}</span>
                              )}
                              {d.score_roi != null && (
                                <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium">ROI: {d.score_roi}</span>
                              )}
                              {d.score_complexite != null && (
                                <span className="text-[10px] px-2 py-0.5 bg-purple-50 text-purple-600 rounded-full font-medium">Complexité: {d.score_complexite}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Bouton voir résumé */}
                      <div className="px-4 pb-3 -mt-1">
                        <button
                          onClick={e => { e.stopPropagation(); setExpandedDefi(isExpanded ? null : d.id); }}
                          className="text-[11px] text-emerald-600 hover:text-emerald-800 font-medium flex items-center gap-1 transition-colors"
                        >
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          {isExpanded ? 'Masquer le résumé' : 'Voir le résumé'}
                        </button>

                        {/* Résumé inline */}
                        {isExpanded && (
                          <div className="mt-2 bg-white rounded-lg border border-slate-200 p-3 text-xs text-slate-600 space-y-2">
                            {d.probleme && (
                              <div>
                                <span className="font-bold text-slate-500 uppercase tracking-wide text-[10px]">Problème</span>
                                <p className="mt-0.5">{d.probleme}</p>
                              </div>
                            )}
                            {d.vision && (
                              <div>
                                <span className="font-bold text-slate-500 uppercase tracking-wide text-[10px]">Vision</span>
                                <p className="mt-0.5">{d.vision}</p>
                              </div>
                            )}
                            {d.contexte_ia && (
                              <div>
                                <span className="font-bold text-slate-500 uppercase tracking-wide text-[10px]">Contexte IA</span>
                                <p className="mt-0.5">{d.contexte_ia}</p>
                              </div>
                            )}
                            {d.questionCle && (
                              <div>
                                <span className="font-bold text-slate-500 uppercase tracking-wide text-[10px]">Question clé</span>
                                <p className="mt-0.5 italic text-emerald-700">« {d.questionCle} »</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── ÉTAPE 1 : Configuration ────────────────────── */}
        {step === 1 && (
          <div>
            <div className="mb-5">
              <h3 className="text-lg font-bold text-slate-800 mb-1">Configurez votre charte</h3>
              <p className="text-slate-500 text-sm">
                Cochez les options applicables. Un champ de précision apparaît pour affiner chaque règle avant génération.
              </p>
            </div>

            <ConfigSection icon={<Cpu className="w-4 h-4 text-emerald-600" />} title="Outils autorisés">
              <ToggleWithPrecision checked={config.tools.ai_assistants} onChange={v => setTools('ai_assistants', v)}
                label="Assistants IA conversationnels" precisionKey="ai_assistants"
                precisionValue={configPrecisions.ai_assistants} onPrecisionChange={setPrecision}
                placeholder="Ex : ChatGPT, Claude, Gemini, Mistral" />
              <ToggleWithPrecision checked={config.tools.code_assistants} onChange={v => setTools('code_assistants', v)}
                label="Assistants de code" precisionKey="code_assistants"
                precisionValue={configPrecisions.code_assistants} onPrecisionChange={setPrecision}
                placeholder="Ex : GitHub Copilot, Cursor, Codeium" />
              <ToggleWithPrecision checked={config.tools.image_generation} onChange={v => setTools('image_generation', v)}
                label="Génération d'images" precisionKey="image_generation"
                precisionValue={configPrecisions.image_generation} onPrecisionChange={setPrecision}
                placeholder="Ex : Midjourney, DALL-E, Stable Diffusion" />
              <ToggleWithPrecision checked={config.tools.video_audio_generation} onChange={v => setTools('video_audio_generation', v)}
                label="Génération vidéo / audio" precisionKey="video_audio_generation"
                precisionValue={configPrecisions.video_audio_generation} onPrecisionChange={setPrecision}
                placeholder="Ex : Sora, ElevenLabs, Synthesia" />
              <ToggleWithPrecision checked={config.tools.autonomous_agents} onChange={v => setTools('autonomous_agents', v)}
                label="Agents autonomes" precisionKey="autonomous_agents"
                precisionValue={configPrecisions.autonomous_agents} onPrecisionChange={setPrecision}
                placeholder="Ex : n8n avec traçabilité des traitements" />
            </ConfigSection>

            <ConfigSection icon={<Database className="w-4 h-4 text-blue-600" />} title="Données et confidentialité">
              <ToggleWithPrecision checked={config.data.client_data} onChange={v => setData('client_data', v)}
                label="Autoriser les données clients dans l'IA" precisionKey="client_data"
                precisionValue={configPrecisions.client_data} onPrecisionChange={setPrecision}
                placeholder="Ex : Sauf données soumises à NDA" />
              <ToggleWithPrecision checked={config.data.confidential_docs} onChange={v => setData('confidential_docs', v)}
                label="Autoriser les documents confidentiels" precisionKey="confidential_docs"
                precisionValue={configPrecisions.confidential_docs} onPrecisionChange={setPrecision}
                placeholder="Ex : Uniquement avec outils hébergés en UE" />
              <ToggleWithPrecision checked={config.data.personal_data} onChange={v => setData('personal_data', v)}
                label="Autoriser le traitement de données personnelles (RGPD)" precisionKey="personal_data"
                precisionValue={configPrecisions.personal_data} onPrecisionChange={setPrecision}
                placeholder="Ex : Sous réserve de consentement explicite" />
              <ToggleWithPrecision checked={config.data.eu_hosted_only} onChange={v => setData('eu_hosted_only', v)}
                label="Restreindre aux outils hébergés en UE / souverains" precisionKey="eu_hosted_only"
                precisionValue={configPrecisions.eu_hosted_only} onPrecisionChange={setPrecision}
                placeholder="Ex : OVHcloud, Scaleway, Microsoft Azure France" />
            </ConfigSection>

            <ConfigSection icon={<BookOpen className="w-4 h-4 text-amber-600" />} title="Usage et pratiques">
              <ToggleWithPrecision checked={config.usage.personal_use_tolerated} onChange={v => setUsage('personal_use_tolerated', v)}
                label="Tolérer l'usage personnel" precisionKey="personal_use_tolerated"
                precisionValue={configPrecisions.personal_use_tolerated} onPrecisionChange={setPrecision}
                placeholder="Ex : Dans la limite de 1h/jour, hors données sensibles" />
              <ToggleWithPrecision checked={config.usage.limited_to_challenges} onChange={v => setUsage('limited_to_challenges', v)}
                label="Limiter aux usages métiers couverts par les défis sélectionnés" precisionKey="limited_to_challenges"
                precisionValue={configPrecisions.limited_to_challenges} onPrecisionChange={setPrecision}
                placeholder="Ex : Tout nouvel usage doit être validé par le référent IA" />
              <ToggleWithPrecision checked={config.usage.human_review_required} onChange={v => setUsage('human_review_required', v)}
                label="Relecture humaine obligatoire des productions IA" precisionKey="human_review_required"
                precisionValue={configPrecisions.human_review_required} onPrecisionChange={setPrecision}
                placeholder="Ex : Avant toute diffusion externe ou prise de décision" />
              <ToggleWithPrecision checked={config.usage.ai_disclosure_required} onChange={v => setUsage('ai_disclosure_required', v)}
                label="Mention obligatoire du recours à l'IA" precisionKey="ai_disclosure_required"
                precisionValue={configPrecisions.ai_disclosure_required} onPrecisionChange={setPrecision}
                placeholder="Ex : Mention 'Contenu généré avec assistance IA'" />
            </ConfigSection>

            <ConfigSection icon={<Scale className="w-4 h-4 text-purple-600" />} title="Gouvernance et conformité">
              <ToggleWithPrecision checked={config.governance.mandatory_training} onChange={v => setGov('mandatory_training', v)}
                label="Formation obligatoire des collaborateurs" precisionKey="mandatory_training"
                precisionValue={configPrecisions.mandatory_training} onPrecisionChange={setPrecision}
                placeholder="Ex : Module e-learning PiloTerra, 2h, avant premier usage" />
              <ToggleWithPrecision checked={config.governance.incident_reporting} onChange={v => setGov('incident_reporting', v)}
                label="Signalement des incidents IA" precisionKey="incident_reporting"
                precisionValue={configPrecisions.incident_reporting} onPrecisionChange={setPrecision}
                placeholder="Ex : Via formulaire interne sous 48h" />
              <ToggleWithPrecision checked={config.governance.cio_approval_for_new_tools} onChange={v => setGov('cio_approval_for_new_tools', v)}
                label="Approbation DSI pour tout nouvel outil" precisionKey="cio_approval_for_new_tools"
                precisionValue={configPrecisions.cio_approval_for_new_tools} onPrecisionChange={setPrecision}
                placeholder="Ex : Délai de réponse maximum 15 jours ouvrés" />
              <ToggleWithPrecision checked={config.governance.quarterly_audit} onChange={v => setGov('quarterly_audit', v)}
                label="Audit trimestriel des usages" precisionKey="quarterly_audit"
                precisionValue={configPrecisions.quarterly_audit} onPrecisionChange={setPrecision}
                placeholder="Ex : Rapport partagé en comité de direction" />
              <ToggleWithPrecision checked={config.governance.ai_act_compliance} onChange={v => setGov('ai_act_compliance', v)}
                label="Conformité IA Act (UE)" precisionKey="ai_act_compliance"
                precisionValue={configPrecisions.ai_act_compliance} onPrecisionChange={setPrecision}
                placeholder="Ex : Systèmes IA à risque limité, classification annuelle" />
              <ToggleWithPrecision checked={config.governance.gdpr_compliance} onChange={v => setGov('gdpr_compliance', v)}
                label="Conformité RGPD" precisionKey="gdpr_compliance"
                precisionValue={configPrecisions.gdpr_compliance} onPrecisionChange={setPrecision}
                placeholder="Ex : DPA signé avec chaque fournisseur IA" />
              <div className="mt-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Conformité sectorielle (optionnel)</label>
                <input
                  type="text"
                  placeholder="Ex : Agriculture biologique, Eau potable, Transport de denrées…"
                  value={config.governance.sector_compliance}
                  onChange={e => setGov('sector_compliance', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </ConfigSection>

            <ConfigSection icon={<Users className="w-4 h-4 text-slate-600" />} title="Champs libres">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Engagements RSE liés à l'IA</label>
                  <textarea
                    rows={2}
                    maxLength={500}
                    placeholder="Ex : Nous nous engageons à mesurer l'empreinte carbone de nos usages IA…"
                    value={config.free_fields.csr_commitments}
                    onChange={e => setFree('csr_commitments', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Outils explicitement interdits</label>
                  <input
                    type="text"
                    placeholder="Ex : Replika, Character.ai, outils non listés sans validation DSI…"
                    value={config.free_fields.forbidden_tools}
                    onChange={e => setFree('forbidden_tools', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>
            </ConfigSection>
          </div>
        )}

        {/* ─── ÉTAPE 2 : Métadonnées entreprise ──────────── */}
        {step === 2 && (
          <div>
            <div className="mb-5">
              <h3 className="text-lg font-bold text-slate-800 mb-1">Informations de l'organisation</h3>
              <p className="text-slate-500 text-sm">Ces données apparaîtront en en-tête de la charte et dans les métadonnées.</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Nom de l'organisation *</label>
                  <input
                    type="text"
                    required
                    value={meta.name}
                    onChange={e => setMeta(m => ({ ...m, name: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                    placeholder="Ex : Coopérative du Grand Est, Syndicat des eaux du Val, Transports Martin SAS"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Secteur d'activité</label>
                  <input
                    type="text"
                    value={meta.sector}
                    onChange={e => setMeta(m => ({ ...m, sector: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                    placeholder="Viticulture, Gestion des déchets, Entreposage…"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Taille de l'organisation</label>
                  <select
                    value={meta.size}
                    onChange={e => setMeta(m => ({ ...m, size: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-white"
                  >
                    <option value="1-10">1 – 10 personnes</option>
                    <option value="10-50">10 – 50 personnes</option>
                    <option value="50-200">50 – 200 personnes</option>
                    <option value="200-1000">200 – 1 000 personnes</option>
                    <option value="1000+">1 000+ personnes</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Date d'entrée en vigueur</label>
                  <input
                    type="date"
                    value={meta.effective_date}
                    onChange={e => setMeta(m => ({ ...m, effective_date: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Référent charte (nom)</label>
                  <input
                    type="text"
                    value={meta.referent_name}
                    onChange={e => setMeta(m => ({ ...m, referent_name: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                    placeholder="Prénom Nom"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Référent charte (email)</label>
                  <input
                    type="email"
                    value={meta.referent_email}
                    onChange={e => setMeta(m => ({ ...m, referent_email: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                    placeholder="email@organisation.fr"
                  />
                </div>
              </div>
            </div>

            {/* Récap défis */}
            <div className="mt-4 bg-emerald-50 border border-emerald-100 rounded-xl p-4">
              <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-2">
                {selectedDefis.length} défi{selectedDefis.length > 1 ? 's' : ''} sélectionné{selectedDefis.length > 1 ? 's' : ''}
              </p>
              <div className="flex flex-wrap gap-2">
                {allDefis.filter(d => selectedDefis.includes(d.id)).map(d => (
                  <span key={d.id} className="text-xs px-3 py-1 bg-white border border-emerald-200 text-emerald-700 rounded-full font-medium">
                    {d.titreDefi || d.probleme.slice(0, 40)}…
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── ÉTAPE 3 : Génération & Prévisualisation ───── */}
        {step === 3 && (
          <div>
            {!generated && !generating && (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-100 shadow-sm">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-8 h-8 text-emerald-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Prêt à générer</h3>
                <p className="text-slate-500 text-sm mb-2">
                  Votre charte sera générée par IA à partir de {selectedDefis.length} défi{selectedDefis.length > 1 ? 's' : ''}
                  et de votre configuration.
                </p>
                <p className="text-slate-400 text-xs mb-8">Délai estimé : 30 à 90 secondes</p>

                {genError && (
                  <div className="mb-6 mx-auto max-w-md bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
                    <div>
                      <p className="font-bold mb-1">Erreur de génération</p>
                      <p>{genError}</p>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => handleGenerate(false)}
                  className="px-8 py-3.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 flex items-center gap-2 mx-auto"
                >
                  <Sparkles className="w-5 h-5" />
                  Générer la charte
                </button>
              </div>
            )}

            {generating && (
              <div className="text-center py-20 bg-white rounded-2xl border border-slate-100 shadow-sm">
                <div className="relative w-16 h-16 mx-auto mb-6">
                  <div className="absolute inset-0 rounded-full border-4 border-emerald-100" />
                  <div className="absolute inset-0 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
                  <Sparkles className="absolute inset-0 m-auto w-6 h-6 text-emerald-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">Génération en cours…</h3>
                <p className="text-slate-400 text-sm">L'IA rédige votre charte à partir de vos défis et configuration.</p>
                <p className="text-slate-300 text-xs mt-1">Cela peut prendre jusqu'à 90 secondes</p>
              </div>
            )}

            {generated && (
              <div>
                {/* Barre d'actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-5 bg-white rounded-xl border border-slate-100 shadow-sm p-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${saveStatus === 'published' ? 'bg-succes-500' : saveStatus === 'saved' ? 'bg-amber-400' : 'bg-slate-300'}`} />
                    <span className="text-xs text-slate-500 font-medium">
                      {saveStatus === 'published' ? 'Publiée' : saveStatus === 'saved' ? 'Brouillon sauvegardé' : 'Non sauvegardé'}
                    </span>
                    {saving && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Actions disponibles pour tout le monde */}
                    <button
                      onClick={() => setMarkdownMode(m => !m)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                      {markdownMode ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      {markdownMode ? 'Vue document' : 'Mode Markdown'}
                    </button>
                    <button
                      onClick={copyToClipboard}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-succes-600" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? 'Copié !' : 'Copier'}
                    </button>
                    <button
                      onClick={exportMarkdown}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                      <FileDown className="w-3.5 h-3.5" /> Markdown
                    </button>
                    <button
                      onClick={exportPDF}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" /> PDF
                    </button>

                    {/* Actions réservées aux admins */}
                    {isAdmin && (
                      <>
                        <button
                          onClick={() => generated && saveCharter(generated, 'draft')}
                          disabled={saving}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50"
                        >
                          <Save className="w-3.5 h-3.5" /> Sauvegarder
                        </button>

                        {/* Publier — visible seulement si pas encore publiée */}
                        {saveStatus !== 'published' && (
                          <button
                            onClick={handlePublish}
                            disabled={saving}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                          >
                            <Send className="w-3.5 h-3.5" />
                            Publier
                          </button>
                        )}

                        {/* Dépublier — visible seulement si publiée */}
                        {saveStatus === 'published' && (
                          <button
                            onClick={() => generated && saveCharter(generated, 'draft')}
                            disabled={saving}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-100 text-amber-700 border border-amber-300 hover:bg-amber-200 transition-colors disabled:opacity-50"
                            title="Repasse la charte en brouillon — elle ne sera plus visible par les membres"
                          >
                            <EyeOff className="w-3.5 h-3.5" />
                            Dépublier
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Contenu */}
                {markdownMode ? (
                  <div className="bg-slate-900 rounded-xl p-6 font-mono text-sm text-slate-300 leading-relaxed overflow-auto max-h-[600px]">
                    <pre className="whitespace-pre-wrap">{generated.raw_markdown}</pre>
                  </div>
                ) : (
                  <div ref={previewRef} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                    {/* En-tête charte */}
                    <div className="bg-gradient-to-r from-emerald-900 to-slate-800 px-8 py-6 text-white">
                      <div className="flex items-center gap-2 mb-1">
                        <ScrollText className="w-5 h-5 text-emerald-300" />
                        <span className="text-emerald-300 text-xs font-bold uppercase tracking-widest">Charte IA</span>
                      </div>
                      <h2 className="text-xl font-black mb-1">{generated.title}</h2>
                      <p className="text-emerald-200 text-sm">
                        Version {generated.version} · En vigueur le {new Date(meta.effective_date).toLocaleDateString('fr-FR')}
                      </p>
                    </div>

                    {/* Sections */}
                    <div className="divide-y divide-slate-50">
                      {generated.sections.map(section => (
                        <div key={section.id} className="group">
                          <div
                            className="flex items-center justify-between px-6 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
                            onClick={() => toggleSection(section.id)}
                          >
                            <h3 className="font-bold text-slate-700 text-sm">{section.title}</h3>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              {/* Bouton édition — admins uniquement */}
                              {isAdmin && (
                                <button
                                  onClick={e => { e.stopPropagation(); startEdit(section); }}
                                  className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600 transition-colors"
                                  title="Éditer cette section"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {collapsedSections.includes(section.id)
                                ? <ChevronDown className="w-4 h-4 text-slate-400" />
                                : <ChevronUp className="w-4 h-4 text-slate-400" />
                              }
                            </div>
                          </div>

                          {!collapsedSections.includes(section.id) && (
                            <div className="px-6 pb-5">
                              {editSection === section.id ? (
                                <div>
                                  <textarea
                                    rows={8}
                                    value={editContent}
                                    onChange={e => setEditContent(e.target.value)}
                                    className="w-full px-4 py-3 rounded-lg border border-emerald-300 focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-mono resize-none"
                                  />
                                  <div className="flex gap-2 mt-2">
                                    <button
                                      onClick={saveEdit}
                                      className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors"
                                    >
                                      Enregistrer
                                    </button>
                                    <button
                                      onClick={() => setEditSection(null)}
                                      className="px-4 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-200 transition-colors"
                                    >
                                      Annuler
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="prose prose-sm max-w-none leading-relaxed">
                                  {renderMarkdown(section.content)}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Footer charte */}
                    <div className="bg-slate-50 px-8 py-4 border-t border-slate-100">
                      <p className="text-xs text-slate-400">
                        Référent : <span className="font-medium text-slate-600">{meta.referent_name} — {meta.referent_email}</span>
                      </p>
                    </div>
                  </div>
                )}

                {/* Mention légale */}
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                  <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">
                    <strong>Validation juriste recommandée</strong> avant toute publication officielle. Cette charte est un point de départ généré par IA.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Navigation ────────────────────────────────── */}
        {step < 3 && (
          <div className="flex justify-between mt-8 pt-4 border-t border-slate-100">
            <button
              onClick={() => step === 0 ? setViewMode('list') : setStep(s => s - 1)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              {step === 0 ? 'Retour' : 'Précédent'}
            </button>
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canGoNext()}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all shadow-md shadow-emerald-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {step === 2 ? 'Générer' : 'Suivant'}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {step === 3 && generated && (
          <div className="flex justify-start mt-6 pt-4 border-t border-slate-100">
            <button
              onClick={() => setViewMode('list')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Retour à mes chartes
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CharteIA;
