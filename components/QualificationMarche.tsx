// =====================================================================
//  PILOTERRA — MULTI-MARCHÉ · Étape 4 : console de qualification
//  Écran super admin de marquage en masse. Sert à trier ce qui est
//  transverse dans les contenus (`piloterra_resources`) et les prompts
//  (`prompts`) actuellement tous marqués agriculture par le backfill.
//
//  Deux sous-vues, même mécanique : tableau compact, sélection multiple,
//  chips de marché à toggle immédiat (ligne par ligne) ou action groupée
//  (sélection). Chaque qualification pose `marche_qualifie_le`, qui sert
//  de filtre « à qualifier » — un tableau `marches` vide (transverse) ou
//  identique au marquage par défaut restent sinon indiscernables d'un
//  contenu jamais revu.
//
//  Nécessite la colonne `marche_qualifie_le` (voir
//  sql/etape4_qualification_marche.sql, à exécuter avant mise en ligne).
// =====================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import {
  Search, Loader2, RefreshCw, ChevronLeft, ChevronRight, Building2, User,
  Library, Check, X, Filter, Layers, CheckCircle2,
} from 'lucide-react';
import { Marche } from './marcheShared';
import { ResourceType } from '../types';

interface QualificationMarcheProps {
  onDataChange?: () => void;
}

// ---------------------------------------------------------------------
//  Types locaux (colonnes strictement nécessaires à cet écran)
// ---------------------------------------------------------------------
interface QualifResource {
  id: string;
  type: ResourceType;
  title: string;
  description: string | null;
  marches: string[] | null;
  marche_qualifie_le: string | null;
  published?: boolean;
}

interface QualifPrompt {
  id: string;
  title: string;
  description: string | null;
  category: string;
  target_tool: string;
  author_type: 'piloterra' | 'organisation';
  scope: 'personal' | 'organisation';
  organisation_id: string | null;
  marches: string[] | null;
  marche_qualifie_le: string | null;
}

type QualifItem = QualifResource | QualifPrompt;

const TYPE_LABELS: Record<string, string> = {
  tool: 'Outil IA', agent: 'Agent IA', usecase: "Cas d'usage", news: 'Actualité',
  learning: 'Formation présentiel', elearning: 'E-learning', data: 'Jeu de données',
  organisation: 'Organisation',
};

const PER_PAGE = 25;

// ---------------------------------------------------------------------
//  Pagination — même mécanique/style que SuperAdminDashboard
// ---------------------------------------------------------------------
const Pagination: React.FC<{ page: number; total: number; onChange: (p: number) => void }> = ({ page, total, onChange }) => {
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  if (totalPages <= 1) return null;
  return (
    <div className="flex justify-center items-center gap-4 mt-4 py-3">
      <button onClick={() => onChange(page - 1)} disabled={page === 1}
        className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-colors">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-sm font-bold text-slate-500">Page {page} sur {totalPages}</span>
      <button onClick={() => onChange(page + 1)} disabled={page === totalPages}
        className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-colors">
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------
//  Chip de marché — reflète l'appartenance, toggle au clic
// ---------------------------------------------------------------------
const MarcheChip: React.FC<{ marche: Marche; active: boolean; disabled?: boolean; onClick: () => void }> = ({ marche, active, disabled, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={active ? `Retirer « ${marche.libelle} »` : `Ajouter « ${marche.libelle} »`}
    style={active ? { backgroundColor: `${marche.couleur_accent}1a`, borderColor: marche.couleur_accent, color: marche.couleur_accent } : undefined}
    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold transition-all disabled:opacity-50 ${
      active ? '' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600'
    }`}
  >
    {active && <Check className="w-3 h-3" />}{marche.libelle}
  </button>
);

// =====================================================================
//  Composant principal
// =====================================================================
export const QualificationMarche: React.FC<QualificationMarcheProps> = ({ onDataChange }) => {
  const [tab, setTab] = useState<'contenus' | 'prompts'>('contenus');
  const [marchesRef, setMarchesRef] = useState<Marche[]>([]);
  const [resources, setResources] = useState<QualifResource[]>([]);
  const [prompts, setPrompts] = useState<QualifPrompt[]>([]);
  const [orgNames, setOrgNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [onlyUnqualified, setOnlyUnqualified] = useState(true);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMarches, setBulkMarches] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  // -------------------------------------------------------------------
  //  Chargement — colonne par colonne, table dédiée par onglet côté DB
  // -------------------------------------------------------------------
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [resResult, promptResult, marchesResult, orgsResult] = await Promise.all([
        supabase.from('piloterra_resources')
          .select('id, type, title, description, marches, marche_qualifie_le, published')
          .order('created_at', { ascending: false }),
        supabase.from('prompts')
          .select('id, title, description, category, target_tool, author_type, scope, organisation_id, marches, marche_qualifie_le')
          .order('created_at', { ascending: false }),
        supabase.from('marches').select('*').eq('actif', true).order('ordre'),
        supabase.from('organisations').select('id, nom'),
      ]);
      if (resResult.error) console.error('Chargement contenus :', resResult.error.message);
      if (promptResult.error) console.error('Chargement prompts :', promptResult.error.message);
      if (marchesResult.error) console.error('Chargement référentiel marchés :', marchesResult.error.message);

      setResources((resResult.data ?? []) as QualifResource[]);
      setPrompts((promptResult.data ?? []) as QualifPrompt[]);
      setMarchesRef((marchesResult.data ?? []) as Marche[]);

      const omap: Record<string, string> = {};
      (orgsResult.data ?? []).forEach((o: any) => { omap[o.id] = o.nom; });
      setOrgNames(omap);
    } catch (e) {
      console.error('Init QualificationMarche :', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Changement d'onglet ou de filtre : on repart d'une sélection propre
  useEffect(() => { setSelected(new Set()); setBulkMarches(new Set()); setPage(1); }, [tab, onlyUnqualified, typeFilter, search]);

  // -------------------------------------------------------------------
  //  Dérivés
  // -------------------------------------------------------------------
  const items: QualifItem[] = tab === 'contenus' ? resources : prompts;

  const resourcesAQualifier = useMemo(() => resources.filter((r) => !r.marche_qualifie_le).length, [resources]);
  const promptsAQualifier = useMemo(() => prompts.filter((p) => !p.marche_qualifie_le).length, [prompts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (onlyUnqualified && it.marche_qualifie_le) return false;
      if (tab === 'contenus' && typeFilter !== 'all' && (it as QualifResource).type !== typeFilter) return false;
      if (q && !it.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, onlyUnqualified, typeFilter, tab, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageClamped = Math.min(page, totalPages);
  const paged = filtered.slice((pageClamped - 1) * PER_PAGE, pageClamped * PER_PAGE);

  // -------------------------------------------------------------------
  //  Application d'un marquage — écrit en base, met à jour l'état local
  // -------------------------------------------------------------------
  const appliquer = useCallback(async (ids: string[], marches: string[]) => {
    if (ids.length === 0) return;
    setSavingIds((prev) => new Set([...prev, ...ids]));
    try {
      const table = tab === 'contenus' ? 'piloterra_resources' : 'prompts';
      const horodatage = new Date().toISOString();
      const { error } = await supabase.from(table).update({ marches, marche_qualifie_le: horodatage }).in('id', ids);
      if (error) throw error;

      const maj = (list: any[]) => list.map((it) => (ids.includes(it.id) ? { ...it, marches, marche_qualifie_le: horodatage } : it));
      if (tab === 'contenus') { setResources(maj); onDataChange?.(); } else { setPrompts(maj); }

      setSelected((prev) => { const n = new Set(prev); ids.forEach((id) => n.delete(id)); return n; });
      setBulkMarches(new Set());
    } catch (err: any) {
      console.error('Qualification marché :', err.message);
      alert("La mise à jour a échoué : " + err.message);
    } finally {
      setSavingIds((prev) => { const n = new Set(prev); ids.forEach((id) => n.delete(id)); return n; });
    }
  }, [tab, onDataChange]);

  // Toggle d'un marché sur UNE ligne — sauvegarde immédiate
  const toggleMarcheLigne = (item: QualifItem, code: string) => {
    const actuels = item.marches ?? [];
    const nouveaux = actuels.includes(code) ? actuels.filter((c) => c !== code) : [...actuels, code];
    appliquer([item.id], nouveaux);
  };

  // -------------------------------------------------------------------
  //  Sélection
  // -------------------------------------------------------------------
  const toggleOne = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const pageTousCoches = paged.length > 0 && paged.every((it) => selected.has(it.id));
  const toggleTousPage = () => setSelected((prev) => {
    const n = new Set(prev);
    paged.forEach((it) => (pageTousCoches ? n.delete(it.id) : n.add(it.id)));
    return n;
  });
  const selectionnerTousFiltres = () => setSelected(new Set(filtered.map((it) => it.id)));
  const viderSelection = () => { setSelected(new Set()); setBulkMarches(new Set()); };

  const toggleBulkMarche = (code: string) => setBulkMarches((prev) => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n; });

  // -------------------------------------------------------------------
  //  Rendu
  // -------------------------------------------------------------------
  const origineType = (r: QualifResource) => TYPE_LABELS[r.type] || r.type;
  const originePrompt = (p: QualifPrompt) => {
    if (p.author_type === 'piloterra') return { label: 'Catalogue PiloTerra', Icon: Library, cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
    if (p.scope === 'personal') return { label: 'Personnel', Icon: User, cls: 'bg-slate-100 text-slate-600 border-slate-200' };
    return { label: p.organisation_id ? (orgNames[p.organisation_id] ?? 'Organisation') : 'Organisation', Icon: Building2, cls: 'bg-indigo-50 text-indigo-700 border-indigo-100' };
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* En-tête + sous-onglets */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 mb-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <button onClick={() => setTab('contenus')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                tab === 'contenus' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}>
              <Layers className="w-4 h-4" />Contenus
              {resourcesAQualifier > 0 && (
                <span className={`inline-flex items-center justify-center rounded-full text-xs font-bold px-2 ${tab === 'contenus' ? 'bg-white/25 text-white' : 'bg-cyan-100 text-cyan-700'}`}>{resourcesAQualifier}</span>
              )}
            </button>
            <button onClick={() => setTab('prompts')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                tab === 'prompts' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}>
              <Library className="w-4 h-4" />Prompts
              {promptsAQualifier > 0 && (
                <span className={`inline-flex items-center justify-center rounded-full text-xs font-bold px-2 ${tab === 'prompts' ? 'bg-white/25 text-white' : 'bg-cyan-100 text-cyan-700'}`}>{promptsAQualifier}</span>
              )}
            </button>
          </div>
          <button onClick={load} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
            <RefreshCw className="w-4 h-4" />Actualiser
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 mb-4 flex flex-col md:flex-row gap-4 items-center shadow-sm">
        <div className="relative w-full md:w-auto">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Rechercher un titre…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full md:w-64 bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-900 focus:outline-none focus:border-cyan-500" />
        </div>
        {tab === 'contenus' && (
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm cursor-pointer">
              <option value="all">Tous les types</option>
              {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm font-medium text-slate-600 cursor-pointer select-none">
          <input type="checkbox" checked={onlyUnqualified} onChange={(e) => setOnlyUnqualified(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500" />
          À qualifier uniquement
        </label>
        <div className="ml-auto text-sm text-slate-400">
          {filtered.length} élément{filtered.length > 1 ? 's' : ''}
        </div>
      </div>

      {/* Barre d'action groupée */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-10 bg-slate-900 text-white rounded-xl p-3 mb-4 shadow-xl flex flex-wrap items-center gap-3">
          <span className="text-sm font-bold pl-1">{selected.size} sélectionné{selected.size > 1 ? 's' : ''}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {marchesRef.map((m) => (
              <MarcheChip key={m.code} marche={m} active={bulkMarches.has(m.code)} onClick={() => toggleBulkMarche(m.code)} />
            ))}
          </div>
          <button
            onClick={() => appliquer(Array.from(selected), Array.from(bulkMarches))}
            disabled={bulkMarches.size === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <Check className="w-4 h-4" />Appliquer à la sélection
          </button>
          <button
            onClick={() => appliquer(Array.from(selected), [])}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold bg-white/10 hover:bg-white/20 transition-colors">
            Marquer transverse
          </button>
          <button onClick={viderSelection} className="ml-auto p-1.5 rounded-lg hover:bg-white/10 transition-colors" title="Annuler la sélection">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 className="w-8 h-8 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-20 text-center">
          <CheckCircle2 className="mx-auto mb-3 w-10 h-10 text-succes-400" />
          <p className="text-slate-500 font-medium">
            {onlyUnqualified ? 'Tout est qualifié ici.' : 'Aucun élément ne correspond à ces filtres.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs font-bold uppercase text-slate-400">
                  <th className="p-3 w-10">
                    <input type="checkbox" checked={pageTousCoches} onChange={toggleTousPage}
                      className="w-4 h-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500" />
                  </th>
                  <th className="p-3">Titre</th>
                  <th className="p-3">{tab === 'contenus' ? 'Type' : 'Origine'}</th>
                  <th className="p-3">Marché(s)</th>
                  <th className="p-3">Statut</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((it) => {
                  const busy = savingIds.has(it.id);
                  const estQualifie = !!it.marche_qualifie_le;
                  const estTransverse = estQualifie && (it.marches ?? []).length === 0;
                  return (
                    <tr key={it.id} className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors ${busy ? 'opacity-50' : ''}`}>
                      <td className="p-3 align-top">
                        <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggleOne(it.id)}
                          className="w-4 h-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500" />
                      </td>
                      <td className="p-3 align-top max-w-xs">
                        <div className="font-bold text-slate-900 line-clamp-1">{it.title}</div>
                        {it.description && <div className="text-xs text-slate-400 line-clamp-1 mt-0.5">{it.description}</div>}
                      </td>
                      <td className="p-3 align-top">
                        {tab === 'contenus' ? (
                          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                            {origineType(it as QualifResource)}
                          </span>
                        ) : (() => {
                          const o = originePrompt(it as QualifPrompt);
                          return (
                            <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-bold ${o.cls}`}>
                              <o.Icon className="w-3 h-3" />{o.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="p-3 align-top">
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {marchesRef.map((m) => (
                            <MarcheChip key={m.code} marche={m} disabled={busy}
                              active={(it.marches ?? []).includes(m.code)}
                              onClick={() => toggleMarcheLigne(it, m.code)} />
                          ))}
                          {(it.marches ?? []).length === 0 && (
                            <span className="text-xs text-slate-400 italic">
                              {estTransverse ? 'Transverse' : '— aucun —'}
                            </span>
                          )}
                          {(it.marches ?? []).length > 0 && (
                            <button
                              onClick={() => appliquer([it.id], [])}
                              disabled={busy}
                              title="Marquer transverse (retirer tous les marchés)"
                              className="text-xs text-slate-300 hover:text-rose-500 transition-colors ml-1"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="p-3 align-top">
                        {estQualifie ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 text-emerald-700 px-2 py-0.5 text-xs font-bold">
                            <Check className="w-3 h-3" />Qualifié
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 text-amber-700 px-2 py-0.5 text-xs font-bold">
                            À qualifier
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && filtered.length > PER_PAGE && (
        <div className="flex items-center justify-between mt-1">
          <button onClick={selectionnerTousFiltres} className="text-xs font-bold text-cyan-700 hover:text-cyan-900 transition-colors">
            Sélectionner les {filtered.length} éléments filtrés
          </button>
          <Pagination page={pageClamped} total={filtered.length} onChange={setPage} />
        </div>
      )}
    </div>
  );
};

export default QualificationMarche;
