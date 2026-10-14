// =====================================================================
//  PILOTERRA — BIBLIOTHÈQUE DE PROMPTS  (espace organisation)
//  Accessible à TOUS les membres.
//  - Consultation : grille filtrable double axe + 4 cercles
//    (Catalogue PiloTerra / Bibliothèque d'organisation / Communauté / Mes prompts)
//  - Utilisation  : variables remplissables, aperçu live, copie, favoris
//  - Création :
//      * tout membre  -> prompt PERSONNEL (visible de lui seul)
//      * admin_coop / super_admin -> prompt d'ORGANISATION (ou perso)
//  - Édition/suppression déléguées à <PromptEditor/>
// =====================================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import {
  Search, Heart, Copy, Check, Leaf, X, Filter, ExternalLink,
  Building2, Users, Library, User, Clock, FileText, Sparkles, Plus, Pencil, AlertCircle, Pin, CopyPlus, Send, Inbox, Lock, ArrowRight,
} from 'lucide-react';
import {
  Prompt, Circle,
  toolLabel, toolUrl, FRUGALITY_META, CIRCLE_META,
  circleOf, belongsToCircle, fillTemplate, parseVariables, sobrietyScore, sobrietyLabel,
} from './promptShared';
import { PromptEditor } from './PromptEditor';
import { useMarche } from './MarcheContext';
import { estVisiblePour } from './marcheShared';
import { Page } from '../types';

interface BibliothequePromptsProps {
  session: any;
  onNavigate?: (page: Page) => void;
}

// ---------------------------------------------------------------------
//  Badges
// ---------------------------------------------------------------------
const FrugalityBadge: React.FC<{ level: 1 | 2 | 3 }> = ({ level }) => {
  const m = FRUGALITY_META[level];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${m.badge}`}>
      <Leaf className="w-3 h-3" />{m.label}
    </span>
  );
};

const CircleBadge: React.FC<{ circle: Circle }> = ({ circle }) => {
  const m = CIRCLE_META[circle];
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${m.badge}`}>
      <Icon className="w-3 h-3" />{m.short}
    </span>
  );
};

const StatusHint: React.FC<{ p: Prompt }> = ({ p }) => {
  if (p.status === 'draft')
    return <span className="inline-flex items-center gap-1 text-xs text-slate-500"><FileText className="w-3 h-3" />Brouillon</span>;
  if (p.visibility === 'public' && p.moderation_status === 'pending')
    return <span className="inline-flex items-center gap-1 text-xs text-amber-600"><Clock className="w-3 h-3" />En attente de validation</span>;
  if (p.visibility === 'public' && p.moderation_status === 'rejected')
    return <span className="inline-flex items-center gap-1 text-xs text-rose-600"><X className="w-3 h-3" />Refusé</span>;
  if (p.visibility === 'public' && p.moderation_status === 'approved')
    return <span className="inline-flex items-center gap-1 text-xs text-violet-600"><Users className="w-3 h-3" />Partagé avec la communauté</span>;
  return null;
};

// =====================================================================
//  Composant principal
// =====================================================================
export const BibliothequePrompts: React.FC<BibliothequePromptsProps> = ({ session, onNavigate }) => {
  // Marché actif : la bibliothèque charge ses prompts elle-même et les
  // filtre ici (voir `filtered`). null = vitrine, tout est visible.
  const { marcheActif } = useMarche();

  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, { prenom: string; nom: string }>>({});
  const [orgNames, setOrgNames] = useState<Record<string, string>>({});
  const [myOrgId, setMyOrgId] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string>('user');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [pins, setPins] = useState<Set<string>>(new Set());   // prompts épinglés par mon organisation
  const [loading, setLoading] = useState(true);
  const [publicTotal, setPublicTotal] = useState<number | null>(null); // total réel de la bibliothèque publique (catalogue + communauté), visible même sans connexion

  const isOrgAdmin = myRole === 'admin_coop' || myRole === 'super_admin';

  // Filtres
  const [search, setSearch] = useState('');
  const [circleFilter, setCircleFilter] = useState<'all' | Circle>('all');
  const [toolFilter, setToolFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [favOnly, setFavOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'popular' | 'frugal'>('popular');

  // Lecteur
  const [selected, setSelected] = useState<Prompt | null>(null);
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  // Éditeur (délégué à <PromptEditor/>)
  const [editing, setEditing] = useState<{ prompt: Prompt | null; mode: 'org' | 'perso'; duplicate?: boolean } | null>(null);

  // -------------------------------------------------------------------
  //  Chargement
  // -------------------------------------------------------------------
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      let currentUserId = null;
      let currentOrgId = null;
      let currentRole = 'visitor';

      if (session?.user?.id) {
        const { data: me } = await supabase
          .from('utilisateurs')
          .select('id, organisation_id, role')
          .eq('auth_id', session.user.id)
          .single();
        currentUserId = me?.id ?? null;
        currentOrgId = me?.organisation_id ?? null;
        currentRole = me?.role ?? 'user';
      }

      setMyUserId(currentUserId);
      setMyOrgId(currentOrgId);
      setMyRole(currentRole);

      if (currentOrgId) {
        const { data: usersData } = await supabase
          .from('utilisateurs')
          .select('id, prenom, nom')
          .eq('organisation_id', currentOrgId);
        if (usersData) {
          const map: Record<string, { prenom: string; nom: string }> = {};
          usersData.forEach((u: any) => {
            map[u.id] = { prenom: u.prenom || '', nom: u.nom || '' };
          });
          setUsersMap(map);
        }
      }

      // Compteur total de la bibliothèque publique (catalogue + communauté approuvée),
      // via une fonction RPC dédiée : la table `prompts` n'a pas de policy RLS pour
      // le rôle anonyme, donc un simple count() échouerait pour les visiteurs.
      const { data: totalData, error: totalError } = await supabase.rpc('get_public_prompts_total');
      if (totalError) console.error('Chargement du compteur public :', totalError.message);
      else if (typeof totalData === 'number') setPublicTotal(totalData);

      // Noms des organisations : pour afficher l'origine des prompts communautaires
      const { data: orgsData } = await supabase.from('organisations').select('id, nom');
      if (orgsData) {
        const omap: Record<string, string> = {};
        orgsData.forEach((o: any) => { omap[o.id] = o.nom; });
        setOrgNames(omap);
      }

      if (!session) {
        // Mode visiteur : on charge depuis la table publique piloterra_resources les prompts mis en avant
        const { data: featData, error: featError } = await supabase
          .from('piloterra_resources')
          .select('*')
          .eq('published', true);
        if (featError) console.error('Chargement prompts publics featured :', featError.message);
        
        const publicPrompts = (featData ?? [])
          .filter((r: any) => r.metadata?.is_public_prompt === true)
          .map((r: any) => {
            const p = r.metadata?.prompt;
            if (!p) return null;
            return {
              ...p,
              id: p.id || r.id,
              variables: parseVariables(p.variables)
            };
          }).filter(Boolean) as Prompt[];
          
        setPrompts(publicPrompts);
      } else {
        const { data: promptData, error } = await supabase
          .from('prompts')
          .select('*')
          .order('usage_count', { ascending: false })
          .order('created_at', { ascending: false });
        if (error) console.error('Chargement prompts :', error.message);
        setPrompts(
          (promptData ?? []).map((p: any) => ({ ...p, variables: parseVariables(p.variables) })) as Prompt[]
        );
      }

      if (currentUserId) {
        // Favoris : la clé est utilisateurs.id (cohérent avec le reste de l'app)
        const { data: favData } = await supabase
          .from('prompt_favorites')
          .select('prompt_id')
          .eq('user_id', currentUserId);
        setFavorites(new Set((favData ?? []).map((f: { prompt_id: string }) => f.prompt_id)));

        const { data: pinData } = await supabase
          .from('prompt_org_pins')
          .select('prompt_id');   // le RLS ne renvoie que les épingles de mon org
        setPins(new Set((pinData ?? []).map((p: { prompt_id: string }) => p.prompt_id)));
      } else {
        setFavorites(new Set());
        setPins(new Set());
      }
    } catch (e) {
      console.error('Init BibliothequePrompts:', e);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, []);

  // -------------------------------------------------------------------
  //  Dérivés
  // -------------------------------------------------------------------
  const tools = useMemo(() => Array.from(new Set(prompts.map((p) => p.target_tool))).sort(), [prompts]);
  const categories = useMemo(() => Array.from(new Set(prompts.map((p) => p.category))).sort(), [prompts]);
  const pinnedPrompts = useMemo(() => prompts.filter((p) => pins.has(p.id)), [prompts, pins]);
  const proposals = useMemo(() => (isOrgAdmin ? prompts.filter((p) => p.scope === 'personal' && p.proposed_to_org && p.created_by !== myUserId) : []), [prompts, isOrgAdmin, myUserId]);

  // Score de sobriété de l'organisation : moyenne des prompts publiés par l'org
  const orgScore = useMemo(() => {
    const orgPrompts = prompts.filter((p) => p.scope === 'organisation' && p.organisation_id === myOrgId && p.author_type === 'organisation');
    return { score: sobrietyScore(orgPrompts.map((p) => p.frugality_level)), count: orgPrompts.length };
  }, [prompts, myOrgId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = prompts.filter((p) => {
      // Filtre de marché. Un prompt sans `marches` (mode visiteur : prompts
      // reconstruits depuis piloterra_resources) est traité comme transverse.
      if (!estVisiblePour(p.marches, marcheActif)) return false;

      // Prompts perso d'autres membres (propositions internes) : masqués de la grille,
      // SAUF s'ils sont partagés à la communauté (prompt individuel approuvé et public).
      if (p.scope === 'personal' && p.created_by !== myUserId) {
        const isCommunityShared = p.visibility === 'public' && p.moderation_status === 'approved' && p.status === 'published';
        if (!isCommunityShared) return false;
      }
      
      // Sécurité RLS / Client-side : les prompts d'organisation privées d'autres structures ne doivent pas être visibles
      if (session && p.scope === 'organisation') {
        const isPiloTerra = p.author_type === 'piloterra';
        const belongsToMyOrg = !!myOrgId && p.organisation_id === myOrgId;
        const isCommunityApproved = p.visibility === 'public' && p.moderation_status === 'approved' && p.status === 'published';
        if (!isPiloTerra && !belongsToMyOrg && !isCommunityApproved) return false;
      }

      if (circleFilter !== 'all') {
        const matchesCircle = belongsToCircle(p, circleFilter, myOrgId);
        const isPinnedAndFilteringOrg = circleFilter === 'org' && pins.has(p.id);
        if (!matchesCircle && !isPinnedAndFilteringOrg) return false;
      }
      if (toolFilter !== 'all' && p.target_tool !== toolFilter) return false;
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      if (favOnly && !favorites.has(p.id)) return false;
      if (q) {
        // La recherche couvre aussi le CONTENU du prompt, pas seulement ses métadonnées
        const hay = `${p.title} ${p.description ?? ''} ${p.content} ${(p.tags ?? []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // Tri : du plus frugal au plus intensif, ou par popularité (défaut)
    if (sortBy === 'frugal') {
      return [...base].sort((a, b) => a.frugality_level - b.frugality_level || b.usage_count - a.usage_count);
    }
    return base;
  }, [prompts, search, circleFilter, toolFilter, categoryFilter, favOnly, favorites, myOrgId, myUserId, sortBy, marcheActif]);

  // Ordre de mise en avant pour les visiteurs non connectés : priorité aux
  // catégories "métier agricole" avant les prompts génériques NotebookLM.
  const PUBLIC_PREVIEW_ORDER = [
    'Conseil agricole & Technique',
    'Direction & Stratégie',
    'Communication & Adhérents',
    'RH & Formation',
    'Comptabilité & Finances',
    'Veille réglementaire & Juridique',
    'Analyse & Pilotage',
    'Outils IA avancés (NotebookLM)',
  ];

  const displayedPrompts = useMemo(() => {
    if (!session) {
      const sorted = [...filtered].sort((a, b) => {
        const ai = PUBLIC_PREVIEW_ORDER.indexOf(a.category);
        const bi = PUBLIC_PREVIEW_ORDER.indexOf(b.category);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
      return sorted.slice(0, 9);
    }
    return filtered;
  }, [filtered, session]);

  // Droits d'édition :
  //  - prompt personnel  -> son auteur
  //  - prompt d'org       -> les admins de l'org
  //  - catalogue          -> géré dans le Super Admin (non éditable ici)
  const canEdit = (p: Prompt) => {
    if (p.author_type === 'piloterra') return false;
    if (p.scope === 'personal') return !!myUserId && p.created_by === myUserId;
    return isOrgAdmin && !!myOrgId && p.organisation_id === myOrgId;
  };

  // Mode de création selon le contexte : un membre ne peut faire que du perso.
  const createMode: 'org' | 'perso' = (circleFilter === 'perso' || !isOrgAdmin) ? 'perso' : 'org';
  const createLabel = createMode === 'perso' ? 'Nouveau prompt personnel' : 'Nouveau prompt';

  // -------------------------------------------------------------------
  //  Actions — favoris / usage / copie
  // -------------------------------------------------------------------
  const toggleFavorite = useCallback(async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!myUserId) { console.error('Favori impossible : utilisateur non résolu.'); return; }
    const isFav = favorites.has(id);
    // Affichage optimiste
    setFavorites((prev) => { const n = new Set(prev); if (isFav) n.delete(id); else n.add(id); return n; });

    const { error } = isFav
      ? await supabase.from('prompt_favorites').delete().match({ user_id: myUserId, prompt_id: id })
      : await supabase.from('prompt_favorites').insert({ user_id: myUserId, prompt_id: id });

    if (error) {
      // La base a refusé : on annule l'affichage optimiste plutôt que de mentir à l'utilisateur.
      console.error('Favori non enregistré :', error.message);
      setFavorites((prev) => { const n = new Set(prev); if (isFav) n.add(id); else n.delete(id); return n; });
      alert("Le favori n'a pas pu être enregistré : " + error.message);
    }
  }, [favorites, myUserId]);

  // Épinglage organisation (admins uniquement) : le prompt remonte dans « Recommandés »
  const togglePin = useCallback(async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!isOrgAdmin || !myOrgId) return;
    const isPinned = pins.has(id);
    setPins((prev) => { const n = new Set(prev); if (isPinned) n.delete(id); else n.add(id); return n; });
    if (isPinned) await supabase.from('prompt_org_pins').delete().match({ organisation_id: myOrgId, prompt_id: id });
    else await supabase.from('prompt_org_pins').insert({ organisation_id: myOrgId, prompt_id: id, pinned_by: myUserId });
  }, [isOrgAdmin, myOrgId, myUserId, pins]);

  const openReader = (p: Prompt) => { setSelected(p); setEditing(null); setVarValues({}); setCopied(false); };
  const closeReader = () => setSelected(null);

  const finalText = useMemo(() => (selected ? fillTemplate(selected.content, varValues) : ''), [selected, varValues]);
  const missingRequired = useMemo(() => {
    if (!selected) return [];
    return selected.variables.filter((v) => v.required && !(varValues[v.key] && varValues[v.key].trim())).map((v) => v.label);
  }, [selected, varValues]);

  const registerUsage = useCallback(async (p: Prompt) => {
    await supabase.rpc('increment_prompt_usage', { p_prompt_id: p.id });
    setPrompts((prev) => prev.map((x) => (x.id === p.id ? { ...x, usage_count: x.usage_count + 1 } : x)));
    setSelected((prev) => (prev ? { ...prev, usage_count: prev.usage_count + 1 } : prev));
  }, []);

  const copyPrompt = useCallback(async () => {
    if (!selected) return;
    try { await navigator.clipboard.writeText(finalText); setCopied(true); setTimeout(() => setCopied(false), 2000); registerUsage(selected); }
    catch { console.error('Copie impossible'); }
  }, [selected, finalText, registerUsage]);

  const copyAndOpen = useCallback(async () => {
    if (!selected) return;
    const url = toolUrl(selected.target_tool);
    try { await navigator.clipboard.writeText(finalText); registerUsage(selected); } catch { /* noop */ }
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }, [selected, finalText, registerUsage]);

  // Ouverture de l'éditeur
  const openCreate = () => { setSelected(null); setEditing({ prompt: null, mode: createMode }); };
  const openEdit = (p: Prompt) => { setSelected(null); setEditing({ prompt: p, mode: p.scope === 'personal' ? 'perso' : 'org' }); };
  const openDuplicate = (p: Prompt) => { setSelected(null); setEditing({ prompt: p, mode: isOrgAdmin ? 'org' : 'perso', duplicate: true }); };
  const proposeToOrg = async (p: Prompt) => {
    await supabase.from('prompts').update({ proposed_to_org: true }).eq('id', p.id);
    setSelected((prev) => (prev ? { ...prev, proposed_to_org: true } : prev));
    loadAll();
  };
  const adoptProposal = async (p: Prompt) => {
    const { error } = await supabase
      .from('prompts')
      .update({
        scope: 'organisation',
        proposed_to_org: false,
        status: 'published'
      })
      .eq('id', p.id);

    if (error) {
      console.error("Erreur d'adoption proposition:", error.message);
      alert("L'adoption du prompt a échoué : " + error.message);
    } else {
      setSelected(null);
      loadAll();
    }
  };
  const rejectProposal = async (p: Prompt) => {
    const { error } = await supabase
      .from('prompts')
      .update({
        proposed_to_org: false
      })
      .eq('id', p.id);

    if (error) {
      console.error('Erreur rejet proposition:', error.message);
      alert("Le rejet de la proposition a échoué : " + error.message);
    } else {
      setSelected(null);
      loadAll();
    }
  };

  // =====================================================================
  //  Rendu
  // =====================================================================
  return (
    <div className="max-w-6xl mx-auto py-4">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl"><Library className="w-6 h-6" /></div>
          <div>
            <h3 className="text-xl font-black text-slate-900">Bibliothèque de prompts</h3>
            <p className="text-slate-500 text-sm">Des prompts prêts à l'emploi pour vos outils d'IA — chacun indique son niveau de sobriété.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {publicTotal !== null && (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-black px-3 py-1.5 ring-1 ring-inset ring-emerald-200">
              <Sparkles className="w-3.5 h-3.5" />
              {publicTotal} prompts disponibles
            </div>
          )}
          {orgScore.score !== null && (
            <div className="hidden md:flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2"
              title={`Moyenne de sobriété des ${orgScore.count} prompt(s) publiés par votre organisation (SPEC AFNOR 2314)`}>
              <Leaf className="w-4 h-4 text-emerald-600" />
              <div className="leading-tight">
                <div className="text-xs font-bold text-emerald-800">Sobriété de l'organisation</div>
                <div className="text-xs text-slate-500">
                  <span className="font-black text-emerald-700">{orgScore.score}/100</span> · {sobrietyLabel(orgScore.score)}
                </div>
              </div>
            </div>
          )}
          {session && (
            <button onClick={openCreate}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors">
              <Plus className="w-4 h-4" /> {createLabel}
            </button>
          )}
        </div>
      </div>

      {/* Recommandés par mon organisation */}
      {pinnedPrompts.length > 0 && (
        <div className="mb-6 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Pin className="w-4 h-4 text-emerald-600 fill-emerald-600" />
            <h4 className="text-sm font-black text-emerald-800">Recommandés par mon organisation</h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pinnedPrompts.map((p) => {
              const originCircle = circleOf(p, myOrgId);
              return (
                <button key={p.id} onClick={() => openReader(p)}
                  className="group flex flex-col text-left bg-white rounded-xl border border-emerald-100 shadow-sm p-3 transition-all hover:border-emerald-300 hover:shadow-md">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <CircleBadge circle={originCircle} />
                      <FrugalityBadge level={p.frugality_level} />
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{toolLabel(p.target_tool)}</span>
                  </div>
                  <h5 className="font-bold text-sm text-slate-900 group-hover:text-emerald-700 line-clamp-1">{p.title}</h5>
                  {p.description && <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{p.description}</p>}
                  {p.scope === 'organisation' && p.created_by && usersMap[p.created_by] && (
                    <p className="text-[11px] text-slate-400 mt-1 italic">
                      Origine : {usersMap[p.created_by].prenom} {usersMap[p.created_by].nom}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Propositions des membres (admins) */}
      {proposals.length > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-100 bg-amber-50/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Inbox className="w-4 h-4 text-amber-600" />
            <h4 className="text-sm font-black text-amber-800">Propositions de vos membres</h4>
            <span className="inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-700 text-xs font-bold px-2">{proposals.length}</span>
          </div>
          <div className="space-y-2">
            {proposals.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 bg-white rounded-xl border border-amber-100 p-3">
                <div className="min-w-0 cursor-pointer" onClick={() => openReader(p)} role="button">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{toolLabel(p.target_tool)}</span>
                    <FrugalityBadge level={p.frugality_level} />
                  </div>
                  <h5 className="font-bold text-sm text-slate-900 truncate">{p.title}</h5>
                  {p.description && <p className="text-xs text-slate-500 truncate">{p.description}</p>}
                  {p.created_by && usersMap[p.created_by] && (
                    <p className="text-[11px] text-amber-800 italic mt-0.5">
                      Proposé par {usersMap[p.created_by].prenom} {usersMap[p.created_by].nom}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => adoptProposal(p)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition-colors"><Check className="w-3.5 h-3.5" />Adopter</button>
                  <button onClick={() => rejectProposal(p)} className="inline-flex items-center gap-1 rounded-lg text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 px-3 py-1.5 hover:bg-rose-100 transition-colors"><X className="w-3.5 h-3.5" />Refuser</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Onglets de cercle */}
      <div className="flex flex-wrap gap-2 mb-4">
        {([
          ['all', 'Tout', Sparkles],
          ['piloterra', CIRCLE_META.piloterra.label, Library],
          ['org', CIRCLE_META.org.label, Building2],
          ['community', CIRCLE_META.community.label, Users],
          ['perso', CIRCLE_META.perso.label, User],
        ] as const).map(([value, label, Icon]) => {
          if (value === 'org' && !myOrgId) return null;
          if (value === 'perso' && !myUserId) return null;
          const active = circleFilter === value;
          return (
            <button key={value} onClick={() => setCircleFilter(value as any)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-bold transition-all ${
                active ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50'
              }`}>
              <Icon className="w-4 h-4" />{label}
            </button>
          );
        })}
      </div>

      {/* Barre de filtres */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher (titre, description, contenu, mots-clés)…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
        </div>
        <select value={toolFilter} onChange={(e) => setToolFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100">
          <option value="all">Tous les outils</option>
          {tools.map((t) => <option key={t} value={t}>{toolLabel(t)}</option>)}
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100">
          <option value="all">Tous les usages</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'popular' | 'frugal')}
          title="Trier les prompts"
          className="rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100">
          <option value="popular">Les plus utilisés</option>
          <option value="frugal">Les plus sobres</option>
        </select>
        <button onClick={() => setFavOnly((v) => !v)}
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold transition-all ${
            favOnly ? 'bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-200' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50'
          }`}>
          <Heart className={`w-4 h-4 ${favOnly ? 'fill-rose-500 text-rose-500' : ''}`} />Favoris
        </button>
      </div>

      {/* Grille */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-44 rounded-2xl bg-slate-100 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-16 text-center">
          <Filter className="mx-auto mb-3 w-8 h-8 text-slate-300" />
          <p className="text-sm text-slate-500">
            {circleFilter === 'perso' ? 'Vous n\'avez pas encore de prompt personnel. Créez-en un avec le bouton ci-dessus.' : 'Aucun prompt ne correspond à votre recherche.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedPrompts.map((p) => {
            const circle = circleOf(p, myOrgId);
            const isFav = favorites.has(p.id);
            return (
              <button key={p.id} onClick={() => openReader(p)}
                className="group flex flex-col text-left bg-white rounded-2xl border border-slate-200 shadow-sm p-4 transition-all hover:border-emerald-300 hover:shadow-md">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex flex-wrap items-center gap-1.5"><CircleBadge circle={circle} /><FrugalityBadge level={p.frugality_level} /></div>
                  <span className="flex items-center gap-0.5">
                    {session && isOrgAdmin && p.scope !== 'personal' && (
                      <span onClick={(e) => togglePin(p.id, e)} role="button"
                        aria-label="Recommander à mon organisation"
                        title={pins.has(p.id) ? 'Retirer des recommandations' : 'Recommander à mon organisation'}
                        className={`p-1 rounded-full transition-colors ${pins.has(p.id) ? 'text-emerald-600' : 'text-slate-300 hover:bg-emerald-50 hover:text-emerald-600'}`}>
                        <Pin className={`w-4 h-4 ${pins.has(p.id) ? 'fill-emerald-600' : ''}`} />
                      </span>
                    )}
                    {session && (
                      <span onClick={(e) => toggleFavorite(p.id, e)} role="button" aria-label="Favori"
                        className="p-1 rounded-full text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500">
                        <Heart className={`w-4 h-4 ${isFav ? 'fill-rose-500 text-rose-500' : ''}`} />
                      </span>
                    )}
                  </span>
                </div>
                <h4 className="font-bold text-slate-900 mb-1 group-hover:text-emerald-700">{p.title}</h4>
                {p.description && <p className="text-sm text-slate-500 mb-2 line-clamp-2">{p.description}</p>}
                {p.scope === 'organisation' && p.created_by && usersMap[p.created_by] && (
                  <p className="text-xs text-slate-400 mb-3 italic">
                    Origine : {usersMap[p.created_by].prenom} {usersMap[p.created_by].nom}
                  </p>
                )}
                {p.author_type === 'organisation' && p.visibility === 'public' && p.moderation_status === 'approved' && p.status === 'published' && !(myOrgId && p.organisation_id === myOrgId) && (
                  <p className="text-xs text-violet-500 mb-3 italic flex items-center gap-1">
                    <Users className="w-3 h-3 shrink-0" />
                    Partagé par {p.organisation_id ? (orgNames[p.organisation_id] ?? 'une organisation') : 'un utilisateur de la plateforme'}
                  </p>
                )}
                <div className="mt-auto flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{toolLabel(p.target_tool)}</span>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    {(circle === 'org' || (circle === 'perso' && p.visibility === 'public')) && <StatusHint p={p} />}
                    <span className="inline-flex items-center gap-1"><Copy className="w-3 h-3" />{p.usage_count}</span>
                  </div>
                </div>
              </button>
            );
          })}

          {!session && (publicTotal !== null ? publicTotal > displayedPrompts.length : filtered.length > 9) && (
            <div className="col-span-full mt-4 bg-gradient-to-br from-emerald-500/10 to-emerald-950/10 border-2 border-dashed border-emerald-600/20 rounded-2xl p-8 text-center flex flex-col items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 opacity-5 pointer-events-none bg-grid-pattern animate-pulse"></div>
              <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-3">
                <Lock className="w-6 h-6 text-emerald-600 animate-bounce" />
              </div>
              <h4 className="font-bold text-slate-900 mb-2 text-lg">Connectez-vous pour débloquer les {(publicTotal ?? filtered.length) - displayedPrompts.length} autres prompts !</h4>
              <p className="text-sm text-slate-500 max-w-md mb-5 leading-relaxed">
                Créez un compte gratuit ou connectez-vous pour débloquer l'accès complet à tous nos prompts optimisés pour l'agriculture.
              </p>
              <button 
                onClick={() => {
                  if (onNavigate) onNavigate('dashboard');
                  else window.location.hash = 'dashboard';
                }} 
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition-all shadow-md hover:shadow-lg active:scale-95 flex items-center gap-2 cursor-pointer"
              >
                Se connecter / Créer un compte <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ============================ PANNEAU LECTEUR ============================ */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={closeReader} />
          <div className="relative flex flex-col h-full w-full max-w-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between p-5 border-b border-slate-100">
              <div className="pr-4">
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  <CircleBadge circle={circleOf(selected, myOrgId)} />
                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{toolLabel(selected.target_tool)}</span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{selected.category}</span>
                </div>
                <h3 className="text-lg font-black text-slate-900">{selected.title}</h3>
                {selected.description && <p className="mt-1 text-sm text-slate-500">{selected.description}</p>}
                {selected.scope === 'organisation' && selected.created_by && usersMap[selected.created_by] && (
                  <p className="mt-1.5 text-xs text-slate-400 italic">
                    Origine : {usersMap[selected.created_by].prenom} {usersMap[selected.created_by].nom}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {canEdit(selected) && (
                  <button onClick={() => openEdit(selected)} title="Éditer"
                    className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"><Pencil className="w-5 h-5" /></button>
                )}
                <button onClick={closeReader} className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"><X className="w-5 h-5" /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {selected.moderation_status === 'rejected' && selected.moderation_note && canEdit(selected) && (
                <div className="mb-5 rounded-2xl border border-rose-100 bg-rose-50 p-4 flex gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-rose-700"><span className="font-bold">Refusé par PiloTerra :</span> {selected.moderation_note}</p>
                </div>
              )}
              <div className="mb-5 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Leaf className="w-4 h-4 text-emerald-600" /><span className="text-sm font-bold text-emerald-800">Sobriété</span>
                  <FrugalityBadge level={selected.frugality_level} />
                </div>
                {selected.recommended_model && <p className="text-sm text-slate-600"><span className="font-bold text-slate-700">Modèle conseillé :</span> {selected.recommended_model}</p>}
                {selected.frugality_tip && <p className="mt-1 text-sm text-slate-600">{selected.frugality_tip}</p>}
              </div>

              {selected.variables.length > 0 && (
                <div className="mb-5">
                  <h4 className="text-sm font-bold text-slate-800 mb-3">Complétez pour personnaliser</h4>
                  <div className="space-y-3">
                    {selected.variables.map((v) => (
                      <div key={v.key}>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{v.label}{v.required && <span className="ml-0.5 text-rose-500">*</span>}</label>
                        {v.type === 'textarea' ? (
                          <textarea rows={3} value={varValues[v.key] ?? ''} placeholder={v.placeholder}
                            onChange={(e) => setVarValues((prev) => ({ ...prev, [v.key]: e.target.value }))}
                            className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                        ) : v.type === 'select' ? (
                          <select value={varValues[v.key] ?? ''} onChange={(e) => setVarValues((prev) => ({ ...prev, [v.key]: e.target.value }))}
                            className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100">
                            <option value="">— Choisir —</option>
                            {(v.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input value={varValues[v.key] ?? ''} placeholder={v.placeholder}
                            onChange={(e) => setVarValues((prev) => ({ ...prev, [v.key]: e.target.value }))}
                            className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-sm font-bold text-slate-800 mb-2">Aperçu du prompt</h4>
                <pre className="whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 font-sans">{finalText}</pre>
                {missingRequired.length > 0 && <p className="mt-2 text-xs text-amber-600">À compléter : {missingRequired.join(', ')}</p>}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
              {isOrgAdmin && selected.scope === 'personal' && selected.proposed_to_org && selected.created_by !== myUserId ? (
                <div className="flex items-center gap-2">
                  <button onClick={() => adoptProposal(selected)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition-colors">
                    <Check className="w-3.5 h-3.5" />Adopter le prompt
                  </button>
                  <button onClick={() => rejectProposal(selected)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-100 transition-colors">
                    <X className="w-3.5 h-3.5" />Refuser la proposition
                  </button>
                </div>
              ) : (
                <>
                  <button onClick={() => openDuplicate(selected)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                    <CopyPlus className="w-3.5 h-3.5" />Dupliquer et adapter
                  </button>
                  {selected.scope === 'personal' && selected.created_by === myUserId && !!myOrgId && !selected.proposed_to_org && (
                    <button onClick={() => proposeToOrg(selected)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition-colors">
                      <Send className="w-3.5 h-3.5" />Proposer à mon organisation
                    </button>
                  )}
                  {selected.scope === 'personal' && selected.created_by === myUserId && selected.proposed_to_org && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                      <Check className="w-3.5 h-3.5" />Proposé à votre organisation
                    </span>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-3 p-4 border-t border-slate-100">
              <button onClick={copyPrompt} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-700">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}{copied ? 'Copié !' : 'Copier le prompt'}
              </button>
              {toolUrl(selected.target_tool) && (
                <button onClick={copyAndOpen} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50">
                  <ExternalLink className="w-4 h-4" />Ouvrir {toolLabel(selected.target_tool)}
                </button>
              )}
              <button onClick={(e) => toggleFavorite(selected.id, e)} aria-label="Favori"
                className="rounded-xl border border-slate-200 p-2.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500">
                <Heart className={`w-4 h-4 ${favorites.has(selected.id) ? 'fill-rose-500 text-rose-500' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================ ÉDITEUR (partagé) ============================ */}
      {editing && (
        <PromptEditor
          session={session}
          mode={editing.mode}
          initialPrompt={editing.prompt}
          duplicate={editing.duplicate}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); loadAll(); }}
        />
      )}
    </div>
  );
};

export default BibliothequePrompts;
