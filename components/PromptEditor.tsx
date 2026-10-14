// =====================================================================
//  PILOTERRA — ÉDITEUR DE PROMPT (partagé)
//  Panneau latéral de création/édition, piloté par un "mode" :
//    - "org"       : prompt d'organisation (Brouillon / Publier org / Communauté)
//    - "catalogue" : catalogue officiel PiloTerra (Brouillon / Publier au catalogue)
//    - "perso"     : prompt personnel, visible du seul auteur (Enregistrer)
// =====================================================================

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { X, Leaf, FileText, Globe, Send, Library, User, Trash2, Loader2, Sparkles } from 'lucide-react';
import {
  Draft, VarType, PromptVariable, Prompt,
  TOOL_KEYS, toolLabel, FRUGALITY_META,
  detectKeys, emptyDraft, draftFromPrompt, suggestFrugality,
} from './promptShared';

type EditorMode = 'org' | 'catalogue' | 'perso';
type SaveAction = 'draft' | 'publish_org' | 'publish_community' | 'publish_catalogue' | 'save_perso';

interface PromptEditorProps {
  session: any;
  mode: EditorMode;
  initialPrompt?: Prompt | null;   // null / undefined => création
  duplicate?: boolean;             // true => pré-remplit mais crée un nouveau prompt
  categories?: string[];           // suggestions pour le champ "Usage"
  onClose: () => void;
  onSaved: () => void;             // le parent recharge sa liste
}

export const PromptEditor: React.FC<PromptEditorProps> = ({
  session, mode, initialPrompt, duplicate = false, categories = [], onClose, onSaved,
}) => {
  const isCatalogue = mode === 'catalogue';
  const isPerso = mode === 'perso';

  const [draft, setDraft] = useState<Draft>(() => {
    if (!initialPrompt) return emptyDraft();
    const d = draftFromPrompt(initialPrompt);
    if (duplicate) { d.id = undefined; d.title = 'Copie de ' + d.title; }  // duplication -> nouveau prompt
    return d;
  });
  const [myOrgId, setMyOrgId] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Identité de l'utilisateur courant (org + id interne)
  useEffect(() => {
    (async () => {
      const { data: me } = await supabase
        .from('utilisateurs')
        .select('id, organisation_id')
        .eq('auth_id', session.user.id)
        .single();
      setMyUserId(me?.id ?? null);
      setMyOrgId(me?.organisation_id ?? null);
    })();
  }, [session]);

  // Détection automatique des {{marqueurs}}
  useEffect(() => {
    const keys = detectKeys(draft.content);
    setDraft((prev) => {
      const existing = new Map(prev.variables.map((v) => [v.key, v]));
      const nextVars = keys.map(
        (k) => existing.get(k) ?? ({ key: k, label: k, type: 'text' as VarType, placeholder: '', required: false })
      );
      const same =
        nextVars.length === prev.variables.length &&
        nextVars.every((v: any, i) => (prev.variables[i] as any)?.key === v.key);
      return same ? prev : { ...prev, variables: nextVars };
    });
    // eslint-disable-next-line
  }, [draft.content]);

  const patchDraft = (patch: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...patch }));
  const patchVar = (key: string, patch: Partial<PromptVariable>) =>
    setDraft((prev) => ({ ...prev, variables: prev.variables.map((v) => (v.key === key ? { ...v, ...patch } : v)) }));

  // Suggestion automatique du niveau de sobriété (l'auteur garde le dernier mot)
  const suggestion = useMemo(() => suggestFrugality(draft.content), [draft.content]);
  const showSuggestion = draft.content.trim().length > 30 && suggestion.level !== draft.frugality_level;

  const save = async (action: SaveAction) => {
    if (!draft.title.trim() || !draft.content.trim()) { alert('Un titre et un contenu sont requis.'); return; }
    setSaving(true);
    try {
      const record: any = {
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        content: draft.content,
        target_tool: draft.target_tool,
        category: draft.category.trim() || (isPerso ? 'Mes prompts' : 'Non classé'),
        tags: draft.tags.split(',').map((t) => t.trim()).filter(Boolean),
        variables: draft.variables,
        frugality_level: draft.frugality_level,
        recommended_model: draft.recommended_model.trim() || null,
        frugality_tip: draft.frugality_tip.trim() || null,
        author_type: isCatalogue ? 'piloterra' : 'organisation',
        scope: isPerso ? 'personal' : 'organisation',
        organisation_id: isCatalogue ? null : myOrgId,
        status: (isPerso || action !== 'draft') ? 'published' : 'draft',
        visibility: isPerso
          ? (action === 'publish_community' ? 'public' : 'private')
          : (isCatalogue ? 'public' : (action === 'publish_community' ? 'public' : 'private')),
        updated_at: new Date().toISOString(),
        ...(isPerso ? {} : { proposed_to_org: false }),
      };

      if (draft.id) {
        const { error } = await supabase.from('prompts').update(record).eq('id', draft.id);
        if (error) throw error;
      } else {
        record.created_by = myUserId;
        const { error } = await supabase.from('prompts').insert(record);
        if (error) throw error;
      }
      onSaved();
      onClose();
    } catch (e: any) {
      console.error('Sauvegarde prompt:', e);
      alert('Erreur lors de l\'enregistrement : ' + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  const removePrompt = async () => {
    if (!draft.id) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('prompts').delete().eq('id', draft.id);
      if (error) throw error;
      onSaved();
      onClose();
    } catch (e: any) {
      console.error('Suppression prompt:', e);
      alert('Erreur lors de la suppression : ' + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  const headerTitle = draft.id
    ? (isCatalogue ? 'Modifier le prompt catalogue' : isPerso ? 'Modifier mon prompt' : 'Modifier le prompt')
    : (isCatalogue ? 'Nouveau prompt catalogue' : isPerso ? 'Nouveau prompt personnel' : 'Nouveau prompt');

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex flex-col h-full w-full max-w-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between p-5 border-b border-slate-100">
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
            {isCatalogue && <Library className="w-5 h-5 text-emerald-600" />}
            {isPerso && <User className="w-5 h-5 text-slate-500" />}
            {headerTitle}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {isPerso && (
          <div className="px-5 pt-4">
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm text-slate-600 flex items-start gap-2">
              <User className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              {myOrgId
                ? <span>Ce prompt sera <span className="font-bold">visible de vous seul</span>. Il n'apparaît pas pour le reste de votre organisation.</span>
                : <span>Ce prompt est <span className="font-bold">personnel</span>. Gardez-le pour vous, ou <span className="font-bold">proposez-le à la communauté</span> : il sera alors soumis à la validation de PiloTerra.</span>}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-800 mb-1">Titre *</label>
            <input value={draft.title} onChange={(e) => patchDraft({ title: e.target.value })} placeholder="Ex : Compte-rendu de réunion clair"
              className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-800 mb-1">Description (langage métier)</label>
            <input value={draft.description} onChange={(e) => patchDraft({ description: e.target.value })} placeholder="À quoi sert ce prompt, en une phrase simple"
              className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1">Outil cible</label>
              <select value={draft.target_tool} onChange={(e) => patchDraft({ target_tool: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100">
                {TOOL_KEYS.map((t) => <option key={t} value={t}>{toolLabel(t)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1">Usage</label>
              <input list="prompt-editor-categories" value={draft.category} onChange={(e) => patchDraft({ category: e.target.value })} placeholder="Ex : Communication"
                className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
              <datalist id="prompt-editor-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-800 mb-1">Mots-clés (séparés par des virgules)</label>
            <input value={draft.tags} onChange={(e) => patchDraft({ tags: e.target.value })} placeholder="réunion, synthèse, adhérents"
              className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-800 mb-1">Contenu du prompt *</label>
            <p className="text-xs text-slate-500 mb-1.5">Écrivez votre prompt normalement. Mettez un champ à personnaliser entre doubles accolades, ex : <code className="bg-slate-100 px-1 rounded">{'{{nom_exploitation}}'}</code>. Il apparaîtra automatiquement ci-dessous.</p>
            <textarea rows={7} value={draft.content} onChange={(e) => patchDraft({ content: e.target.value })} placeholder={'Rédige un compte-rendu pour la réunion {{sujet}} à partir de ces notes : {{notes}}'}
              className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm font-mono outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
          </div>

          {/* Variables détectées */}
          {draft.variables.length > 0 && (
            <div className="rounded-2xl border border-slate-200 p-4">
              <h4 className="text-sm font-bold text-slate-800 mb-3">Champs à personnaliser détectés</h4>
              <div className="space-y-4">
                {draft.variables.map((v) => (
                  <div key={v.key} className="rounded-xl bg-slate-50 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <code className="text-xs font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">{`{{${v.key}}}`}</code>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input value={v.label} onChange={(e) => patchVar(v.key, { label: e.target.value })} placeholder="Intitulé lisible"
                        className="rounded-lg border border-slate-200 bg-white p-2 text-sm outline-none focus:border-emerald-400" />
                      <select value={v.type} onChange={(e) => patchVar(v.key, { type: e.target.value as VarType })}
                        className="rounded-lg border border-slate-200 bg-white p-2 text-sm outline-none focus:border-emerald-400">
                        <option value="text">Texte court</option>
                        <option value="textarea">Paragraphe</option>
                        <option value="select">Liste de choix</option>
                      </select>
                    </div>
                    <input value={v.placeholder ?? ''} onChange={(e) => patchVar(v.key, { placeholder: e.target.value })} placeholder="Exemple / aide affichée"
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm outline-none focus:border-emerald-400" />
                    {v.type === 'select' && (
                      <input value={(v.options ?? []).join(', ')} onChange={(e) => patchVar(v.key, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })}
                        placeholder="Choix possibles, séparés par des virgules"
                        className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm outline-none focus:border-emerald-400" />
                    )}
                    <label className="mt-2 inline-flex items-center gap-2 text-sm text-slate-600">
                      <input type="checkbox" checked={!!v.required} onChange={(e) => patchVar(v.key, { required: e.target.checked })} className="rounded" />
                      Obligatoire
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Frugalité — allégée en mode perso */}
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
            <div className="flex items-center gap-2 mb-2"><Leaf className="w-4 h-4 text-emerald-600" /><span className="text-sm font-bold text-emerald-800">Sobriété{isPerso ? '' : ' (SPEC AFNOR 2314)'}</span></div>
            <div className="flex gap-2">
              {([1, 2, 3] as const).map((lvl) => (
                <button key={lvl} onClick={() => patchDraft({ frugality_level: lvl })}
                  className={`flex-1 px-3 py-2 rounded-xl text-sm font-bold ring-1 ring-inset transition-all ${
                    draft.frugality_level === lvl ? FRUGALITY_META[lvl].badge + ' ring-2' : 'bg-white text-slate-500 ring-slate-200 hover:bg-slate-50'
                  }`}>{FRUGALITY_META[lvl].label}</button>
              ))}
            </div>

            {showSuggestion && (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-white border border-emerald-200 p-3">
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-600">
                    <span className="font-bold text-slate-800">Suggestion : {FRUGALITY_META[suggestion.level].label}.</span>{' '}
                    {suggestion.reason}
                  </p>
                  <button onClick={() => patchDraft({ frugality_level: suggestion.level })}
                    className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700 transition-colors">
                    Appliquer la suggestion
                  </button>
                </div>
              </div>
            )}
            {!isPerso && (
              <>
                <input value={draft.recommended_model} onChange={(e) => patchDraft({ recommended_model: e.target.value })} placeholder="Modèle sobre conseillé (ex : Claude Haiku, Mistral Small)"
                  className="mt-3 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm outline-none focus:border-emerald-400 mb-2" />
                <textarea rows={2} value={draft.frugality_tip} onChange={(e) => patchDraft({ frugality_tip: e.target.value })} placeholder="Conseil de sobriété affiché à l'utilisateur"
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm outline-none focus:border-emerald-400" />
              </>
            )}
          </div>

          {/* Suppression */}
          {draft.id && (
            <div className="pt-2">
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600">Confirmer la suppression ?</span>
                  <button onClick={removePrompt} disabled={saving} className="px-3 py-1.5 rounded-lg text-sm font-bold text-white bg-rose-600 hover:bg-rose-700">Oui, supprimer</button>
                  <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded-lg text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">Annuler</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 text-sm font-bold text-rose-600 hover:text-rose-700"><Trash2 className="w-4 h-4" />Supprimer ce prompt</button>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 p-4 border-t border-slate-100">
          {isPerso ? (
            <>
              <button onClick={() => save('save_perso')} disabled={saving}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <User className="w-4 h-4" />}Enregistrer
              </button>
              {!myOrgId && (
                <button onClick={() => save('publish_community')} disabled={saving}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700 transition-colors disabled:opacity-50"
                  title="Sera soumis à la validation de PiloTerra avant d'être visible par la communauté">
                  <Send className="w-4 h-4" />Proposer à la communauté
                </button>
              )}
            </>
          ) : (
            <>
              <button onClick={() => save('draft')} disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}Brouillon
              </button>

              {isCatalogue ? (
                <button onClick={() => save('publish_catalogue')} disabled={saving}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50">
                  <Library className="w-4 h-4" />Publier au catalogue
                </button>
              ) : (
                <>
                  <button onClick={() => save('publish_org')} disabled={saving}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50">
                    <Globe className="w-4 h-4" />Publier dans mon organisation
                  </button>
                  <button onClick={() => save('publish_community')} disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700 transition-colors disabled:opacity-50"
                    title="Sera soumis à la validation de PiloTerra avant d'être visible par les autres organisations">
                    <Send className="w-4 h-4" />Proposer à la communauté
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PromptEditor;
