import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  Sparkles, ArrowRight, ArrowLeft, Loader2, FileText, Target,
  Inbox, Send, HelpCircle, CheckCircle2, X, Plus, Eye, Trash2,
  Globe, Lock, RefreshCw, ListChecks, BrainCircuit, FileDown, Download,
  User, Calendar, ChevronDown, ChevronUp, Wand2, Copy, Check, Mail, Leaf, ExternalLink, Library
} from 'lucide-react';
import { N8N } from '../n8nConfig';
import { couleursDocument } from './paletteMarche';

// Webhooks n8n, voir n8nConfig.ts
const N8N_CASUSAGE_WEBHOOK_URL = N8N.casUsage;
const N8N_PROTO_WEBHOOK_URL = N8N.protoPrompt;

// Outils cibles pour le prompt de prototype (ordre = ordre d'affichage, 1er = défaut)
const PROTO_TOOLS: { id: string; label: string }[] = [
  { id: 'aistudio', label: 'AI Studio' },
  { id: 'claudecode', label: 'Claude Code' },
  { id: 'lovable', label: 'Lovable' },
  { id: 'copilot', label: 'Copilot' },
];
const PROTO_DEFAULT_TOOL = 'aistudio';

// Correspondance des ids d'outils : Cas d'Usage → Bibliothèque de prompts
const TOOL_ID_MAP: Record<string, string> = {
  aistudio: 'ai_studio', claudecode: 'claude_code', lovable: 'lovable', copilot: 'copilot',
};

// Lit la map des prompts par outil d'une fiche (avec repli sur l'ancien champ proto_prompt)
const getProtoMap = (row: any): Record<string, string> => {
  if (row?.proto_prompts && typeof row.proto_prompts === 'object') return row.proto_prompts;
  if (row?.proto_prompt) return { aistudio: row.proto_prompt }; // rétrocompat ancien format
  return {};
};
const rowHasAnyProto = (row: any): boolean => Object.values(getProtoMap(row)).some(Boolean);
const N8N_PROTO_CODE_WEBHOOK_URL = N8N.protoCode;
const N8N_FRUG_WEBHOOK_URL = N8N.frugalite;

// ── Types locaux ────────────────────────────────────────────────
interface DefiRow {
  id: string;
  user_id: string;
  created_at: string;
  probleme: string;
  vision: string;
  ressources: string;
  contexte_ia: string | null;
  titreDefi: string | null;
  questionCle: string | null;
  pistes: string[];
  quadrant: string | null;
  score_roi: number | null;
  score_complexite: number | null;
  auteur: string;
}

interface CasUsageRow {
  id: string;
  created_at: string;
  status: string;
  titre: string | null;
  diagnostic_id: string | null;
  output_agent: any;
  proto_prompt?: string | null;
  proto_prompts?: Record<string, string> | null;
  proto_url?: string | null;
  frugalite?: any;
}

interface CasUsageIAProps {
  session: any;
  initialViewId?: string;
  filterUserId?: string;
  /** Fiches défi retenues par la recherche de l'espace organisation :
   *  seuls leurs cas d'usage sont listés. Absent = pas de recherche. */
  filterDiagnosticIds?: string[];
  userRole?: string;
}

// ── Helpers ─────────────────────────────────────────────────────
const safeParse = (v: any) => {
  if (!v) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return {}; }
};

const mapDefi = (d: any): DefiRow => {
  const inputs = safeParse(d.inputs_client || d.inputs_clients);
  const out = safeParse(d.output_agent_defi || d.out_agent_defi);
  const pistes = Array.isArray(out.pistesDeReflexion)
    ? out.pistesDeReflexion
    : [out.pistes?.[0], out.pistes?.[1], out.pistes?.[2]].filter(Boolean);
  const matrice = safeParse(d.output_agent_matrice || d.outpout_agent_matrice);
  return {
    id: d.id,
    user_id: d.user_id,
    created_at: d.created_at,
    probleme: inputs.question_1 || inputs.probleme || 'Non défini',
    vision: inputs.question_2 || inputs.vision || '',
    ressources: inputs.question_3 || inputs.ressources || '',
    contexte_ia: out.contexteProbleme || out.contexte || null,
    titreDefi: out.titreDefi || out.titre || null,
    questionCle: out.questionCle || out.question_cle || null,
    pistes,
    quadrant: matrice.quadrant_nom || matrice.quadrant || null,
    score_roi: matrice.score_roi ?? null,
    score_complexite: matrice.score_complexite ?? null,
    auteur: 'Auteur inconnu',
  };
};

// ── Export (mécanique identique à CharteIA) ─────────────────────
const slugify = (s: string) =>
  (s || 'fiche').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();

const buildCasUsageMarkdown = (f: any): string => {
  const lines: string[] = [];
  lines.push(`# ${f.nom || "Fiche Cas d'Usage IA"}`, '');
  if (f.description) lines.push(f.description, '');
  lines.push('## 📥 Entrées', '');
  (f.entrees || []).forEach((x: string) => lines.push(`- ${x}`));
  lines.push('', '## 📤 Sorties', '');
  (f.sorties || []).forEach((x: string) => lines.push(`- ${x}`));
  lines.push('', "## ⚙️ Étapes et traitements de l'agent IA", '');
  (f.etapes || []).forEach((e: any, i: number) =>
    lines.push(`${i + 1}. **${e.titre}** — ${e.detail}`));
  lines.push('', "## ❓ 3 questions auxquelles l'agent doit répondre", '');
  (f.questions_types || []).forEach((q: any) =>
    lines.push(`- **${q.question}**`, `  → ${q.reponse_attendue}`));
  lines.push('', '## 🎯 Objectif', '', f.objectif || '');
  if (f.contexte_operationnel) {
    lines.push('', '## 📅 Contexte opérationnel', '');
    Object.entries(f.contexte_operationnel).forEach(([k, v]) =>
      lines.push(`- **${k}** : ${v}`));
  }
  lines.push('', '---', '_Fiche générée par PiloTerra_');
  return lines.join('\n');
};

const exportCasUsageMarkdown = (f: any) => {
  const blob = new Blob([buildCasUsageMarkdown(f)], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cas-usage-${slugify(f.nom)}.md`;
  a.click();
  URL.revokeObjectURL(url);
};

const exportCasUsagePDF = (f: any) => {
  const c = couleursDocument(); // couleurs du marché actif (étape 10)
  const list = (arr: string[]) => (arr || []).map(x => `<li>${x}</li>`).join('');
  const etapes = (f.etapes || []).map((e: any, i: number) =>
    `<div class="step"><span class="num">${i + 1}</span><div><p class="step-t">${e.titre}</p><p>${e.detail}</p></div></div>`).join('');
  const questions = (f.questions_types || []).map((q: any) =>
    `<div class="q"><p class="q-t">« ${q.question} »</p><p>→ ${q.reponse_attendue}</p></div>`).join('');
  const ctx = f.contexte_operationnel
    ? Object.entries(f.contexte_operationnel).map(([k, v]) =>
        `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')
    : '';

  const html = `
  <!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>${f.nom || "Fiche Cas d'Usage"}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;background:white;}
    .header{background:linear-gradient(135deg,${c[900]},#1e293b);color:white;padding:40px 50px;}
    .header-badge{font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:${c[300]};margin-bottom:8px;}
    .header h1{font-size:24px;font-weight:900;margin-bottom:8px;}
    .header p{font-size:13px;color:${c[200]};line-height:1.6;}
    .content{padding:40px 50px;}
    .section{margin-bottom:28px;page-break-inside:avoid;}
    .section h2{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:${c[600]};border-bottom:2px solid ${c[100]};padding-bottom:6px;margin-bottom:12px;}
    .section ul{padding-left:20px;} .section li{font-size:13px;line-height:1.7;color:#475569;margin-bottom:4px;}
    .cols{display:flex;gap:32px;} .cols>div{flex:1;}
    .step{display:flex;gap:10px;margin-bottom:10px;page-break-inside:avoid;}
    .num{flex-shrink:0;width:22px;height:22px;border-radius:50%;background:#e0e7ff;color:#4338ca;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;}
    .step-t{font-weight:700;font-size:13px;color:#1e293b;} .step p{font-size:13px;color:#475569;line-height:1.6;}
    .q{background:#fffbeb;border-radius:8px;padding:10px 14px;margin-bottom:8px;page-break-inside:avoid;}
    .q-t{font-weight:700;font-size:13px;color:#1e293b;} .q p{font-size:13px;color:#475569;}
    dl{display:grid;grid-template-columns:1fr 1fr;gap:10px;} dt{font-size:11px;font-weight:700;color:#94a3b8;text-transform:capitalize;} dd{font-size:13px;color:#475569;}
    .footer{margin-top:40px;padding:16px 50px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;}
    @media print{body,.header{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
  </style></head><body>
    <div class="header">
      <div class="header-badge">Fiche Cas d'Usage IA</div>
      <h1>${f.nom || ''}</h1>
      <p>${f.description || ''}</p>
    </div>
    <div class="content">
      <div class="cols">
        <div class="section"><h2>📥 Entrées</h2><ul>${list(f.entrees)}</ul></div>
        <div class="section"><h2>📤 Sorties</h2><ul>${list(f.sorties)}</ul></div>
      </div>
      <div class="section"><h2>⚙️ Étapes et traitements de l'agent IA</h2>${etapes}</div>
      <div class="section"><h2>❓ 3 questions auxquelles l'agent doit répondre</h2>${questions}</div>
      <div class="section"><h2>🎯 Objectif</h2><ul style="list-style:none;padding:0;"><li>${f.objectif || ''}</li></ul></div>
      ${ctx ? `<div class="section"><h2>📅 Contexte opérationnel</h2><dl>${ctx}</dl></div>` : ''}
    </div>
    <div class="footer">Document généré par PiloTerra · ${new Date().toLocaleDateString('fr-FR')}</div>
    <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}</script>
  </body></html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
};

// ── Frugalité AFNOR : score + niveau ────────────────────────────
const FRUG_MAX_PER_BP = 2;
const computeFrugScore = (pratiques: any[] = []) => {
  const valid = pratiques.filter(p => p.score === 0 || p.score === 1 || p.score === 2);
  const total = valid.reduce((s, p) => s + (p.score || 0), 0);
  const max = pratiques.length * FRUG_MAX_PER_BP;
  return { total, max, scoredCount: valid.length, count: pratiques.length };
};
const frugNiveau = (total: number, max: number) => {
  if (max === 0) return { label: '—', emoji: '', cls: 'bg-slate-100 text-slate-500' };
  const pct = total / max;
  if (pct < 0.3) return { label: 'Démarrage', emoji: '🔴', cls: 'bg-red-50 text-red-600' };
  if (pct < 0.55) return { label: 'En éveil', emoji: '🟠', cls: 'bg-orange-50 text-orange-600' };
  if (pct < 0.8) return { label: 'En progression', emoji: '🟡', cls: 'bg-amber-50 text-amber-600' };
  return { label: 'Ambassadeur', emoji: '🌿', cls: 'bg-emerald-50 text-emerald-700' };
};

// Transforme une recommandation (array OU string "1) ... 2) ...") en liste de puces
const toBullets = (value: any): string[] => {
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
  if (typeof value !== 'string') return [];
  const txt = value.trim();
  if (!txt) return [];
  // "1) ... 2) ... 3) ..."  (ou "1. ... 2. ...")
  if (/\s\d+[\).]\s/.test(' ' + txt)) {
    return txt.split(/\s*\d+[\).]\s+/).map(s => s.trim()).filter(Boolean);
  }
  // puces "- " ou "• "
  if (/(^|\n)\s*[-•]\s/.test(txt)) {
    return txt.split(/\n?\s*[-•]\s+/).map(s => s.trim()).filter(Boolean);
  }
  // sinon : un seul paragraphe
  return [txt];
};

const exportFrugalitePDF = (grid: any, titre: string) => {
  const c = couleursDocument(); // couleurs du marché actif (étape 10)
  const pratiques = grid?.pratiques || [];
  const { total, max } = computeFrugScore(pratiques);
  const niv = frugNiveau(total, max);
  const scoreLabel = (s: any) => s === 2 ? 'Fait et documenté' : s === 1 ? 'En cours / partiel' : s === 0 ? 'Pas encore fait' : 'Non renseigné';

  const rows = pratiques.map((p: any) => {
    const recoItems = toBullets(p.recommandations ?? p.recommandation);
    const recoHtml = recoItems.length > 1
      ? `<ul class="reco">${recoItems.map((it: string) => `<li>${it}</li>`).join('')}</ul>`
      : `<p class="bp-r">${recoItems[0] || ''}</p>`;
    return `
    <div class="bp">
      <div class="bp-head"><span class="bp-code">${p.code}</span><span class="bp-title">${p.intitule || ''}</span></div>
      <p class="bp-q">${p.question || ''}</p>
      <p class="bp-lbl">Analyse</p>
      <p class="bp-a">${p.analyse || ''}</p>
      <p class="bp-lbl reco-lbl">Recommandation</p>
      ${recoHtml}
      <p class="bp-s"><strong>Score :</strong> ${scoreLabel(p.score)}</p>
    </div>`;
  }).join('');

  const html = `
  <!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Évaluation frugalité — ${titre}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;background:white;}
    .header{background:linear-gradient(135deg,${c[900]},#1e293b);color:white;padding:36px 50px;}
    .header-badge{font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:${c[300]};margin-bottom:8px;}
    .header h1{font-size:22px;font-weight:900;margin-bottom:6px;}
    .header p{font-size:12px;color:${c[200]};}
    .content{padding:32px 50px;}
    .synth{background:${c[50]};border-left:4px solid ${c[500]};border-radius:8px;padding:14px 18px;margin-bottom:24px;font-size:13px;color:${c[800]};}
    .bp{border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin-bottom:12px;page-break-inside:avoid;}
    .bp-head{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
    .bp-code{background:${c[900]};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;}
    .bp-title{font-size:13px;font-weight:800;color:#0f172a;}
    .bp-q{font-size:12px;font-style:italic;color:#475569;margin-bottom:8px;}
    .bp-lbl{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;margin-bottom:2px;}
    .reco-lbl{color:${c[600]};margin-top:8px;}
    .bp-a{font-size:12px;color:#334155;line-height:1.6;margin-bottom:4px;}
    .reco{margin:0 0 4px 0;padding-left:18px;}
    .reco li{font-size:12px;color:#334155;line-height:1.6;margin-bottom:3px;}
    .bp-r{font-size:12px;color:#334155;line-height:1.6;margin-bottom:4px;}
    .bp-s{font-size:12px;color:#0f172a;margin-top:6px;}
    .total{display:flex;align-items:center;justify-content:space-between;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin-top:20px;}
    .total .big{font-size:24px;font-weight:900;color:${c[900]};}
    .niv{font-size:14px;font-weight:800;padding:6px 14px;border-radius:999px;background:${c[50]};color:${c[800]};}
    .footer{margin-top:28px;padding-top:14px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;}
    @media print{body,.header{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
  </style></head><body>
    <div class="header">
      <div class="header-badge">Évaluation de frugalité · Aligné SPEC AFNOR 2314</div>
      <h1>${titre}</h1>
      <p>Auto-évaluation centrée projet — 8 bonnes pratiques</p>
    </div>
    <div class="content">
      ${grid?.synthese ? `<div class="synth"><strong>Synthèse :</strong> ${grid.synthese}</div>` : ''}
      ${rows}
      <div class="total">
        <div><div style="font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;">Score total</div><div class="big">${total} / ${max}</div></div>
        <div class="niv">${niv.emoji} ${niv.label}</div>
      </div>
      <div class="footer">Auto-évaluation alignée sur les bonnes pratiques de la SPEC AFNOR 2314 (IA frugale). Document généré par PiloTerra · ${new Date().toLocaleDateString('fr-FR')}. L'auto-évaluation engage la seule responsabilité de l'organisation.</div>
    </div>
  </body></html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
};

// ────────────────────────────────────────────────────────────────
export const CasUsageIA: React.FC<CasUsageIAProps> = ({ session, initialViewId, filterUserId, filterDiagnosticIds }) => {
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('');
  const [userId, setUserId] = useState<string | null>(null);

  const [defis, setDefis] = useState<DefiRow[]>([]);
  const [casUsages, setCasUsages] = useState<CasUsageRow[]>([]);

  const filteredDefis = filterUserId && filterUserId !== 'all'
    ? defis.filter(d => d.user_id === filterUserId)
    : defis;

  const filteredCasUsagesParMembre = filterUserId && filterUserId !== 'all'
    ? casUsages.filter(c => {
        if (c.user_id === filterUserId) return true;
        const matchingDefi = defis.find(d => d.id === c.diagnostic_id);
        return matchingDefi && matchingDefi.user_id === filterUserId;
      })
    : casUsages;

  // Recherche de l'espace organisation : cas d'usage des fiches retenues
  const filteredCasUsages = filterDiagnosticIds
    ? filteredCasUsagesParMembre.filter(c => !!c.diagnostic_id && filterDiagnosticIds.includes(c.diagnostic_id))
    : filteredCasUsagesParMembre;

  // Vues : 'list' (accueil) | 'wizard' | 'result'
  const [view, setView] = useState<'list' | 'wizard' | 'result'>('list');

  // Wizard
  const [step, setStep] = useState(0); // 0 = choix défi, 1 = entrées, 2 = sorties, 3 = questions
  const [selectedDefi, setSelectedDefi] = useState<DefiRow | null>(null);
  const [form, setForm] = useState({ entrees: '', sorties: '', questions: '' });

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<any | null>(null);
  const [viewing, setViewing] = useState<CasUsageRow | null>(null);
  const [expandedDefi, setExpandedDefi] = useState<string | null>(null);
  const [showDefiAnswers, setShowDefiAnswers] = useState(false);

  // Prompt proto (étape 1)
  const [showProto, setShowProto] = useState(false);
  const [protoLoading, setProtoLoading] = useState(false);
  const [protoPrompt, setProtoPrompt] = useState<string | null>(null);
  const [protoError, setProtoError] = useState<string | null>(null);
  const [protoCopied, setProtoCopied] = useState(false);
  const [protoRow, setProtoRow] = useState<CasUsageRow | null>(null);
  const [protoTool, setProtoTool] = useState<string>(PROTO_DEFAULT_TOOL);
  const [protoFromCache, setProtoFromCache] = useState(false);
  const [savedToLib, setSavedToLib] = useState<false | 'saving' | 'done' | 'error'>(false);
  const [generatedRow, setGeneratedRow] = useState<CasUsageRow | null>(null);

  // Proto code par mail (étape 2)
  const [protoEmail, setProtoEmail] = useState<string>(session?.user?.email || '');
  const [codeSending, setCodeSending] = useState(false);
  const [codeResult, setCodeResult] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  // Évaluation frugalité AFNOR
  const [showFrug, setShowFrug] = useState(false);
  const [frugLoading, setFrugLoading] = useState(false);
  const [frugError, setFrugError] = useState<string | null>(null);
  const [frugGrid, setFrugGrid] = useState<any | null>(null);
  const [frugRow, setFrugRow] = useState<CasUsageRow | null>(null);
  const [frugFromCache, setFrugFromCache] = useState(false);
  const [frugSaving, setFrugSaving] = useState(false);
  const [frugSaved, setFrugSaved] = useState(false);

  // URL du prototype
  const [protoUrlEditing, setProtoUrlEditing] = useState<string | null>(null); // ID du cas_usage en édition
  const [protoUrlInput, setProtoUrlInput] = useState('');

  // ── Chargement initial ────────────────────────────────────────
  useEffect(() => { init(); /* eslint-disable-next-line */ }, []);

  // ── Auto-ouverture si navigation depuis Vue Pipeline ──────────
  useEffect(() => {
    if (initialViewId && casUsages.length > 0) {
      const target = casUsages.find(c => c.id === initialViewId);
      if (target) setViewing(target);
    }
  }, [initialViewId, casUsages]);

  const init = async () => {
    setLoading(true);
    try {
      const { data: me } = await supabase
        .from('utilisateurs')
        .select('id, organisation_id')
        .eq('auth_id', session.user.id)
        .single();

      if (!me?.organisation_id) { setLoading(false); return; }
      setUserId(me.id);
      setOrgId(me.organisation_id);

      const { data: org } = await supabase
        .from('organisations')
        .select('nom')
        .eq('id', me.organisation_id)
        .single();
      if (org) setOrgName(org.nom);

      await Promise.all([
        loadDefis(me.organisation_id),
        loadCasUsages(me.organisation_id),
      ]);
    } catch (e) {
      console.error('Init CasUsageIA:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadDefis = async (organisationId: string) => {
    const { data: members } = await supabase
      .from('utilisateurs')
      .select('id, prenom, nom')
      .eq('organisation_id', organisationId);
    const memberIds = (members || []).map((m: any) => m.id);
    if (memberIds.length === 0) { setDefis([]); return; }

    // Carte user_id -> "Prénom Nom"
    const authorMap: Record<string, string> = {};
    (members || []).forEach((m: any) => {
      authorMap[m.id] = `${m.prenom || ''} ${m.nom || ''}`.trim() || 'Auteur inconnu';
    });

    const { data: rawDefis } = await supabase
      .from('diagnostics')
      .select('*')
      .in('user_id', memberIds)
      .eq('provenance', 'piloterra')
      .order('created_at', { ascending: false });

    setDefis(
      (rawDefis || [])
        .map(mapDefi)
        .filter(d => d.titreDefi)
        .map(d => ({ ...d, auteur: authorMap[d.user_id] || 'Auteur inconnu' }))
    );
  };

  const loadCasUsages = async (organisationId: string) => {
    const { data } = await supabase
      .from('cas_usage')
      .select('*')
      .eq('organisation_id', organisationId)
      .order('created_at', { ascending: false });
    setCasUsages((data as CasUsageRow[]) || []);
  };

  // ── Wizard : sélection d'un défi (pré-remplissage) ────────────
  const pickDefi = (d: DefiRow) => {
    setSelectedDefi(d);
    setShowDefiAnswers(false);
    setForm({
      entrees:
        "Listez ici les données / fichiers d'entrée, un par ligne.\n" +
        '(Ex : exports CoopViti, observations terrain, bulletins météo…)',
      sorties:
        'Décrivez le ou les livrables attendus.\n' +
        '(Ex : bulletin PDF structuré, tableau de bord, alertes…)',
      questions: [
        d.questionCle ? `1. ${d.questionCle}` : '1. ',
        '2. ',
        '3. ',
      ].join('\n'),
    });
    setStep(1);
  };

  const startWizard = () => {
    setSelectedDefi(null);
    setForm({ entrees: '', sorties: '', questions: '' });
    setGenerated(null);
    setGeneratedRow(null);
    setError(null);
    setStep(0);
    setView('wizard');
  };

  const resetToList = async () => {
    setView('list');
    setStep(0);
    setSelectedDefi(null);
    setGenerated(null);
    setGeneratedRow(null);
    if (orgId) await loadCasUsages(orgId);
  };

  // ── Génération ────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!selectedDefi || !orgId) return;
    setGenerating(true);
    setError(null);

    const payload = {
      request_id: crypto.randomUUID(),
      organisation_id: orgId,
      user_id: userId,
      diagnostic_id: selectedDefi.id,
      defi: {
        titre: selectedDefi.titreDefi || selectedDefi.probleme,
        secteur: '',
        entreprise: orgName,
        contexte: selectedDefi.contexte_ia || selectedDefi.probleme,
        question_cle: selectedDefi.questionCle || '',
        pistes: selectedDefi.pistes.join('\n'),
      },
      user_inputs: {
        entrees: form.entrees,
        sorties: form.sorties,
        questions: form.questions,
      },
      generation_date: new Date().toISOString(),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    try {
      const res = await fetch(N8N_CASUSAGE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);

      const data = await res.json();
      if (data.status === 'success' && data.cas_usage) {
        setGenerated(data.cas_usage);
        await saveCasUsage(data.cas_usage, payload);
        setView('result');
      } else {
        throw new Error(data.message || 'Réponse inattendue du serveur.');
      }
    } catch (e: any) {
      clearTimeout(timeout);
      setError(e.name === 'AbortError'
        ? 'Délai dépassé (120 s). Réessayez.'
        : (e.message || 'Erreur lors de la génération.'));
    } finally {
      setGenerating(false);
    }
  };

  const saveCasUsage = async (casUsage: any, payload: any) => {
    const { data: inserted, error: insErr } = await supabase.from('cas_usage').insert({
      diagnostic_id: payload.diagnostic_id,
      organisation_id: payload.organisation_id,
      user_id: payload.user_id,
      status: 'draft',
      titre: casUsage.nom,
      inputs_user: payload.user_inputs,
      output_agent: casUsage,
    }).select().single();

    if (insErr) {
      console.error('Save cas_usage:', insErr);
      setError('Fiche générée mais non sauvegardée (vérifiez la RLS).');
      // Repli : on affiche quand même la fiche (sans id, le prompt ne sera pas sauvegardable)
      setGeneratedRow({ id: '', created_at: '', status: 'draft', titre: casUsage.nom, diagnostic_id: payload.diagnostic_id, output_agent: casUsage, proto_prompt: null });
    } else {
      setGeneratedRow(inserted as CasUsageRow);
    }
  };

  // ── Cycle de vie ──────────────────────────────────────────────
  const togglePublish = async (row: CasUsageRow) => {
    const next = row.status === 'published' ? 'draft' : 'published';
    await supabase.from('cas_usage').update({ status: next, updated_at: new Date().toISOString() }).eq('id', row.id);
    if (orgId) await loadCasUsages(orgId);
  };

  const deleteCasUsage = async (id: string) => {
    await supabase.from('cas_usage').delete().eq('id', id);
    setViewing(null);
    if (orgId) await loadCasUsages(orgId);
  };

  // ── Met à jour la map des prompts d'une fiche dans tous les états locaux
  const applyProtoToRow = (rowId: string, map: Record<string, string>) => {
    setCasUsages(prev => prev.map(c => c.id === rowId ? { ...c, proto_prompts: map } : c));
    setViewing(prev => prev && prev.id === rowId ? { ...prev, proto_prompts: map } : prev);
    setGeneratedRow(prev => prev && prev.id === rowId ? { ...prev, proto_prompts: map } : prev);
    setProtoRow(prev => prev && prev.id === rowId ? { ...prev, proto_prompts: map } : prev);
  };

  // ── Sauvegarde URL du prototype ────────────────────────────────
  const saveProtoUrl = async (rowId: string, url: string) => {
    const trimmed = url.trim();
    const value = trimmed || null;
    await supabase.from('cas_usage').update({ proto_url: value, updated_at: new Date().toISOString() }).eq('id', rowId);
    setCasUsages(prev => prev.map(c => c.id === rowId ? { ...c, proto_url: value } : c));
    setViewing(prev => prev && prev.id === rowId ? { ...prev, proto_url: value } : prev);
    setGeneratedRow(prev => prev && prev.id === rowId ? { ...prev, proto_url: value } : prev);
    setProtoUrlEditing(null);
  };

  // ── Prompt proto : cache par outil, sinon appel agent + sauvegarde
  const generateProtoPrompt = async (row: CasUsageRow, tool: string = PROTO_DEFAULT_TOOL, force = false) => {
    setShowProto(true);
    setProtoRow(row);
    setProtoTool(tool);
    setProtoError(null);
    setProtoCopied(false);
    setCodeResult(null);
    setCodeError(null);

    const map = getProtoMap(row);

    // 1) Prompt déjà sauvegardé pour cet outil → affichage direct
    if (!force && map[tool]) {
      setProtoPrompt(map[tool]);
      setProtoFromCache(true);
      setProtoLoading(false);
      return;
    }

    // 2) Sinon, appel de l'agent (n8n route vers le bon agent selon "outil")
    setProtoFromCache(false);
    setProtoLoading(true);
    setProtoPrompt(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      const res = await fetch(N8N_PROTO_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: crypto.randomUUID(), organisation_id: orgId, outil: tool, fiche: row.output_agent }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
      const raw = await res.text();
      if (!raw || !raw.trim()) {
        throw new Error("Réponse vide du serveur n8n. Vérifiez que le Switch route bien {{ $json.body.outil }} vers l'agent de l'outil choisi et que sa sortie rejoint le nœud Respond.");
      }
      let data: any;
      try { data = JSON.parse(raw); }
      catch { throw new Error("Réponse non-JSON du serveur : " + raw.slice(0, 120)); }
      const prompt = data.proto_prompt || data.prompt || data.output;
      if (data.status === 'success' && prompt) {
        setProtoPrompt(prompt);
        // 3) Sauvegarde sur la fiche, dans la clé de l'outil
        if (row.id) {
          const newMap = { ...getProtoMap(row), [tool]: prompt };
          const { error: upErr } = await supabase.from('cas_usage')
            .update({ proto_prompts: newMap, updated_at: new Date().toISOString() })
            .eq('id', row.id);
          if (upErr) console.error('Save proto_prompts:', upErr);
          else applyProtoToRow(row.id, newMap);
        }
      } else {
        throw new Error(data.message || 'Réponse inattendue du serveur.');
      }
    } catch (e: any) {
      clearTimeout(timeout);
      setProtoError(e.name === 'AbortError'
        ? 'Délai dépassé (120 s). Réessayez.'
        : (e.message || 'Erreur lors de la génération du prompt.'));
    } finally {
      setProtoLoading(false);
    }
  };

  // Change d'outil dans la modale (cache-first, pas de régénération auto)
  const switchProtoTool = (tool: string) => {
    if (!protoRow) return;
    generateProtoPrompt(protoRow, tool, false);
  };

  const copyProto = () => {
    if (!protoPrompt) return;
    navigator.clipboard.writeText(protoPrompt);
    setProtoCopied(true);
    setTimeout(() => setProtoCopied(false), 2000);
  };

  // Enregistre le proto-prompt courant dans la bibliothèque de prompts (brouillon privé)
  const saveToLibrary = async () => {
    if (!protoRow || !protoPrompt) return;
    setSavedToLib('saving');
    try {
      const { error } = await supabase.from('prompts').insert({
        title: protoRow.titre || 'Prompt de prototype',
        description: "Prompt de prototype généré depuis un cas d'usage.",
        content: protoPrompt,
        target_tool: TOOL_ID_MAP[protoTool] || protoTool,
        category: 'Prototypage & développement',
        tags: [], variables: [], frugality_level: 2,
        author_type: 'organisation',
        organisation_id: orgId,
        created_by: userId,
        status: 'draft', visibility: 'private',
        source_cas_usage_id: protoRow.id,
      });
      if (error) throw error;
      setSavedToLib('done'); setTimeout(() => setSavedToLib(false), 4000);
    } catch (e) {
      console.error('Enregistrement bibliothèque:', e);
      setSavedToLib('error'); setTimeout(() => setSavedToLib(false), 4000);
    }
  };

  // ── Étape 2 : génère le code du proto et l'envoie par mail ────
  const sendProtoCode = async () => {
    if (!protoRow || !protoPrompt) return;
    const email = protoEmail.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setCodeError('Indiquez une adresse e-mail valide.');
      return;
    }
    setCodeSending(true);
    setCodeError(null);
    setCodeResult(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180000); // génération de code = plus longue
    try {
      const res = await fetch(N8N_PROTO_CODE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: crypto.randomUUID(),
          organisation_id: orgId,
          titre: protoRow.titre || protoRow.output_agent?.nom || "Cas d'usage",
          fiche: protoRow.output_agent,
          outil: protoTool,
          proto_prompt: protoPrompt,
          email,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
      const data = await res.json();
      if (data.status === 'success') setCodeResult(`Prototype envoyé à ${data.sent_to || email}.`);
      else throw new Error(data.message || 'Réponse inattendue du serveur.');
    } catch (e: any) {
      clearTimeout(timeout);
      setCodeError(e.name === 'AbortError'
        ? 'Délai dépassé (la génération du code peut prendre 1 à 2 min). Le mail peut tout de même arriver — vérifiez votre boîte.'
        : (e.message || "Erreur lors de l'envoi du prototype."));
    } finally {
      setCodeSending(false);
    }
  };

  // ── Évaluation frugalité AFNOR ────────────────────────────────
  const applyFrugToRow = (rowId: string, grid: any) => {
    setCasUsages(prev => prev.map(c => c.id === rowId ? { ...c, frugalite: grid } : c));
    setViewing(prev => prev && prev.id === rowId ? { ...prev, frugalite: grid } : prev);
    setGeneratedRow(prev => prev && prev.id === rowId ? { ...prev, frugalite: grid } : prev);
    setFrugRow(prev => prev && prev.id === rowId ? { ...prev, frugalite: grid } : prev);
  };

  const saveFrugaliteToDB = async (rowId: string, grid: any) => {
    if (!rowId) return;
    const { error: upErr } = await supabase.from('cas_usage')
      .update({ frugalite: grid, updated_at: new Date().toISOString() })
      .eq('id', rowId);
    if (upErr) console.error('Save frugalite:', upErr);
    else applyFrugToRow(rowId, grid);
  };

  const generateFrugalite = async (row: CasUsageRow, force = false) => {
    setShowFrug(true);
    setFrugRow(row);
    setFrugError(null);
    setFrugSaved(false);

    // Cache : grille déjà évaluée (avec les scores du client)
    if (!force && row.frugalite) {
      setFrugGrid(row.frugalite);
      setFrugFromCache(true);
      setFrugLoading(false);
      return;
    }

    setFrugFromCache(false);
    setFrugLoading(true);
    setFrugGrid(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      const res = await fetch(N8N_FRUG_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: crypto.randomUUID(),
          organisation_id: orgId,
          titre: row.titre || row.output_agent?.nom || "Cas d'usage",
          fiche: row.output_agent,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
      const data = await res.json();
      const grid = data.grille || data.frugalite || (data.status === 'success' ? data.result : null);
      if (data.status === 'success' && grid && Array.isArray(grid.pratiques)) {
        // on s'assure que les scores sont vides au départ
        grid.pratiques = grid.pratiques.map((p: any) => ({ ...p, score: p.score ?? null }));
        setFrugGrid(grid);
        if (row.id) await saveFrugaliteToDB(row.id, grid);
      } else {
        throw new Error(data.message || 'Réponse inattendue du serveur.');
      }
    } catch (e: any) {
      clearTimeout(timeout);
      setFrugError(e.name === 'AbortError'
        ? 'Délai dépassé (120 s). Réessayez.'
        : (e.message || "Erreur lors de l'évaluation de frugalité."));
    } finally {
      setFrugLoading(false);
    }
  };

  const setFrugScore = (code: string, score: number) => {
    setFrugGrid((prev: any) => {
      if (!prev) return prev;
      return { ...prev, pratiques: prev.pratiques.map((p: any) => p.code === code ? { ...p, score } : p) };
    });
    setFrugSaved(false);
  };

  const saveFrugScores = async () => {
    if (!frugRow || !frugGrid) return;
    setFrugSaving(true);
    if (frugRow.id) await saveFrugaliteToDB(frugRow.id, frugGrid);
    setFrugSaving(false);
    setFrugSaved(true);
    setTimeout(() => setFrugSaved(false), 2500);
  };

  // ── Modale du prompt proto (réutilisée dans toutes les vues) ──
  const protoModal = showProto && (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 flex items-center gap-2"><Wand2 className="w-5 h-5 text-indigo-600" /> Prompt de prototype</h3>
          <button onClick={() => setShowProto(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 pt-4 pb-3 border-b border-slate-100">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">Outil cible</p>
          <div className="flex flex-wrap gap-2">
            {PROTO_TOOLS.map(t => {
              const ready = protoRow && !!getProtoMap(protoRow)[t.id];
              const active = protoTool === t.id;
              return (
                <button key={t.id} onClick={() => switchProtoTool(t.id)} disabled={protoLoading}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-50 ${active
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                  {t.label}
                  {ready && <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-white' : 'bg-emerald-500'}`} title="Prompt déjà généré" />}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Le prompt est adapté aux spécificités de l'outil choisi. Une pastille verte indique qu'un prompt est déjà prêt pour cet outil.</p>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {protoLoading && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              <p className="text-sm text-center">L'agent compose le prompt pour {PROTO_TOOLS.find(t => t.id === protoTool)?.label || 'l\'outil'}<br />à partir de la fiche et du catalogue de données…</p>
            </div>
          )}
          {protoError && <p className="text-red-600 text-sm">{protoError}</p>}
          {protoPrompt && (
            <textarea readOnly value={protoPrompt}
              className="w-full h-[50vh] px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-mono resize-none outline-none" />
          )}
        </div>

        {protoPrompt && (
          <div className="flex items-center justify-between gap-3 p-4 border-t border-slate-100">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => protoRow && generateProtoPrompt(protoRow, protoTool, true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors shrink-0">
                <RefreshCw className="w-3.5 h-3.5" /> Régénérer
              </button>
              <button onClick={saveToLibrary} disabled={savedToLib === 'saving' || savedToLib === 'done'}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shrink-0 disabled:opacity-60">
                {savedToLib === 'done' ? <><Check className="w-3.5 h-3.5" /> Enregistré</>
                  : savedToLib === 'saving' ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> …</>
                  : <><Library className="w-3.5 h-3.5" /> Enregistrer dans la bibliothèque</>}
              </button>
              <p className="text-xs text-slate-400 truncate">
                {protoFromCache
                  ? `Prompt ${PROTO_TOOLS.find(t => t.id === protoTool)?.label || ''} sauvegardé.`
                  : `Nouveau prompt ${PROTO_TOOLS.find(t => t.id === protoTool)?.label || ''} — enregistré.`}
              </p>
            </div>
            <button onClick={copyProto}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shrink-0">
              {protoCopied ? <><Check className="w-4 h-4" /> Copié !</> : <><Copy className="w-4 h-4" /> Copier le prompt</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // ── Modale Évaluation frugalité AFNOR ─────────────────────────
  const frugTotals = computeFrugScore(frugGrid?.pratiques || []);
  const frugLevel = frugNiveau(frugTotals.total, frugTotals.max);
  const scoreOptions = [
    { v: 0, label: 'Pas encore fait' },
    { v: 1, label: 'En cours / partiel' },
    { v: 2, label: 'Fait et documenté' },
  ];

  const frugModal = showFrug && (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900 flex items-center gap-2"><Leaf className="w-5 h-5 text-emerald-600" /> Évaluation de frugalité</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Aligné sur les bonnes pratiques de la SPEC AFNOR 2314 — centrée projet</p>
          </div>
          <button onClick={() => setShowFrug(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 bg-slate-50">
          {frugLoading && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
              <p className="text-sm text-center">L'agent analyse le projet au regard des bonnes pratiques AFNOR…</p>
            </div>
          )}
          {frugError && <p className="text-red-600 text-sm">{frugError}</p>}

          {frugGrid && (
            <div className="space-y-3">
              {frugGrid.synthese && (
                <div className="bg-emerald-50 border-l-4 border-emerald-500 rounded-lg p-3 text-sm text-emerald-800">
                  <span className="font-bold">Synthèse : </span>{frugGrid.synthese}
                </div>
              )}

              {(frugGrid.pratiques || []).map((p: any) => {
                const recoItems = toBullets(p.recommandations ?? p.recommandation);
                return (
                <div key={p.code} className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="bg-emerald-700 text-white text-[10px] font-bold px-2 py-0.5 rounded">{p.code}</span>
                    <span className="font-bold text-slate-900 text-sm">{p.intitule}</span>
                  </div>
                  {p.question && <p className="text-xs italic text-slate-500 mb-3">{p.question}</p>}

                  {p.analyse && (
                    <div className="mb-3">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">Analyse</p>
                      <p className="text-sm text-slate-700 leading-relaxed">{p.analyse}</p>
                    </div>
                  )}

                  {recoItems.length > 0 && (
                    <div className="mb-3 bg-emerald-50/40 rounded-lg p-3">
                      <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-wide mb-1.5">Recommandation</p>
                      {recoItems.length === 1 ? (
                        <p className="text-sm text-slate-700 leading-relaxed">{recoItems[0]}</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {recoItems.map((it, i) => (
                            <li key={i} className="flex gap-2 text-sm text-slate-700 leading-relaxed">
                              <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                              <span>{it}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    {scoreOptions.map(opt => (
                      <button key={opt.v} onClick={() => setFrugScore(p.code, opt.v)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${p.score === opt.v
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-300'}`}>
                        {opt.v} · {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>

        {frugGrid && (
          <div className="flex items-center justify-between gap-3 p-4 border-t border-slate-100">
            <div className="flex items-center gap-3">
              <div className="text-sm">
                <span className="font-black text-emerald-700 text-lg">{frugTotals.total}</span>
                <span className="text-slate-400"> / {frugTotals.max}</span>
              </div>
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${frugLevel.cls}`}>{frugLevel.emoji} {frugLevel.label}</span>
              {frugTotals.scoredCount < frugTotals.count && (
                <span className="text-[11px] text-slate-400">{frugTotals.count - frugTotals.scoredCount} BP à scorer</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => frugRow && generateFrugalite(frugRow, true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors" title="Régénérer l'analyse (efface les scores)">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => exportFrugalitePDF(frugGrid, frugRow?.titre || frugRow?.output_agent?.nom || 'Cas d\'usage')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                <Download className="w-3.5 h-3.5" /> PDF
              </button>
              <button onClick={saveFrugScores} disabled={frugSaving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50">
                {frugSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : frugSaved ? <><Check className="w-4 h-4" /> Enregistré</> : 'Enregistrer'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
  const ExportBar = ({ row }: { row: CasUsageRow }) => {
    const f = row.output_agent;
    const hasProto = rowHasAnyProto(row);
    const isEditingUrl = protoUrlEditing === row.id;
    return (
      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        <button onClick={() => generateProtoPrompt(row, PROTO_DEFAULT_TOOL)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
          <Wand2 className="w-3.5 h-3.5" /> {hasProto ? 'Voir le prompt' : 'Prompt proto'}
        </button>
        <button onClick={() => generateFrugalite(row)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors">
          <Leaf className="w-3.5 h-3.5" /> {row.frugalite ? 'Frugalité' : 'Frugalité AFNOR'}
        </button>
        <button onClick={() => exportCasUsageMarkdown(f)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
          <FileDown className="w-3.5 h-3.5" /> Markdown
        </button>
        <button onClick={() => exportCasUsagePDF(f)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
          <Download className="w-3.5 h-3.5" /> PDF
        </button>

        {/* URL du prototype */}
        {isEditingUrl ? (
          <div className="flex items-center gap-1">
            <input
              value={protoUrlInput}
              onChange={e => setProtoUrlInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveProtoUrl(row.id, protoUrlInput); if (e.key === 'Escape') setProtoUrlEditing(null); }}
              placeholder="https://..."
              className="px-2.5 py-1 text-xs border border-blue-300 rounded-lg w-52 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
              autoFocus
            />
            <button onClick={() => saveProtoUrl(row.id, protoUrlInput)}
              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Enregistrer">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setProtoUrlEditing(null)}
              className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg" title="Annuler">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : row.proto_url ? (
          <div className="flex items-center gap-1">
            <a href={row.proto_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              title={row.proto_url}>
              <ExternalLink className="w-3.5 h-3.5" /> Voir le proto
            </a>
            <button onClick={() => { setProtoUrlEditing(row.id); setProtoUrlInput(row.proto_url || ''); }}
              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Modifier l'URL">
              <Wand2 className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button onClick={() => { setProtoUrlEditing(row.id); setProtoUrlInput(''); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 transition-colors">
            <ExternalLink className="w-3.5 h-3.5" /> URL Proto
          </button>
        )}
      </div>
    );
  };

  // ── Rendu d'une fiche cas d'usage ─────────────────────────────
  const FicheView = ({ row }: { row: CasUsageRow }) => {
    const f = row.output_agent;
    return (
    <div className="space-y-6">
      <div>
        <div className="flex justify-end mb-4">
          <ExportBar row={row} />
        </div>
        <h3 className="text-2xl font-bold text-slate-900">{f.nom}</h3>
        <p className="text-slate-600 mt-2">{f.description}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Block icon={<Inbox className="w-5 h-5" />} title="Entrées" color="blue">
          <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
            {(f.entrees || []).map((x: string, i: number) => <li key={i}>{x}</li>)}
          </ul>
        </Block>
        <Block icon={<Send className="w-5 h-5" />} title="Sorties" color="emerald">
          <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
            {(f.sorties || []).map((x: string, i: number) => <li key={i}>{x}</li>)}
          </ul>
        </Block>
      </div>

      <Block icon={<ListChecks className="w-5 h-5" />} title="Étapes et traitements de l'agent IA" color="indigo">
        <ol className="space-y-3">
          {(f.etapes || []).map((e: any, i: number) => (
            <li key={i} className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
              <div>
                <p className="font-bold text-slate-800 text-sm">{e.titre}</p>
                <p className="text-sm text-slate-600">{e.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </Block>

      <Block icon={<HelpCircle className="w-5 h-5" />} title="3 questions auxquelles l'agent doit répondre" color="amber">
        <div className="space-y-3">
          {(f.questions_types || []).map((q: any, i: number) => (
            <div key={i} className="bg-amber-50/60 rounded-lg p-3">
              <p className="font-bold text-slate-800 text-sm">« {q.question} »</p>
              <p className="text-sm text-slate-600 mt-1">→ {q.reponse_attendue}</p>
            </div>
          ))}
        </div>
      </Block>

      <Block icon={<Target className="w-5 h-5" />} title="Objectif" color="emerald">
        <p className="text-sm text-slate-700">{f.objectif}</p>
      </Block>

      {f.contexte_operationnel && (
        <Block icon={<BrainCircuit className="w-5 h-5" />} title="Contexte opérationnel" color="slate">
          <dl className="grid sm:grid-cols-2 gap-2 text-sm">
            {Object.entries(f.contexte_operationnel).map(([k, v]) => (
              <div key={k}>
                <dt className="font-bold text-slate-500 capitalize">{k}</dt>
                <dd className="text-slate-700">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </Block>
      )}
    </div>
    );
  };

  // ════════════════════════════════════════════════════════════
  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>;
  }

  // ── VUE LISTE ─────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-6 h-6 text-emerald-600" /> Fiches Cas d'Usage IA
            </h2>
            <p className="text-slate-500 text-sm">Transformez une fiche défi en cas d'usage opérationnel.</p>
          </div>
          <button onClick={startWizard}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold shadow hover:bg-emerald-700 transition-colors">
            <Plus className="w-4 h-4" /> Nouvelle fiche
          </button>
        </div>

        {casUsages.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl border border-slate-200">
            <Sparkles className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-700">Aucune fiche cas d'usage</h3>
            <p className="text-slate-500 text-sm mb-6">Sélectionnez une fiche défi pour générer votre premier cas d'usage.</p>
            <button onClick={startWizard} className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700">Commencer</button>
          </div>
        ) : filteredCasUsages.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl border border-slate-200">
            <Sparkles className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-700">Aucune fiche correspondante</h3>
            <p className="text-slate-500 text-sm">Aucun cas d'usage trouvé pour le membre sélectionné.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCasUsages.map(c => (
              <div key={c.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                <div className="flex items-start justify-between mb-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${c.status === 'published' ? 'bg-succes-100 text-succes-700' : 'bg-slate-100 text-slate-500'}`}>
                    {c.status === 'published' ? 'Publié' : 'Brouillon'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {rowHasAnyProto(c) && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-600" title={`Prompt(s) prêts : ${Object.keys(getProtoMap(c)).filter(k => getProtoMap(c)[k]).map(k => PROTO_TOOLS.find(t=>t.id===k)?.label || k).join(', ')}`}>
                        <Wand2 className="w-3 h-3" /> Prompt
                        {Object.values(getProtoMap(c)).filter(Boolean).length > 1 && ` ×${Object.values(getProtoMap(c)).filter(Boolean).length}`}
                      </span>
                    )}
                    <span className="text-xs text-slate-400">{new Date(c.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <h3 className="font-bold text-slate-900 line-clamp-2 flex-grow">{c.titre || 'Sans titre'}</h3>
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-50">
                  <button onClick={() => setViewing(c)} className="flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700">
                    <Eye className="w-4 h-4" /> Voir
                  </button>
                  <button onClick={() => exportCasUsagePDF(c.output_agent)} className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700" title="Télécharger en PDF">
                    <Download className="w-4 h-4" /> PDF
                  </button>
                  <button onClick={() => togglePublish(c)} className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700 ml-auto">
                    {c.status === 'published' ? <Lock className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
                    {c.status === 'published' ? 'Dépublier' : 'Publier'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modale détail */}
        {viewing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <h3 className="font-bold text-slate-900">Fiche Cas d'Usage</h3>
                <div className="flex items-center gap-2">
                  <button onClick={() => deleteCasUsage(viewing.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="Supprimer"><Trash2 className="w-5 h-5" /></button>
                  <button onClick={() => setViewing(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
                </div>
              </div>
              <div className="overflow-y-auto p-6 bg-slate-50"><FicheView row={viewing} /></div>
            </div>
          </div>
        )}

        {protoModal}
        {frugModal}
      </div>
    );
  }

  // ── VUE RÉSULTAT ──────────────────────────────────────────────
  if (view === 'result' && generatedRow) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <p className="font-bold">Fiche Cas d'Usage générée et enregistrée (brouillon).</p>
        </div>
        {error && <p className="text-amber-700 text-sm">{error}</p>}
        <div className="bg-white p-6 rounded-xl border border-slate-200"><FicheView row={generatedRow} /></div>
        <div className="flex justify-end">
          <button onClick={resetToList} className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700">Terminer</button>
        </div>
        {protoModal}
        {frugModal}
      </div>
    );
  }

  // ── VUE WIZARD ────────────────────────────────────────────────
  const steps = ['Fiche défi', 'Entrées', 'Sorties', 'Questions'];
  return (
    <div className="space-y-6">
      {/* En-tête + progression */}
      <div className="flex items-center justify-between">
        <button onClick={resetToList} className="flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-slate-700">
          <ArrowLeft className="w-4 h-4" /> Retour
        </button>
        <div className="flex items-center gap-2">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center ${i <= step ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{i + 1}</div>
              {i < steps.length - 1 && <div className={`w-6 h-0.5 ${i < step ? 'bg-emerald-600' : 'bg-slate-200'}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* Étape 0 : choix du défi */}
      {step === 0 && (
        <div>
          <h3 className="text-lg font-bold text-slate-900 mb-1">Sélectionnez une fiche défi</h3>
          <p className="text-slate-500 text-sm mb-4">Elle servira de base au cas d'usage.</p>
          {filteredDefis.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200 text-slate-500">
              {defis.length === 0
                ? "Aucune fiche défi disponible dans votre organisation."
                : "Aucune fiche défi disponible pour le membre sélectionné."}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {filteredDefis.map(d => {
                const isExpanded = expandedDefi === d.id;
                return (
                  <div key={d.id} onClick={() => pickDefi(d)}
                    className="cursor-pointer bg-white p-4 rounded-xl border border-slate-200 hover:border-emerald-400 hover:shadow-md transition-all">
                    <div className="flex items-start justify-between">
                      <h4 className="font-bold text-slate-900 line-clamp-2 pr-2">{d.titreDefi}</h4>
                      <ArrowRight className="w-4 h-4 text-emerald-600 shrink-0 mt-1" />
                    </div>

                    {/* Auteur + date */}
                    <p className="text-[11px] text-slate-400 mt-1.5 mb-2 flex items-center gap-2 flex-wrap">
                      <span className="flex items-center gap-1"><User className="w-3 h-3" />{d.auteur}</span>
                      <span className="text-slate-300">·</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(d.created_at).toLocaleDateString('fr-FR')}</span>
                    </p>

                    {/* Badges quadrant / ROI / complexité */}
                    <div className="flex flex-wrap gap-1.5">
                      {d.quadrant && <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium">{d.quadrant}</span>}
                      {d.score_roi != null && <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium">ROI: {d.score_roi}</span>}
                      {d.score_complexite != null && <span className="text-[10px] px-2 py-0.5 bg-purple-50 text-purple-600 rounded-full font-medium">Complexité: {d.score_complexite}</span>}
                    </div>

                    {/* Voir le résumé */}
                    <button
                      onClick={(e) => { e.stopPropagation(); setExpandedDefi(isExpanded ? null : d.id); }}
                      className="mt-2 text-[11px] text-emerald-600 hover:text-emerald-800 font-medium flex items-center gap-1 transition-colors">
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {isExpanded ? 'Masquer le résumé' : 'Voir le résumé'}
                    </button>
                    {isExpanded && (
                      <p className="mt-2 text-xs text-slate-500 leading-relaxed border-t border-slate-100 pt-2">{d.contexte_ia || d.probleme}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Étapes 1–3 : saisie */}
      {step >= 1 && selectedDefi && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-bold text-emerald-600 uppercase tracking-wide">{selectedDefi.titreDefi}</div>
            <button
              onClick={() => setShowDefiAnswers(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors shrink-0">
              <FileText className="w-3.5 h-3.5" />
              Mes réponses à la fiche défi
              {showDefiAnswers ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {showDefiAnswers && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div>
                <h5 className="text-[11px] font-bold text-slate-400 uppercase mb-1">Le Problème</h5>
                <p className="text-sm text-slate-700 whitespace-pre-line">{selectedDefi.probleme || '—'}</p>
              </div>
              {selectedDefi.vision && (
                <div>
                  <h5 className="text-[11px] font-bold text-slate-400 uppercase mb-1">La Vision</h5>
                  <p className="text-sm text-slate-700 whitespace-pre-line">{selectedDefi.vision}</p>
                </div>
              )}
              {selectedDefi.ressources && (
                <div>
                  <h5 className="text-[11px] font-bold text-slate-400 uppercase mb-1">Les Ressources</h5>
                  <p className="text-sm text-slate-700 whitespace-pre-line">{selectedDefi.ressources}</p>
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <WizardField
              icon={<Inbox className="w-5 h-5 text-blue-600" />}
              title="Quelles sont les entrées ?"
              hint="Détaillez les données, fichiers et sources que l'agent recevra."
              value={form.entrees}
              onChange={(v) => setForm(f => ({ ...f, entrees: v }))}
            />
          )}
          {step === 2 && (
            <WizardField
              icon={<Send className="w-5 h-5 text-emerald-600" />}
              title="Quelles sont les sorties attendues ?"
              hint="Décrivez précisément les livrables produits par l'agent."
              value={form.sorties}
              onChange={(v) => setForm(f => ({ ...f, sorties: v }))}
            />
          )}
          {step === 3 && (
            <WizardField
              icon={<HelpCircle className="w-5 h-5 text-amber-600" />}
              title="3 questions auxquelles l'agent doit répondre"
              hint="Une question par ligne (3 attendues)."
              value={form.questions}
              onChange={(v) => setForm(f => ({ ...f, questions: v }))}
            />
          )}

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <div className="flex items-center justify-between pt-2">
            <button onClick={() => setStep(s => s - 1)}
              className="flex items-center gap-1 px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-lg">
              <ArrowLeft className="w-4 h-4" /> Précédent
            </button>
            {step < 3 ? (
              <button onClick={() => setStep(s => s + 1)}
                className="flex items-center gap-1 px-5 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700">
                Suivant <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={handleGenerate} disabled={generating}
                className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Génération…</> : <><Sparkles className="w-4 h-4" /> Générer la fiche</>}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Sous-composants ─────────────────────────────────────────────
const WizardField = ({ icon, title, hint, value, onChange }: {
  icon: React.ReactNode; title: string; hint: string; value: string; onChange: (v: string) => void;
}) => (
  <div>
    <div className="flex items-center gap-2 mb-1">{icon}<h3 className="font-bold text-slate-900">{title}</h3></div>
    <p className="text-sm text-slate-500 mb-3">{hint}</p>
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={8}
      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-y"
    />
  </div>
);

const colorMap: Record<string, string> = {
  blue: 'text-blue-600', emerald: 'text-emerald-600', indigo: 'text-indigo-600',
  amber: 'text-amber-600', slate: 'text-slate-600',
};
const Block = ({ icon, title, color, children }: {
  icon: React.ReactNode; title: string; color: string; children: React.ReactNode;
}) => (
  <div className="bg-white rounded-xl border border-slate-200 p-4">
    <div className={`flex items-center gap-2 mb-3 font-bold ${colorMap[color] || 'text-slate-600'}`}>{icon}<span className="text-slate-900">{title}</span></div>
    {children}
  </div>
);

export default CasUsageIA;
