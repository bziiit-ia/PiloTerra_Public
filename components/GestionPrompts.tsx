// =====================================================================
//  PILOTERRA — GESTION DES PROMPTS (interface Super Admin)
//  Trois sous-vues :
//    - À valider          : modération des prompts proposés par les orgs
//    - Communauté         : prompts publics approuvés (modération a posteriori)
//    - Catalogue PiloTerra : création / édition des prompts officiels
//  Le RLS autorise le super_admin à voir et gérer tous les prompts.
// =====================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import {
  CheckSquare, Check, X, Leaf, Loader2, ChevronDown, ChevronUp,
  Building2, RefreshCw, Library, Plus, Pencil, Copy, FileText, Globe, Users, User,
} from 'lucide-react';
import { Prompt, toolLabel, FRUGALITY_META, parseVariables } from './promptShared';
import { PromptEditor } from './PromptEditor';

interface GestionPromptsProps {
  session: any;
}

const varCount = (raw: any): number => {
  const p = parseVariables(raw);
  return p.length;
};

export const GestionPrompts: React.FC<GestionPromptsProps> = ({ session }) => {
  const [tab, setTab] = useState<'moderation' | 'community' | 'catalogue'>('moderation');

  const [pending, setPending] = useState<Prompt[]>([]);
  const [community, setCommunity] = useState<Prompt[]>([]);
  const [catalogue, setCatalogue] = useState<Prompt[]>([]);
  const [orgNames, setOrgNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectMotif, setRejectMotif] = useState('');

  const [editing, setEditing] = useState<{ prompt: Prompt | null } | null>(null);

  const [featuredIds, setFeaturedIds] = useState<Set<string>>(new Set());
  const [togglingFeatured, setTogglingFeatured] = useState<string | null>(null);

  // -------------------------------------------------------------------
  //  Chargement
  // -------------------------------------------------------------------
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: pend } = await supabase
        .from('prompts')
        .select('*')
        .eq('moderation_status', 'pending')
        .order('created_at', { ascending: true });
      setPending(((pend ?? []).map((p: any) => ({ ...p, variables: parseVariables(p.variables) }))) as Prompt[]);

      const { data: cat } = await supabase
        .from('prompts')
        .select('*')
        .eq('author_type', 'piloterra')
        .order('created_at', { ascending: false });
      setCatalogue(((cat ?? []).map((p: any) => ({ ...p, variables: parseVariables(p.variables) }))) as Prompt[]);

      // Prompts publics approuvés (communauté) — modération a posteriori
      const { data: comm } = await supabase
        .from('prompts')
        .select('*')
        .eq('author_type', 'organisation')
        .eq('visibility', 'public')
        .eq('moderation_status', 'approved')
        .eq('status', 'published')
        .order('usage_count', { ascending: false });
      setCommunity(((comm ?? []).map((p: any) => ({ ...p, variables: parseVariables(p.variables) }))) as Prompt[]);

      const { data: orgs } = await supabase.from('organisations').select('id, nom');
      const map: Record<string, string> = {};
      (orgs ?? []).forEach((o: any) => { map[o.id] = o.nom; });
      setOrgNames(map);

      // Charger les prompts mis en avant (featured)
      const { data: featData } = await supabase
        .from('piloterra_resources')
        .select('*')
        .eq('published', true);
        
      const ids = new Set<string>();
      (featData ?? []).forEach((r: any) => {
        if (r.metadata?.is_public_prompt === true && r.metadata?.prompt?.id) {
          ids.add(r.metadata.prompt.id);
        }
      });
      setFeaturedIds(ids);
    } catch (e) {
      console.error('Init GestionPrompts:', e);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // -------------------------------------------------------------------
  //  Modération
  // -------------------------------------------------------------------
  const approve = async (id: string) => {
    setBusyId(id);
    await supabase.from('prompts').update({ moderation_status: 'approved', moderation_note: null }).eq('id', id);
    setPending((prev) => prev.filter((p) => p.id !== id));
    setBusyId(null);
  };
  const reject = async (id: string) => {
    setBusyId(id);
    await supabase.from('prompts').update({ moderation_status: 'rejected', moderation_note: rejectMotif.trim() || null }).eq('id', id);
    setPending((prev) => prev.filter((p) => p.id !== id));
    setRejectingId(null); setRejectMotif(''); setBusyId(null);
  };

  // Retrait a posteriori d'un prompt de la communauté (le repasse en refusé,
  // motif transmis à l'organisation ; le prompt lui reste visible en interne).
  const removeFromCommunity = async (id: string) => {
    setBusyId(id);
    await supabase.from('prompts')
      .update({ moderation_status: 'rejected', moderation_note: rejectMotif.trim() || 'Retiré de la communauté par PiloTerra' })
      .eq('id', id);
    setCommunity((prev) => prev.filter((p) => p.id !== id));
    setRejectingId(null); setRejectMotif(''); setBusyId(null);
  };

  const toggleFeaturedPublic = async (p: Prompt, e: React.MouseEvent) => {
    e.stopPropagation();
    setTogglingFeatured(p.id);
    try {
      const isFeat = featuredIds.has(p.id);
      if (!isFeat && featuredIds.size >= 9) {
        alert("Vous pouvez sélectionner un maximum de 9 prompts publics mis en avant.");
        return;
      }

      if (isFeat) {
        // Retirer de piloterra_resources
        const { data: res } = await supabase
          .from('piloterra_resources')
          .select('id, metadata')
          .eq('published', true);
        const target = (res ?? []).find((r: any) => r.metadata?.is_public_prompt && r.metadata?.prompt?.id === p.id);
        if (target) {
          const { error } = await supabase.from('piloterra_resources').delete().eq('id', target.id);
          if (error) throw error;
        }
        setFeaturedIds((prev) => {
          const n = new Set(prev);
          n.delete(p.id);
          return n;
        });
      } else {
        // Ajouter à piloterra_resources
        const resourceId = '00000000-0000-0000-0000-' + Math.random().toString(10).substring(2, 14).padStart(12, '0');
        const payload = {
          id: resourceId,
          type: 'tool',
          title: p.title,
          description: p.description || '',
          published: true,
          metadata: {
            is_public_prompt: true,
            prompt: p
          }
        };
        const { error } = await supabase.from('piloterra_resources').insert(payload);
        if (error) throw error;
        setFeaturedIds((prev) => {
          const n = new Set(prev);
          n.add(p.id);
          return n;
        });
      }
    } catch (err: any) {
      console.error('Erreur mise en avant public:', err);
      alert('Erreur lors de la mise en avant : ' + err.message);
    } finally {
      setTogglingFeatured(null);
    }
  };

  // =====================================================================
  //  Rendu
  // =====================================================================
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* En-tête + sous-onglets */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 mb-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <button onClick={() => setTab('moderation')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                tab === 'moderation' ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}>
              <CheckSquare className="w-4 h-4" />À valider
              {pending.length > 0 && (
                <span className={`inline-flex items-center justify-center rounded-full text-xs font-bold px-2 ${tab === 'moderation' ? 'bg-white/25 text-white' : 'bg-orange-100 text-orange-700'}`}>{pending.length}</span>
              )}
            </button>
            <button onClick={() => setTab('community')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                tab === 'community' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}>
              <Users className="w-4 h-4" />Communauté
              {community.length > 0 && (
                <span className={`inline-flex items-center justify-center rounded-full text-xs font-bold px-2 ${tab === 'community' ? 'bg-white/25 text-white' : 'bg-violet-100 text-violet-700'}`}>{community.length}</span>
              )}
            </button>
            <button onClick={() => setTab('catalogue')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                tab === 'catalogue' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}>
              <Library className="w-4 h-4" />Catalogue PiloTerra
              {catalogue.length > 0 && (
                <span className={`inline-flex items-center justify-center rounded-full text-xs font-bold px-2 ${tab === 'catalogue' ? 'bg-white/25 text-white' : 'bg-emerald-100 text-emerald-700'}`}>{catalogue.length}</span>
              )}
            </button>
          </div>
          <div className="flex items-center gap-2">
            {tab === 'catalogue' && (
              <button onClick={() => setEditing({ prompt: null })}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors">
                <Plus className="w-4 h-4" />Nouveau prompt catalogue
              </button>
            )}
            <button onClick={load} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
              <RefreshCw className="w-4 h-4" />Actualiser
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 className="w-8 h-8 animate-spin" /></div>
      ) : tab === 'moderation' ? (
        // ================= À VALIDER =================
        pending.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-20 text-center">
            <CheckSquare className="mx-auto mb-3 w-10 h-10 text-slate-300" />
            <p className="text-slate-500 font-medium">Aucun prompt en attente de validation.</p>
            <p className="text-slate-400 text-sm mt-1">Les prompts proposés par les organisations apparaîtront ici.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pending.map((p) => {
              const isOpen = expanded === p.id;
              const frug = FRUGALITY_META[p.frugality_level] ?? FRUGALITY_META[2];
              const nbVars = varCount(p.variables);
              return (
                <div key={p.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                          {p.organisation_id ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 text-indigo-700 px-2 py-0.5 text-xs font-bold">
                              <Building2 className="w-3 h-3" />{orgNames[p.organisation_id] ?? 'Organisation'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 text-amber-700 px-2 py-0.5 text-xs font-bold">
                              <User className="w-3 h-3" />Utilisateur individuel
                            </span>
                          )}
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{toolLabel(p.target_tool)}</span>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{p.category}</span>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${frug.badge}`}>
                            <Leaf className="w-3 h-3" />{frug.label}
                          </span>
                          {nbVars > 0 && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">{nbVars} variable{nbVars > 1 ? 's' : ''}</span>}
                        </div>
                        <h3 className="font-black text-slate-900">{p.title}</h3>
                        {p.description && <p className="text-sm text-slate-500 mt-0.5">{p.description}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => approve(p.id)} disabled={busyId === p.id}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-50">
                          {busyId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Approuver
                        </button>
                        <button onClick={() => { setRejectingId(rejectingId === p.id ? null : p.id); setRejectMotif(''); }} disabled={busyId === p.id}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors disabled:opacity-50">
                          <X className="w-4 h-4" />Refuser
                        </button>
                      </div>
                    </div>

                    {rejectingId === p.id && (
                      <div className="mt-3 flex items-center gap-2">
                        <input value={rejectMotif} onChange={(e) => setRejectMotif(e.target.value)}
                          placeholder="Motif du refus (transmis à l'organisation, optionnel)"
                          className="flex-1 rounded-lg border border-slate-200 bg-white p-2 text-sm outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100" />
                        <button onClick={() => reject(p.id)} disabled={busyId === p.id}
                          className="px-3 py-2 rounded-lg text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors disabled:opacity-50">Confirmer le refus</button>
                      </div>
                    )}

                    <button onClick={() => setExpanded(isOpen ? null : p.id)}
                      className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-slate-700">
                      {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      {isOpen ? 'Masquer le prompt' : 'Voir le prompt complet'}
                    </button>
                  </div>

                  {isOpen && (
                    <div className="px-5 pb-5 space-y-3">
                      {(p.recommended_model || p.frugality_tip) && (
                        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-sm text-slate-600">
                          {p.recommended_model && <p><span className="font-bold text-slate-700">Modèle conseillé :</span> {p.recommended_model}</p>}
                          {p.frugality_tip && <p className="mt-1">{p.frugality_tip}</p>}
                        </div>
                      )}
                      <pre className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 font-sans">{p.content}</pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : tab === 'community' ? (
        // ================= COMMUNAUTÉ (modération a posteriori) =================
        community.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-20 text-center">
            <Users className="mx-auto mb-3 w-10 h-10 text-slate-300" />
            <p className="text-slate-500 font-medium">Aucun prompt partagé avec la communauté.</p>
            <p className="text-slate-400 text-sm mt-1">Les prompts approuvés et publics apparaîtront ici.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {community.map((p) => {
              const isOpen = expanded === p.id;
              const frug = FRUGALITY_META[p.frugality_level] ?? FRUGALITY_META[2];
              return (
                <div key={p.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                          <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 text-violet-700 px-2 py-0.5 text-xs font-bold">
                            <Globe className="w-3 h-3" />En ligne
                          </span>
                          {p.organisation_id ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 text-indigo-700 px-2 py-0.5 text-xs font-bold">
                              <Building2 className="w-3 h-3" />{orgNames[p.organisation_id] ?? 'Organisation'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 text-amber-700 px-2 py-0.5 text-xs font-bold">
                              <User className="w-3 h-3" />Utilisateur individuel
                            </span>
                          )}
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{toolLabel(p.target_tool)}</span>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${frug.badge}`}>
                            <Leaf className="w-3 h-3" />{frug.label}
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Copy className="w-3 h-3" />{p.usage_count}</span>
                        </div>
                        <h3 className="font-black text-slate-900">{p.title}</h3>
                        {p.description && <p className="text-sm text-slate-500 mt-0.5">{p.description}</p>}
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <button
                          onClick={(e) => toggleFeaturedPublic(p, e)}
                          disabled={togglingFeatured === p.id}
                          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold border transition-all ${
                            featuredIds.has(p.id)
                              ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {togglingFeatured === p.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Globe className="w-4 h-4" />
                          )}
                          {featuredIds.has(p.id) ? 'En avant (Visiteurs)' : 'Mettre en avant (Visiteurs)'}
                        </button>
                        <button onClick={() => { setRejectingId(rejectingId === p.id ? null : p.id); setRejectMotif(''); }} disabled={busyId === p.id}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors disabled:opacity-50">
                          <X className="w-4 h-4" />Retirer de la communauté
                        </button>
                      </div>
                    </div>

                    {rejectingId === p.id && (
                      <div className="mt-3 flex items-center gap-2">
                        <input value={rejectMotif} onChange={(e) => setRejectMotif(e.target.value)}
                          placeholder="Motif du retrait (transmis à l'organisation, optionnel)"
                          className="flex-1 rounded-lg border border-slate-200 bg-white p-2 text-sm outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100" />
                        <button onClick={() => removeFromCommunity(p.id)} disabled={busyId === p.id}
                          className="px-3 py-2 rounded-lg text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors disabled:opacity-50">Confirmer le retrait</button>
                      </div>
                    )}

                    <button onClick={() => setExpanded(isOpen ? null : p.id)}
                      className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-slate-700">
                      {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      {isOpen ? 'Masquer le prompt' : 'Voir le prompt complet'}
                    </button>
                  </div>

                  {isOpen && (
                    <div className="px-5 pb-5">
                      <pre className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 font-sans">{p.content}</pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        // ================= CATALOGUE PILOTERRA =================
        catalogue.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-20 text-center">
            <Library className="mx-auto mb-3 w-10 h-10 text-slate-300" />
            <p className="text-slate-500 font-medium">Le catalogue officiel est vide.</p>
            <p className="text-slate-400 text-sm mt-1">Cliquez sur « Nouveau prompt catalogue » pour en ajouter un.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {catalogue.map((p) => {
              const frug = FRUGALITY_META[p.frugality_level] ?? FRUGALITY_META[2];
              const isDraft = p.status === 'draft';
              return (
                <div key={p.id} onClick={() => setEditing({ prompt: p })}
                  className="group flex flex-col text-left bg-white rounded-2xl border border-slate-200 shadow-sm p-4 transition-all hover:border-emerald-300 hover:shadow-md cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setEditing({ prompt: p }); } }}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${frug.badge}`}>
                      <Leaf className="w-3 h-3" />{frug.label}
                    </span>
                    {isDraft
                      ? <span className="inline-flex items-center gap-1 text-xs text-slate-500"><FileText className="w-3 h-3" />Brouillon</span>
                      : <span className="inline-flex items-center gap-1 text-xs text-succes-600"><Globe className="w-3 h-3" />Publié</span>}
                  </div>
                  <h4 className="font-bold text-slate-900 mb-1 group-hover:text-emerald-700">{p.title}</h4>
                  {p.description && <p className="text-sm text-slate-500 mb-3 line-clamp-2">{p.description}</p>}
                  <div className="mt-auto pt-3 border-t border-slate-100 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{toolLabel(p.target_tool)}</span>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span className="inline-flex items-center gap-1"><Copy className="w-3 h-3" />{p.usage_count}</span>
                        <span className="inline-flex items-center gap-1 text-slate-400 group-hover:text-emerald-600"><Pencil className="w-3 h-3" />Éditer</span>
                      </div>
                    </div>
                    
                    {!isDraft && (
                      <button
                        onClick={(e) => toggleFeaturedPublic(p, e)}
                        disabled={togglingFeatured === p.id}
                        className={`w-full py-1.5 rounded-lg text-center text-xs font-bold flex items-center justify-center gap-1.5 border transition-all ${
                          featuredIds.has(p.id)
                            ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {togglingFeatured === p.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Globe className="w-3.5 h-3.5" />
                        )}
                        {featuredIds.has(p.id) ? 'Mis en avant (Public)' : 'Mettre en avant (Public)'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ============================ ÉDITEUR (partagé, mode catalogue) ============================ */}
      {editing && (
        <PromptEditor
          session={session}
          mode="catalogue"
          initialPrompt={editing.prompt}
          categories={Array.from(new Set(catalogue.map((p) => p.category)))}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
};

export default GestionPrompts;
