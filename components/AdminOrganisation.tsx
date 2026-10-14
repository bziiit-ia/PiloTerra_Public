
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Users, LayoutDashboard, Mail, Calendar, Search, Loader2, Send, CheckCircle2, X, Target, BrainCircuit, BarChart2, Tag, ArrowRight, AlertTriangle, ExternalLink, Copy, Server, Globe, Quote, Building2, Award, RefreshCw, ScrollText, Layers, ChevronRight, ChevronDown, Library, Edit3, Save, LayoutGrid, Download, HelpCircle } from 'lucide-react';
import { Profile, DefiView, Page, Invitation, AgentMetric, PlatformMetric } from '../types';
import { getQuadrantName, MatriceIAView } from './MatriceIAView';
import { Leaf, Zap, Activity, Coins, Sprout, Car, Wheat, TreeDeciduous, Sparkles, Database, GraduationCap } from 'lucide-react';
import { CharteIA } from './CharteIA';
import { CasUsageIA } from './CasUsageIA';
import { BibliothequePrompts } from './BibliothequePrompts';
import { GestionSessions } from './GestionSessions';
import { PromptMatriceModal } from './PromptMatriceModal';
import { ExportDefisModal } from './ExportDefisModal';
import { N8N } from '../n8nConfig';

// Webhook n8n qui déclenche l'invitation Supabase (Admin), voir n8nConfig.ts
// Le workflow n8n doit accepter : { email, entreprise, redirect_url }
const N8N_WEBHOOK_URL = N8N.invitation; 

// Labels des outils de prototype (aligné avec CasUsageIA)
const PROTO_TOOL_LABELS: Record<string, string> = {
  aistudio: 'AI Studio',
  claudecode: 'Claude Code',
  lovable: 'Lovable',
  copilot: 'Copilot',
};

interface AdminOrganisationProps {
  session: any;
  onNavigate: (page: Page) => void;
  adminSelectedOrgId?: string;
}

export const AdminOrganisation: React.FC<AdminOrganisationProps> = ({ session, onNavigate, adminSelectedOrgId }) => {
  const [activeTab, setActiveTab] = useState<'members' | 'defis' | 'invitations' | 'tools' | 'green_it' | 'charte' | 'cas_usage' | 'vue_pipe' | 'prompts' | 'matrice' | 'sessions'>('vue_pipe');
  const [members, setMembers] = useState<Profile[]>([]);
  const [defis, setDefis] = useState<DefiView[]>([]);
  // Toutes les fiches de l'organisation, sans le filtrage par rôle appliqué à `defis`.
  // La matrice collective est un artefact partagé : chaque membre doit voir l'ensemble.
  const [matriceDefis, setMatriceDefis] = useState<DefiView[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string>('all');
  // Recherche dans les fiches défi, commune à toute la partie Pilotage (vue
  // globale, fiches défis, matrice, cas d'usage), combinée au filtre membre.
  const [rechercheDefi, setRechercheDefi] = useState('');
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [agentMetrics, setAgentMetrics] = useState<AgentMetric[]>([]);
  const [platformMetrics, setPlatformMetrics] = useState<PlatformMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgName, setOrgName] = useState('');
  const [userRole, setUserRole] = useState<'user' | 'admin_coop' | 'super_admin' | 'member_orga'>('user');
  
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedDefi, setSelectedDefi] = useState<DefiView | null>(null);
  const [convertedDiagnosticIds, setConvertedDiagnosticIds] = useState<string[]>([]);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'alert' } | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Pipeline data
  interface PipeCasUsage {
    id: string;
    diagnostic_id: string | null;
    titre: string | null;
    status: string;
    hasPrompts: boolean;
    promptCount: number;
    protoTools: string[];  // IDs des outils qui ont un prompt rempli
    hasFrugalite: boolean;
    frugaliteScore: number | null;
  }
  const [pipeCasUsages, setPipeCasUsages] = useState<PipeCasUsage[]>([]);
  const [expandedDefiIds, setExpandedDefiIds] = useState<string[]>([]);
  const [selectedCasUsageId, setSelectedCasUsageId] = useState<string | null>(null);

  type SortOption = 'date_desc' | 'date_asc' | 'roi_desc' | 'roi_asc' | 'complexite_desc' | 'complexite_asc';
  const [defiSort, setDefiSort] = useState<SortOption>('date_desc');

  // Prompt d'analyse de la matrice et export des fiches : deux fenêtres
  // réservées à l'administrateur d'organisation et au super admin.
  const [promptMatriceOuvert, setPromptMatriceOuvert] = useState(false);
  const [exportOuvert, setExportOuvert] = useState(false);
  const peutExporter = userRole === 'admin_coop' || userRole === 'super_admin';

  const handleRoleChange = async (userId: string, newRole: 'user' | 'member_orga' | 'admin_coop') => {
    try {
      const { data: modifies, error } = await supabase
        .from('utilisateurs')
        .update({ role: newRole })
        .eq('id', userId)
        .select('id');

      if (error) throw error;
      // Refus RLS = zéro ligne sans erreur : ne pas annoncer un succès fictif
      if (!modifies || modifies.length === 0) throw new Error("La base a refusé la modification (droits insuffisants).");

      setMembers(members.map(m => m.id === userId ? { ...m, role: newRole } : m));
    } catch (error) {
      console.error("Erreur lors du changement de rôle:", error);
      alert("Une erreur est survenue lors du changement de rôle.");
    }
  };

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
      setNotification({ message: "Titre de la fiche défi mis à jour avec succès.", type: 'success' });
    } catch (err: any) {
      console.error("Erreur lors de la mise à jour du titre du défi:", err);
      setNotification({ message: "Erreur lors de la mise à jour : " + (err.message || "Erreur inconnue"), type: 'alert' });
    } finally {
      setIsSavingTitle(false);
    }
  };

  // --- MATRICE COLLECTIVE ---

  const canEditMatrice = userRole === 'admin_coop' || userRole === 'super_admin';

  const getMatriceUserDetails = (userId: string) => {
    const m: any = members.find((x: any) => x.id === userId);
    const fullName = m ? [m.prenom, m.nom].filter(Boolean).join(' ').trim() : '';
    return {
      name: fullName || m?.email || 'Membre',
      isMember: !!m,
      organisation_id: m?.organisation_id,
      organisation_name: orgName || undefined
    };
  };

  const handleUpdateDefiCollective = async (
    defiId: string,
    roi: number,
    complexite: number,
    justification?: string
  ) => {
    const { data: current, error: fetchError } = await supabase
      .from('diagnostics')
      .select('*')
      .eq('id', defiId)
      .single();

    if (fetchError) throw fetchError;

    const currentMatrice = safeParse(current.output_agent_matrice || current.outpout_agent_matrice);
    const quadrantNom = getQuadrantName(roi, complexite);

    const collective = {
      ...(currentMatrice.collective || {}),
      score_roi: roi,
      score_complexite: complexite,
      quadrant_nom: quadrantNom,
      justification:
        justification ||
        currentMatrice.collective?.justification ||
        "Positionnement ajusté lors de l'analyse collective",
      updated_at: new Date().toISOString()
    };

    const updatedMatrice = { ...currentMatrice, collective };

    const updatePayload: any = {};
    if (Object.keys(current).includes('output_agent_matrice')) {
      updatePayload.output_agent_matrice = updatedMatrice;
    } else if (Object.keys(current).includes('outpout_agent_matrice')) {
      updatePayload.outpout_agent_matrice = updatedMatrice;
    } else {
      updatePayload.output_agent_matrice = updatedMatrice;
    }

    const { error: updateError } = await supabase
      .from('diagnostics')
      .update(updatePayload)
      .eq('id', defiId);

    if (updateError) throw updateError;

    const patch = (d: DefiView): DefiView =>
      d.id === defiId
        ? {
            ...d,
            score_roi_collectif: roi,
            score_complexite_collectif: complexite,
            quadrant_collectif: quadrantNom,
            justification_collectif: collective.justification,
            updated_at_collectif: collective.updated_at
          }
        : d;

    setMatriceDefis(prev => prev.map(patch));
    setDefis(prev => prev.map(patch));
    setSelectedDefi(prev => (prev && prev.id === defiId ? patch(prev) : prev));
  };

  // --- MOTEUR DE RENDU MARKDOWN LÉGER ---
  const renderMarkdown = (text: string) => {
    if (!text) return null;
    
    // 1. Gestion des listes à puces et paragraphes
    return text.split('\n').map((line, index) => {
      const cleanLine = line.trim();
      
      // Listes
      if (cleanLine.startsWith('- ') || cleanLine.startsWith('* ')) {
        return (
          <li key={index} className="ml-4 list-disc pl-1 mb-1 text-slate-700">
            {parseFormatting(cleanLine.substring(2))}
          </li>
        );
      }
      
      // Titres (h3/h4 simulés)
      if (cleanLine.startsWith('### ')) {
        return <h4 key={index} className="text-md font-bold text-slate-900 mt-4 mb-2">{parseFormatting(cleanLine.substring(4))}</h4>;
      }
      
      // Sauts de ligne vides
      if (cleanLine === '') {
        return <div key={index} className="h-2"></div>;
      }

      // Paragraphes standards
      return <p key={index} className="mb-2 text-slate-700 leading-relaxed">{parseFormatting(line)}</p>;
    });
  };

  // Parsing du Gras (**) et Italique (*)
  const parseFormatting = (text: string) => {
    // On split d'abord sur le gras (**...**)
    const parts = text.split(/(\*\*.*?\*\*)/g);
    
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-bold text-slate-900">{part.slice(2, -2)}</strong>;
      }
      
      // Ensuite on gère l'italique sur les parties non grasses
      const subParts = part.split(/(\*.*?\*)/g);
      return subParts.map((subPart, j) => {
         if (subPart.startsWith('*') && subPart.endsWith('*') && subPart.length > 2) {
           return <em key={`${i}-${j}`} className="italic text-slate-600">{subPart.slice(1, -1)}</em>;
         }
         return subPart;
      });
    });
  };

  useEffect(() => {
    fetchData();
  }, [session]);

  const fetchData = async () => {
      if (!session?.user?.id) return;
      setLoading(true);

      try {
        const { data: myProfile, error: profileError } = await supabase
          .from('utilisateurs')
          .select('id, organisation_id, role, organisations(nom)')
          .eq('auth_id', session.user.id)
          .single();
        
        if (profileError) console.error("Erreur profil:", profileError);

        let currentOrgId = adminSelectedOrgId || '';
        if (myProfile) {
          setUserRole(myProfile.role as any);
          if (!currentOrgId && myProfile.organisation_id) {
            currentOrgId = myProfile.organisation_id;
          }
        }

        if (currentOrgId) {
          const { data: orgData } = await supabase
            .from('organisations')
            .select('nom')
            .eq('id', currentOrgId)
            .single();
          if (orgData) {
            setOrgName(orgData.nom || 'Organisation Inconnue');
          } else {
            setOrgName('Organisation Inconnue');
          }
        } else {
          setOrgName('');
        }

        let membersQuery = supabase
          .from('utilisateurs')
          .select('*')
          .eq('provenance', 'piloterra')
          .order('updated_at', { ascending: false });
        
        let membersData: any[] = [];
        if (currentOrgId) {
          membersQuery = membersQuery.eq('organisation_id', currentOrgId);
          const { data, error: membersError } = await membersQuery;
          if (membersError) console.error("Erreur membres:", membersError);
          if (data) {
            membersData = data;
            setMembers(membersData as Profile[]);
          }
        } else {
          setMembers([]);
        }

        const { data: rawDefis, error: defisError } = await supabase
          .from('diagnostics')
          .select('*')
          .eq('provenance', 'piloterra')
          .order('created_at', { ascending: false });
        
        if (defisError) console.error("Erreur défis:", defisError);

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
                email: 'N/A', 
                
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

                // Collective analysis
                score_roi_collectif: collective.score_roi ?? outputMatrice.score_roi_collectif ?? undefined,
                score_complexite_collectif: collective.score_complexite ?? outputMatrice.score_complexite_collectif ?? undefined,
                quadrant_collectif: collective.quadrant_nom || collective.quadrant || outputMatrice.quadrant_collectif || undefined,
                justification_collectif: collective.justification || outputMatrice.justification_collectif || undefined,
                updated_at_collectif: collective.updated_at || outputMatrice.updated_at_collectif || undefined,
            };
          });

          const memberIds = membersData?.map((m: any) => m.id) || [];
          let orgDefis = mappedDefis.filter((d: any) => memberIds.includes(d.user_id));

          setMatriceDefis(orgDefis);

          if (myProfile && myProfile.role === 'user') {
            orgDefis = orgDefis.filter((d: any) => d.user_id === myProfile.id);
          }
          
          setDefis(orgDefis);

          if (currentOrgId) {
            const { data: casUsages, error: casUsagesError } = await supabase
              .from('cas_usage')
              .select('id, diagnostic_id, titre, status, proto_prompts, proto_prompt, frugalite')
              .eq('organisation_id', currentOrgId);
            
            if (casUsagesError) {
              console.error("Erreur lors de la récupération des cas d'usage:", casUsagesError);
            } else if (casUsages) {
              const filteredCasUsages = (myProfile && myProfile.role === 'user')
                ? casUsages.filter((cu: any) => cu.status === 'published')
                : casUsages;

              const ids = filteredCasUsages.map((cu: any) => cu.diagnostic_id).filter(Boolean);
              setConvertedDiagnosticIds(ids);

              // Pipeline data enrichie
              const pipeData: PipeCasUsage[] = filteredCasUsages.map((cu: any) => {
                const protos = cu.proto_prompts || (cu.proto_prompt ? { aistudio: cu.proto_prompt } : {});
                const filledProtos = Object.values(protos).filter(Boolean);
                const frug = cu.frugalite;
                const hasFrug = !!(frug && frug.pratiques && Array.isArray(frug.pratiques));
                let frugScore: number | null = null;
                if (hasFrug) {
                  const scored = frug.pratiques.filter((p: any) => p.score !== null && p.score !== undefined);
                  if (scored.length > 0) {
                    frugScore = scored.reduce((acc: number, p: any) => acc + Number(p.score || 0), 0);
                  }
                }
                return {
                  id: cu.id,
                  diagnostic_id: cu.diagnostic_id,
                  titre: cu.titre,
                  status: cu.status || 'draft',
                  hasPrompts: filledProtos.length > 0,
                  promptCount: filledProtos.length,
                  protoTools: Object.entries(protos).filter(([, v]) => Boolean(v)).map(([k]) => k),
                  hasFrugalite: hasFrug,
                  frugaliteScore: frugScore,
                };
              });
              setPipeCasUsages(pipeData);
            }
          }
        }

        let invitesQuery = supabase
          .from('invitations')
          .select('*')
          .order('created_at', { ascending: false });

        if (currentOrgId) {
          invitesQuery = invitesQuery.eq('organisation_id', currentOrgId);
          const { data: invitesData, error: invitesError } = await invitesQuery;
          console.log("🔍 [DEBUG] Invitations récupérées pour l'org", currentOrgId, ":", invitesData);
          if (invitesError) {
            console.error("Erreur lors de la récupération des invitations:", invitesError);
          }
          if (invitesData) {
            setInvitations(invitesData as Invitation[]);
          }

          // 4. Metrics (Green IT)
          if (myProfile && myProfile.role !== 'user' && membersData.length > 0) {
            const memberAuthIds = membersData.map(m => m.auth_id).filter(Boolean);
            
            if (memberAuthIds.length > 0) {
              const { data: agentMetricsData } = await supabase
                .from('piloterra_agent_metrics')
                .select('*')
                .in('auth_user_id', memberAuthIds);
              
              if (agentMetricsData) setAgentMetrics(agentMetricsData);

              const { data: platformMetricsData } = await supabase
                .from('piloterra_platform_metrics')
                .select('*')
                .in('auth_user_id', memberAuthIds);
              
              if (platformMetricsData) setPlatformMetrics(platformMetricsData);
            }
          }
        } else if (myProfile?.role === 'super_admin') {
          const { data: allInvites, error: allInvitesError } = await invitesQuery;
          console.log("🔍 [DEBUG] Super Admin - Toutes les invitations:", allInvites);
          if (allInvitesError) console.error("Erreur toutes invitations:", allInvitesError);
          if (allInvites) setInvitations(allInvites as Invitation[]);
        } else {
          console.log("🔍 [DEBUG] Aucune organisation ID trouvée, invitations vides");
          setInvitations([]);
        }

      } catch (error) {
        console.error("Error fetching admin data:", error);
      } finally {
        setLoading(false);
      }
    };

  // ... (Code identique pour handleCopyLink, handleInvite, getMemberName, renderScraperData)
  const handleCopyLink = (invitationId: string) => {
    const link = window.location.origin;
    navigator.clipboard.writeText(link).then(() => {
        setCopiedId(invitationId);
        setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleDeleteInvitation = async (id: string) => {
    try {
      const { data: supprimees, error } = await supabase.from('invitations').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!supprimees || supprimees.length === 0) throw new Error("La base a refusé la suppression (droits insuffisants).");
      setInvitations(invitations.filter(i => i.id !== id));
    } catch (error) {
      console.error("Erreur lors de la suppression de l'invitation:", error);
      alert("Une erreur est survenue lors de la suppression.");
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteLoading(true);
    setInviteSuccess(false);
    setInviteError(null);

    const cleanEmail = inviteEmail.trim().toLowerCase();

    // Re-fetch current user to get their organisation_id securely
    const { data: myProfile } = await supabase
      .from('utilisateurs')
      .select('id, organisation_id, organisations(nom)')
      .eq('auth_id', session.user.id)
      .single();

    const currentOrgId = myProfile?.organisation_id;
    const orgs = myProfile?.organisations as any;
    const currentOrgName = Array.isArray(orgs) ? orgs[0]?.nom : orgs?.nom;
    const effectiveOrgName = currentOrgName || orgName;

    if (!currentOrgId) {
        setInviteError("Impossible d'envoyer une invitation : votre profil n'est associé à aucune organisation.");
        setInviteLoading(false);
        return;
    }

    try {
      const { data: existing } = await supabase
        .from('invitations')
        .select('id')
        .eq('email', cleanEmail)
        .eq('organisation_id', currentOrgId)
        .eq('status', 'pending')
        .limit(1)
        .maybeSingle();

      if (existing) {
         throw new Error("Une invitation est déjà en cours pour cet email.");
      }

      const { data: existingMember } = await supabase
        .from('utilisateurs')
        .select('id')
        .eq('email', cleanEmail)
        .eq('organisation_id', currentOrgId)
        .maybeSingle();

      if (existingMember) {
        throw new Error("Cet utilisateur est déjà membre de la organisation.");
      }

      const { error: dbError } = await supabase.from('invitations').insert({
        email: cleanEmail,
        organisation_id: currentOrgId,
        entreprise: effectiveOrgName, 
        role: 'user',
        created_by: session.user.id,
        status: 'pending'
      });

      if (dbError) throw dbError;
      
      try {
        // Appeler le webhook n8n pour envoyer l'email
        // Note: On utilise 'no-cors' et 'text/plain' pour éviter les erreurs CORS (Failed to fetch)
        // car le serveur n8n n'autorise probablement pas les requêtes cross-origin avec JSON.
        console.log("🚀 [DEBUG] Tentative d'appel du webhook n8n...", N8N_WEBHOOK_URL);
        await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 
                'Content-Type': 'text/plain'
            },
            body: JSON.stringify({
                email: cleanEmail,
                entreprise: effectiveOrgName,
                organisation_id: currentOrgId,
                redirect_url: window.location.origin 
            })
        });
        console.log("✅ [DEBUG] Appel webhook n8n terminé (mode no-cors)");
      } catch (webhookError) {
          console.error("❌ [DEBUG] Erreur appel n8n:", webhookError);
      }

      setInviteSuccess(true);
      await fetchData();
      setInviteEmail('');
      
    } catch (err: any) {
      console.error("Invite error:", err);
      if (err.message && err.message.includes('row-level security')) {
        setInviteError("Erreur de permissions (RLS) : La base de données refuse l'ajout.");
      } else {
        setInviteError(err.message || "Une erreur inconnue est survenue.");
      }
    } finally {
      setInviteLoading(false);
    }
  };

  const getMemberName = (userId: string) => {
    const m = members.find(mem => mem.id === userId);
    return m ? `${m.prenom} ${m.nom}` : 'Utilisateur inconnu';
  };

  // ── Filtre des fiches défi (partie Pilotage) ──────────────────────
  //  Un seul filtre pour toutes les vues : membre + recherche libre.
  //  La recherche ignore la casse et les accents, et porte sur le titre,
  //  le problème, la vision, les ressources, le contexte, la question
  //  clé, les mots-clés, le quadrant et l'auteur. Plusieurs mots : tous
  //  doivent être présents (dans n'importe quel champ).
  const sansAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const motsRecherche = sansAccent(rechercheDefi.trim()).split(/\s+/).filter(Boolean);
  const filtreDefisActif = selectedMemberId !== 'all' || motsRecherche.length > 0;

  const correspondRecherche = (d: DefiView): boolean => {
    if (motsRecherche.length === 0) return true;
    const m = members.find(mem => mem.id === d.user_id);
    const texte = sansAccent([
      d.titreDefi, d.probleme, d.vision, d.ressources, d.contexte_ia, d.questionCle,
      d.motsCles, d.quadrant, d.email, m ? `${m.prenom} ${m.nom}` : '',
    ].filter(Boolean).join(' '));
    return motsRecherche.every(mot => texte.includes(mot));
  };

  const filtrerDefis = (liste: DefiView[]): DefiView[] =>
    liste.filter(d => (selectedMemberId === 'all' || d.user_id === selectedMemberId) && correspondRecherche(d));

  const defisFiltres = filtrerDefis(defis);
  const matriceDefisFiltres = filtrerDefis(matriceDefis);
  // Cas d'usage : ceux des fiches retenues, quand une recherche est en cours
  const idsDefisFiltres = motsRecherche.length > 0 ? defisFiltres.map(d => d.id) : undefined;

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

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>;

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {adminSelectedOrgId && (
          <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-900 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-indigo-600 shrink-0" />
              <div>
                <p className="font-bold text-sm">Mode Supervision (Super Admin)</p>
                <p className="text-xs text-indigo-700">Vous visualisez et gérez l'espace de l'organisation <strong>{orgName}</strong> avec les permissions administrateur.</p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('super-admin')}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs transition-colors shadow-sm shrink-0"
            >
              Retour à la console Super Admin
            </button>
          </div>
        )}

        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              {adminSelectedOrgId ? "Espace Organisation" : (userRole === 'user' ? "Espace Membre" : userRole === 'member_orga' ? "Espace Organisation" : "Administration")} {orgName || "(Organisation non définie)"}
              <button 
                onClick={fetchData}
                disabled={loading}
                className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors text-slate-400 hover:text-slate-600 disabled:opacity-50"
                title="Rafraîchir les données"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </h1>
            <p className="text-slate-500">
              {adminSelectedOrgId 
                ? "Visualisation et administration complète des défis, cas d'usage, chartes et membres de l'organisation."
                : (userRole === 'user' || userRole === 'member_orga' 
                  ? "Accédez aux ressources de votre organisation et suivez vos défis." 
                  : "Gérez les membres et suivez l'adoption de l'IA dans votre organisation.")}
            </p>
          </div>
          <button 
            onClick={() => onNavigate(adminSelectedOrgId ? 'super-admin' : 'dashboard')}
            className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600"
            title={adminSelectedOrgId ? "Retour à la console Super Admin" : "Retour au tableau de bord"}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {!orgName && (
          <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p><strong>Attention :</strong> Votre compte n'est lié à aucune organisation. Veuillez contacter un administrateur pour configurer votre accès.</p>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div 
            onClick={() => setActiveTab('members')}
            className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:border-emerald-300 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><Users className="w-6 h-6" /></div>
              <div>
                <p className="text-sm text-slate-500 font-bold uppercase">Membres</p>
                <p className="text-2xl font-black text-slate-800">{members.length}</p>
              </div>
            </div>
          </div>
          <div 
            onClick={() => setActiveTab('defis')}
            className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:border-emerald-300 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-50 text-purple-600 rounded-lg"><LayoutDashboard className="w-6 h-6" /></div>
              <div>
                <p className="text-sm text-slate-500 font-bold uppercase">{userRole === 'user' ? 'Mes Défis' : 'Défis IA Lancés'}</p>
                <p className="text-2xl font-black text-slate-800">{defis.length}</p>
              </div>
            </div>
          </div>
          <div 
            onClick={() => { setSelectedCasUsageId(null); setActiveTab('cas_usage'); }}
            className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:border-emerald-300 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg"><BrainCircuit className="w-6 h-6" /></div>
              <div>
                <p className="text-sm text-slate-500 font-bold uppercase">Cas d'Usage</p>
                <p className="text-2xl font-black text-slate-800">{pipeCasUsages.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs organized in two groups */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden min-h-[500px]">
          <div className="flex flex-col lg:flex-row border-b border-slate-200 bg-slate-50/50">
            {/* Group 1: Pilotage */}
            <div className="flex-1 p-4 border-b lg:border-b-0 lg:border-r border-slate-200">
              <div className="flex items-center gap-1.5 mb-2.5 text-xs font-bold text-emerald-800 uppercase tracking-wider">
                <Target className="w-3.5 h-3.5 text-emerald-600" />
                Pilotage
              </div>
              <div className="flex flex-wrap gap-2">
                <button 
                  onClick={() => setActiveTab('vue_pipe')}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                    activeTab === 'vue_pipe' 
                      ? 'bg-emerald-600 text-white shadow-sm' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  Vue globale
                </button>
                <button 
                  onClick={() => setActiveTab('defis')}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                    activeTab === 'defis' 
                      ? 'bg-emerald-600 text-white shadow-sm' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Target className="w-4 h-4" />
                  {userRole === 'user' ? 'Mes Défis' : 'Fiche Défis IA'} ({filtreDefisActif ? `${defisFiltres.length}/${defis.length}` : defis.length})
                </button>
                <button 
                  onClick={() => setActiveTab('matrice')}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                    activeTab === 'matrice' 
                      ? 'bg-emerald-600 text-white shadow-sm' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                  Matrice ({filtreDefisActif ? `${matriceDefisFiltres.length}/${matriceDefis.length}` : matriceDefis.length})
                </button>
                <button 
                  onClick={() => { setSelectedCasUsageId(null); setActiveTab('cas_usage'); }}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                    activeTab === 'cas_usage' 
                      ? 'bg-emerald-600 text-white shadow-sm' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <BrainCircuit className="w-4 h-4" />
                  Cas d'Usage IA
                </button>
                {userRole !== 'user' && (
                  <button 
                    onClick={() => setActiveTab('charte')}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                      activeTab === 'charte' 
                        ? 'bg-emerald-600 text-white shadow-sm' 
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <ScrollText className="w-4 h-4" />
                    Charte IA
                  </button>
                )}
              </div>
            </div>

            {/* Group 2: Administration */}
            <div className="flex-1 p-4">
              <div className="flex items-center gap-1.5 mb-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <Building2 className="w-3.5 h-3.5 text-slate-500" />
                Administration
              </div>
              <div className="flex flex-wrap gap-2">
                <button 
                  onClick={() => setActiveTab('members')}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                    activeTab === 'members' 
                      ? 'bg-slate-700 text-white shadow-sm' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  Membres ({members.length})
                </button>
                {userRole !== 'user' && (
                  <>
                    {/* Sessions de formation : super admin seulement (arbitré le
                        18/09/2026), l'admin d'organisation est un apprenant. */}
                    {userRole === 'super_admin' && (
                      <button
                        onClick={() => setActiveTab('sessions')}
                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                          activeTab === 'sessions'
                            ? 'bg-slate-700 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                      >
                        <GraduationCap className="w-4 h-4" />
                        Formations
                      </button>
                    )}
                    <button
                      onClick={() => setActiveTab('invitations')}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                        activeTab === 'invitations' 
                          ? 'bg-slate-700 text-white shadow-sm' 
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      <Mail className="w-4 h-4" />
                      Invitations
                    </button>
                    <button 
                      onClick={() => setActiveTab('green_it')}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                        activeTab === 'green_it' 
                          ? 'bg-slate-700 text-white shadow-sm' 
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      <Leaf className="w-4 h-4" />
                      Espace Green IT
                    </button>
                  </>
                )}
                {userRole === 'user' && (
                  <button 
                    onClick={() => setActiveTab('tools')}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                      activeTab === 'tools' 
                        ? 'bg-slate-700 text-white shadow-sm' 
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <Globe className="w-4 h-4" />
                    Outils
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="p-6">
            {/* Recherche & filtres des défis : commun à toute la partie Pilotage.
                Le choix du membre est réservé aux rôles qui voient les fiches des
                autres ; un simple membre ('user') garde la recherche. */}
            {(activeTab === 'vue_pipe' || activeTab === 'defis' || activeTab === 'matrice' || activeTab === 'cas_usage') && (
              <div className="mb-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-100/60 p-4 rounded-xl border border-slate-200 animate-in fade-in duration-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg shrink-0">
                    <Search className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">Recherche &amp; filtres des défis</p>
                    <p className="text-xs text-slate-500">
                      Filtrez les fiches défi dans toute la partie pilotage (vue globale, fiches défis, matrice, cas d'usage).
                      {filtreDefisActif && (
                        <span className="ml-1 font-bold text-slate-700">
                          {defisFiltres.length} fiche{defisFiltres.length > 1 ? 's' : ''} sur {defis.length}.
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 lg:min-w-[520px]">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="search"
                      value={rechercheDefi}
                      onChange={(e) => setRechercheDefi(e.target.value)}
                      placeholder="Rechercher par titre, problème, mot-clé…"
                      className="w-full pl-9 pr-9 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-sm"
                    />
                    {rechercheDefi && (
                      <button
                        onClick={() => setRechercheDefi('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                        title="Effacer la recherche"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {userRole !== 'user' && (
                    <div className="relative sm:min-w-[220px]">
                      <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <select
                        value={selectedMemberId}
                        onChange={(e) => setSelectedMemberId(e.target.value)}
                        className="w-full pl-9 pr-10 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer appearance-none font-medium shadow-sm"
                      >
                        <option value="all">Tous les membres ({members.length})</option>
                        {members.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.prenom} {m.nom} ({m.email || 'N/A'})
                          </option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-slate-400">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'green_it' && (
              <div className="max-w-5xl mx-auto py-4">
                <div className="flex items-center gap-3 mb-8">
                  <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl">
                    <Leaf className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900">Espace Green IT</h3>
                    <p className="text-slate-500 text-sm">Mesurez l'empreinte numérique et l'efficacité de votre organisation.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                  {/* Total Requests */}
                  <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center text-center group hover:border-emerald-200 transition-all">
                    <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Zap className="w-8 h-8" />
                    </div>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Requêtes IA</p>
                    <p className="text-4xl font-black text-slate-900 mb-2">{agentMetrics.length}</p>
                    <p className="text-xs text-slate-500">Total des interactions avec les agents</p>
                  </div>

                  {/* Token Consumption */}
                  <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center text-center group hover:border-emerald-200 transition-all">
                    <div className="w-16 h-16 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Coins className="w-8 h-8" />
                    </div>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Consommation Tokens</p>
                    <p className="text-4xl font-black text-slate-900 mb-2">
                      {(agentMetrics.reduce((acc, m) => acc + (m.total_tokens || 0), 0) / 1000).toFixed(1)}k
                    </p>
                    <p className="text-xs text-slate-500">Volume de données traitées par l'IA</p>
                  </div>

                  {/* Carbon Impact */}
                  <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center text-center group hover:border-emerald-200 transition-all">
                    <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Activity className="w-8 h-8" />
                    </div>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Impact Carbone</p>
                    <p className="text-4xl font-black text-emerald-600 mb-2">
                      {(
                        agentMetrics.reduce((acc, m) => acc + (m.emissions_gco2eq || 0), 0) +
                        platformMetrics.reduce((acc, m) => acc + (m.co2_grams || 0), 0)
                      ).toFixed(2)}g
                    </p>
                    <p className="text-xs text-slate-500">Estimation CO2eq (Agents + Portail)</p>
                  </div>
                </div>

                {/* Ludic Equivalences */}
                {(() => {
                  const totalCo2Grams = agentMetrics.reduce((acc, m) => acc + (m.emissions_gco2eq || 0), 0) +
                                       platformMetrics.reduce((acc, m) => acc + (m.co2_grams || 0), 0);
                  
                  return (
                    <div className="bg-slate-900 rounded-3xl p-8 text-white relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-8 opacity-10">
                        <Sprout className="w-32 h-32" />
                      </div>
                      
                      <h4 className="text-lg font-bold mb-6 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-emerald-400" />
                        C'est quoi cet impact ?
                      </h4>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-emerald-400">
                            <Car className="w-5 h-5" />
                            <span className="text-2xl font-black">
                              {(totalCo2Grams / 218).toFixed(2)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 uppercase font-bold">Km en voiture</p>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-amber-400">
                            <Wheat className="w-5 h-5" />
                            <span className="text-2xl font-black">
                              {(totalCo2Grams / 1230).toFixed(2)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 uppercase font-bold">Kg de Blé</p>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-purple-400">
                            <TreeDeciduous className="w-5 h-5" />
                            <span className="text-2xl font-black">
                              {(totalCo2Grams / 20000).toFixed(4)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 uppercase font-bold">Arbres (absorption/an)</p>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-blue-400">
                            <Database className="w-5 h-5" />
                            <span className="text-2xl font-black">
                              {(platformMetrics.reduce((acc, m) => acc + (m.bytes_transferred || 0), 0) / (1024 * 1024)).toFixed(1)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 uppercase font-bold">Mo transférés</p>
                        </div>
                      </div>

                      <div className="mt-8 pt-8 border-t border-white/10 text-sm text-slate-400 leading-relaxed">
                        <p>
                          L'impact carbone est calculé en temps réel en combinant les émissions liées à l'exécution des modèles d'IA (calcul intensif) 
                          et le transfert de données sur le portail (modèle SWD). 
                          <strong> Piloterra s'engage pour une IA frugale et responsable.</strong>
                          <span className="ml-2">
                            (source <a href="https://impactco2.fr/" target="_blank" rel="noopener noreferrer" className="underline hover:text-emerald-400 transition-colors">ADEME</a>)
                          </span>
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
            {activeTab === 'members' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-xs font-bold text-slate-400 uppercase border-b border-slate-100">
                      <th className="py-3 px-2">Nom</th>
                      <th className="py-3 px-2">Rôle</th>
                      <th className="py-3 px-2">Dernière connexion</th>
                      <th className="py-3 px-2">Email</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {members.map(m => (
                      <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-3 px-2 font-medium text-slate-800">{m.prenom} {m.nom}</td>
                        <td className="py-3 px-2">
                          {m.role === 'super_admin' ? (
                            <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-red-100 text-red-700">
                              Super Admin
                            </span>
                          ) : (userRole === 'user' || userRole === 'member_orga') ? (
                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                              m.role === 'admin_coop' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                              m.role === 'member_orga' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' :
                              'bg-slate-100 text-slate-600 border-slate-200'
                            } border`}>
                              {m.role === 'admin_coop' ? 'Admin Coop' : m.role === 'member_orga' ? "Manager" : 'Membre'}
                            </span>
                          ) : (
                            <select
                              value={m.role}
                              onChange={(e) => handleRoleChange(m.id, e.target.value as any)}
                              className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase cursor-pointer outline-none ${
                                m.role === 'admin_coop' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                                m.role === 'member_orga' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' :
                                'bg-slate-100 text-slate-600 border-slate-200'
                              } border`}
                            >
                              <option value="user">Membre</option>
                              <option value="member_orga">Manager</option>
                              <option value="admin_coop">Admin Coop</option>
                            </select>
                          )}
                        </td>
                        <td className="py-3 px-2 text-slate-500">{m.updated_at ? new Date(m.updated_at).toLocaleString() : 'Jamais'}</td>
                        <td className="py-3 px-2 text-slate-500">{m.email || 'N/A'}</td>
                      </tr>
                    ))}
                    {members.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-400">Aucun membre trouvé dans cette organisation.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'defis' && (() => {
              const currentFilteredDefis = defisFiltres;
              return (
                <div>
                  <div className="flex flex-wrap justify-end items-center gap-3 mb-4">
                    {/* Export des fiches : admin d'organisation et super admin */}
                    {peutExporter && (
                      <button
                        onClick={() => setExportOuvert(true)}
                        className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 border border-slate-200 rounded-lg px-3 py-2 bg-white hover:border-emerald-300 hover:text-emerald-700 transition-colors"
                        title="Exporter les fiches défi en CSV"
                      >
                        <Download className="w-4 h-4" />
                        Exporter
                      </button>
                    )}
                    <select
                      value={defiSort}
                      onChange={(e) => setDefiSort(e.target.value as SortOption)}
                      className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 text-slate-700 outline-none focus:border-emerald-500"
                    >
                      <option value="date_desc">Plus récents d'abord</option>
                      <option value="date_asc">Plus anciens d'abord</option>
                      <option value="roi_desc">ROI décroissant</option>
                      <option value="roi_asc">ROI croissant</option>
                      <option value="complexite_desc">Complexité décroissante</option>
                      <option value="complexite_asc">Complexité croissante</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[...currentFilteredDefis].sort((a, b) => {
                      switch (defiSort) {
                        case 'date_asc': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
                        case 'date_desc': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                        case 'roi_asc': return (Number(a.score_roi) || 0) - (Number(b.score_roi) || 0);
                        case 'roi_desc': return (Number(b.score_roi) || 0) - (Number(a.score_roi) || 0);
                        case 'complexite_asc': return (Number(a.score_complexite) || 0) - (Number(b.score_complexite) || 0);
                        case 'complexite_desc': return (Number(b.score_complexite) || 0) - (Number(a.score_complexite) || 0);
                        default: return 0;
                      }
                    }).map(d => (
                      <div 
                        key={d.id} 
                        onClick={() => setSelectedDefi(d)}
                        className="p-4 rounded-xl border border-slate-200 bg-white hover:border-emerald-200 transition-colors cursor-pointer group"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">{getMemberName(d.user_id)}</span>
                          <span className="text-[10px] text-slate-400">{new Date(d.created_at).toLocaleDateString()}</span>
                        </div>
                        <h4 className="font-bold text-slate-800 mb-1 flex items-center justify-between gap-2">
                           <span className="truncate flex-1">{d.titreDefi || "Analyse en cours..."}</span>
                           <button 
                             onClick={(e) => {
                               e.stopPropagation();
                               setSelectedDefi(d);
                               setEditTitleValue(d.titreDefi || '');
                               setIsEditingTitle(true);
                             }}
                             className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-slate-100 rounded transition-colors shrink-0"
                             title="Modifier le titre"
                           >
                             <Edit3 className="w-3.5 h-3.5" />
                           </button>
                           <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 opacity-0 group-hover:opacity-100 transition-all shrink-0" />
                        </h4>
                        <p className="text-xs text-slate-500 line-clamp-2 mb-3">{d.probleme}</p>
                        {(d.quadrant || convertedDiagnosticIds.includes(d.id)) && (
                          <div className="flex flex-wrap gap-2">
                             {d.quadrant && (
                               <>
                                 <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-medium border border-slate-200">{d.quadrant}</span>
                                 <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-medium border border-slate-200">ROI: {d.score_roi}</span>
                                 <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-medium border border-slate-200">Complexité: {d.score_complexite}</span>
                               </>
                             )}
                             {convertedDiagnosticIds.includes(d.id) && (
                               <span className="text-[10px] px-2.5 py-0.5 bg-emerald-100 text-emerald-700 border border-emerald-200 rounded font-bold flex items-center gap-0.5">
                                 ✓ Cas d'usage
                               </span>
                             )}
                          </div>
                        )}
                      </div>
                    ))}
                    {currentFilteredDefis.length === 0 && (
                      <p className="col-span-full text-center text-slate-400 py-10">
                        {defis.length === 0 ? "Aucun défi généré pour le moment." : "Aucune fiche ne correspond à la recherche ou au membre choisi."}
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}

            {activeTab === 'vue_pipe' && (
              <div className="max-w-6xl mx-auto py-4 animate-in fade-in duration-200">
                {/* Header */}
                <div className="flex items-center gap-3 mb-8">
                  <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl">
                    <Layers className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900">Vue globale</h3>
                    <p className="text-slate-500 text-sm">Progression globale de vos projets IA, du défi initial à l'audit frugalité.</p>
                  </div>
                </div>

                {/* ── ENTONNOIR 4 ÉTAPES ── */}
                {(() => {
                  const currentFilteredDefis = defisFiltres;
                  // Cas d'usage rattachés aux fiches retenues par le filtre
                  const currentFilteredPipeCasUsages = filtreDefisActif
                    ? pipeCasUsages.filter(c => defisFiltres.some(x => x.id === c.diagnostic_id))
                    : pipeCasUsages;

                  const totalDefis = currentFilteredDefis.length;
                  const totalCasUsages = currentFilteredPipeCasUsages.filter(c => c.diagnostic_id).length;
                  const totalPrompts = currentFilteredPipeCasUsages.filter(c => c.hasPrompts).length;
                  const totalFrugalite = currentFilteredPipeCasUsages.filter(c => c.hasFrugalite).length;

                  const stages = [
                    { label: 'Fiches Défi', count: totalDefis, icon: <Target className="w-5 h-5" />, color: 'blue', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', accent: 'bg-blue-600' },
                    { label: 'Cas d\'Usage', count: totalCasUsages, icon: <BrainCircuit className="w-5 h-5" />, color: 'emerald', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', accent: 'bg-emerald-600' },
                    { label: 'Prompts Proto', count: totalPrompts, icon: <Sparkles className="w-5 h-5" />, color: 'purple', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', accent: 'bg-purple-600' },
                    { label: 'Audit Frugalité', count: totalFrugalite, icon: <Leaf className="w-5 h-5" />, color: 'amber', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', accent: 'bg-amber-600' },
                  ];

                  return (
                    <>
                      {/* ── HORIZONTAL VISUAL FUNNEL ── */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                        {stages.map((stage, idx) => (
                          <div 
                            key={idx} 
                            className={`p-4 rounded-xl border ${stage.border} ${stage.bg} flex items-center justify-between shadow-sm animate-in zoom-in duration-200`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`p-2.5 rounded-lg bg-white ${stage.text} shadow-sm`}>
                                {stage.icon}
                              </div>
                              <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{stage.label}</p>
                                <p className="text-2xl font-black text-slate-800">{stage.count}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* ── DÉTAIL PAR FICHE (ACCORDÉON) ── */}
                      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                          <h4 className="font-bold text-slate-800 flex items-center gap-2">
                            <BarChart2 className="w-4 h-4 text-slate-500" />
                            Détail par fiche défi
                          </h4>
                          <span className="text-xs text-slate-400">{totalDefis} défi{totalDefis > 1 ? 's' : ''}</span>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {currentFilteredDefis.length === 0 && (
                            <p className="text-center text-slate-400 py-10 italic">
                              {defis.length === 0 ? "Aucun défi dans l'organisation." : "Aucune fiche ne correspond à la recherche ou au membre choisi."}
                            </p>
                          )}
                          {currentFilteredDefis.map(d => {
                            const linked = currentFilteredPipeCasUsages.filter(c => c.diagnostic_id === d.id);
                            const hasCas = linked.length > 0;
                            const hasPrompt = linked.some(c => c.hasPrompts);
                            const hasFrug = linked.some(c => c.hasFrugalite);
                            const frugScore = linked.find(c => c.frugaliteScore !== null)?.frugaliteScore;

                            const stepsDone = [true, hasCas, hasPrompt, hasFrug];
                            const progression = stepsDone.filter(Boolean).length;
                            const isExpanded = expandedDefiIds.includes(d.id);

                            const toggleExpand = () => {
                              setExpandedDefiIds(prev => 
                                prev.includes(d.id) ? prev.filter(id => id !== d.id) : [...prev, d.id]
                              );
                            };

                            return (
                              <div key={d.id}>
                                {/* ── Ligne principale du défi (cliquable) ── */}
                                <div 
                                  onClick={hasCas ? toggleExpand : undefined}
                                  className={`px-6 py-4 transition-colors ${hasCas ? 'cursor-pointer hover:bg-slate-50/80' : ''} ${isExpanded ? 'bg-slate-50/60' : ''}`}
                                >
                                  <div className="flex items-start justify-between gap-4 mb-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                      {hasCas && (
                                        <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`} />
                                      )}
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                          <p className="font-bold text-slate-800 truncate">{d.titreDefi || 'Analyse en cours...'}</p>
                                          <button 
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setSelectedDefi(d);
                                              setEditTitleValue(d.titreDefi || '');
                                              setIsEditingTitle(true);
                                            }}
                                            className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-slate-100 rounded transition-colors shrink-0"
                                            title="Modifier le titre"
                                          >
                                            <Edit3 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                        <p className="text-xs text-slate-400 mt-0.5">
                                          {getMemberName(d.user_id)} · {new Date(d.created_at).toLocaleDateString()}
                                        </p>
                                      </div>
                                    </div>
                                    <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${
                                      progression === 4 ? 'bg-succes-100 text-succes-700 border border-succes-200' :
                                      progression >= 3 ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                                      progression >= 2 ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                                      'bg-slate-100 text-slate-500 border border-slate-200'
                                    }`}>
                                      {progression}/4 étapes
                                    </span>
                                  </div>

                                  {/* Pipeline visuel résumé */}
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 border border-blue-200">
                                      <Target className="w-3.5 h-3.5" />
                                      <span className="text-xs font-bold">Défi</span>
                                    </div>
                                    <ChevronRight className={`w-4 h-4 shrink-0 ${hasCas ? 'text-emerald-400' : 'text-slate-200'}`} />
                                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${
                                      hasCas ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-300 border-slate-100'
                                    }`}>
                                      <BrainCircuit className="w-3.5 h-3.5" />
                                      <span className="text-xs font-bold">Cas d'usage</span>
                                      {hasCas && <span className="text-[10px] bg-emerald-200 text-emerald-800 px-1 rounded">×{linked.length}</span>}
                                    </div>
                                    <ChevronRight className={`w-4 h-4 shrink-0 ${hasPrompt ? 'text-purple-400' : 'text-slate-200'}`} />
                                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${
                                      hasPrompt ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-slate-50 text-slate-300 border-slate-100'
                                    }`}>
                                      <Sparkles className="w-3.5 h-3.5" />
                                      <span className="text-xs font-bold">Prompts</span>
                                      {hasPrompt && (() => {
                                        const total = linked.reduce((acc, c) => acc + c.promptCount, 0);
                                        return total > 0 ? <span className="text-[10px] bg-purple-200 text-purple-800 px-1 rounded">×{total}</span> : null;
                                      })()}
                                    </div>
                                    <ChevronRight className={`w-4 h-4 shrink-0 ${hasFrug ? 'text-amber-400' : 'text-slate-200'}`} />
                                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${
                                      hasFrug ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-300 border-slate-100'
                                    }`}>
                                      <Leaf className="w-3.5 h-3.5" />
                                      <span className="text-xs font-bold">Frugalité</span>
                                      {frugScore !== null && frugScore !== undefined && (
                                        <span className="text-[10px] bg-amber-200 text-amber-800 px-1.5 rounded font-black">{frugScore}/20</span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* ── Sous-lignes dépliées : cas d'usage liés ── */}
                                {isExpanded && hasCas && (
                                  <div className="bg-slate-50/40 border-t border-slate-100">
                                    {linked.map((cu, cuIdx) => (
                                      <div 
                                        key={cu.id}
                                        className={`flex items-center gap-3 px-6 py-3 hover:bg-emerald-50/40 transition-colors cursor-pointer group ${
                                          cuIdx < linked.length - 1 ? 'border-b border-slate-100/60' : ''
                                        }`}
                                        onClick={(e) => { e.stopPropagation(); setSelectedCasUsageId(cu.id); setActiveTab('cas_usage'); }}
                                      >
                                        {/* Indentation + connecteur visuel */}
                                        <div className="w-6 flex justify-center shrink-0">
                                          <div className="w-px h-full bg-emerald-200 relative">
                                            <div className="absolute top-1/2 left-0 w-3 h-px bg-emerald-200"></div>
                                          </div>
                                        </div>

                                        {/* Icône cas d'usage */}
                                        <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 group-hover:bg-emerald-200 transition-colors">
                                          <BrainCircuit className="w-4 h-4" />
                                        </div>

                                        {/* Titre + Statut */}
                                        <div className="min-w-0 flex-1">
                                          <p className="text-sm font-bold text-slate-700 truncate group-hover:text-emerald-700 transition-colors">
                                            {cu.titre || 'Cas d\'usage sans titre'}
                                          </p>
                                          <span className={`text-[10px] font-bold uppercase ${
                                            cu.status === 'published' ? 'text-succes-500' : 'text-slate-400'
                                          }`}>
                                            {cu.status === 'published' ? 'Publié' : 'Brouillon'}
                                          </span>
                                        </div>

                                        {/* Prompts par outil */}
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          {cu.protoTools.length > 0 ? (
                                            cu.protoTools.map(toolId => (
                                              <span key={toolId} className="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-700 border border-purple-200 rounded-full font-bold">
                                                {PROTO_TOOL_LABELS[toolId] || toolId}
                                              </span>
                                            ))
                                          ) : (
                                            <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-400 border border-slate-200 rounded-full italic">
                                              Pas de prompt
                                            </span>
                                          )}
                                        </div>

                                        {/* Frugalité */}
                                        <div className="shrink-0">
                                          {cu.hasFrugalite ? (
                                            <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 border border-amber-200 rounded-full font-black">
                                              {cu.frugaliteScore !== null ? `${cu.frugaliteScore}/20` : 'Évalué'}
                                            </span>
                                          ) : (
                                            <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-400 border border-slate-200 rounded-full italic">
                                              —
                                            </span>
                                          )}
                                        </div>

                                        {/* Flèche vers cas d'usage */}
                                        <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-500 transition-colors shrink-0" />
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {activeTab === 'invitations' && userRole !== 'user' && (
              <div className="max-w-4xl mx-auto">
                {userRole !== 'member_orga' ? (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-8 mb-8">
                    <h3 className="text-xl font-bold text-emerald-900 mb-2 flex items-center gap-2">
                      <Send className="w-5 h-5" /> Inviter un nouveau membre
                    </h3>
                    <p className="text-emerald-700 mb-6 text-sm">
                      Envoyez une invitation par email. Le futur membre recevra un lien pour rejoindre <strong>{orgName}</strong>.
                    </p>
                    
                    <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3">
                      <div className="relative flex-1">
                        <Mail className="absolute left-3 top-3 w-5 h-5 text-emerald-400" />
                        <input 
                          type="email" 
                          required
                          placeholder="email@exemple.com"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 rounded-xl border border-emerald-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                        />
                      </div>
                      <button 
                        type="submit"
                        disabled={inviteLoading || !orgName}
                        className="px-8 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 disabled:opacity-50 flex items-center justify-center gap-2 min-w-[160px]"
                      >
                        {inviteLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                        Envoyer
                      </button>
                    </form>
                    
                    {inviteSuccess && (
                      <div className="mt-4 p-3 bg-emerald-100 text-emerald-700 rounded-lg flex items-center gap-2 text-sm animate-in fade-in slide-in-from-top-1">
                        <CheckCircle2 className="w-4 h-4" /> Invitation envoyée avec succès !
                      </div>
                    )}
                    
                    {inviteError && (
                      <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg flex items-center gap-2 text-sm animate-in fade-in slide-in-from-top-1">
                        <AlertTriangle className="w-4 h-4" /> {inviteError}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-slate-200 text-slate-600 rounded-2xl p-6 mb-8 text-sm italic flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    En tant que Manager, vous pouvez visualiser les invitations mais vous ne pouvez pas en créer ni en supprimer. Contactez un administrateur pour inviter un nouveau membre.
                  </div>
                )}

                {/* Historique complet : les invitations acceptées restent listées,
                    avec leur date d'acceptation, pour suivre combien ont été
                    envoyées, qui les a acceptées et quand. */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-bold text-slate-800">Invitations envoyées ({invitations.length})</h3>
                    <div className="flex items-center gap-2 text-xs font-bold">
                      <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                        {invitations.filter(i => i.status === 'accepted').length} acceptée(s)
                      </span>
                      <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                        {invitations.filter(i => i.status !== 'accepted').length} en attente
                      </span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-xs font-bold text-slate-400 uppercase border-b border-slate-100">
                          <th className="py-3 px-6">Email</th>
                          <th className="py-3 px-6">Date d'envoi</th>
                          <th className="py-3 px-6">Statut</th>
                          <th className="py-3 px-6 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm">
                        {invitations.map(invite => {
                          const acceptee = invite.status === 'accepted';
                          return (
                            <tr key={invite.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                              <td className="py-4 px-6 font-medium text-slate-800">{invite.email}</td>
                              <td className="py-4 px-6 text-slate-500">{new Date(invite.created_at).toLocaleDateString('fr-FR')}</td>
                              <td className="py-4 px-6">
                                {acceptee ? (
                                  <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700 border border-emerald-200">
                                    {invite.accepted_at
                                      ? `Acceptée le ${new Date(invite.accepted_at).toLocaleDateString('fr-FR')}`
                                      : 'Acceptée'}
                                  </span>
                                ) : (
                                  <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-700 border border-amber-200">
                                    En attente
                                  </span>
                                )}
                              </td>
                              <td className="py-4 px-6 text-right">
                                {/* Plus d'action sur une invitation acceptée : le
                                    membre est déjà dans l'organisation. */}
                                {!acceptee && (
                                  <div className="flex justify-end gap-2">
                                    <button
                                      onClick={() => handleCopyLink(invite.id)}
                                      className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                      title="Copier le lien d'inscription"
                                    >
                                      {copiedId === invite.id ? <CheckCircle2 className="w-4 h-4 text-succes-600" /> : <Copy className="w-4 h-4" />}
                                    </button>
                                    {userRole !== 'member_orga' && (
                                      <button
                                        onClick={() => handleDeleteInvitation(invite.id)}
                                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                        title="Supprimer l'invitation"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {invitations.length === 0 && (
                          <tr>
                            <td colSpan={4} className="py-12 text-center text-slate-400 italic">
                              Aucune invitation envoyée pour le moment.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'tools' && (
              <div className="max-w-4xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <a 
                    href="https://piloterra-academy.lovable.app/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="group bg-white p-8 rounded-2xl border border-slate-200 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all flex flex-col items-center text-center"
                  >
                    <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Award className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-2">PiloTerra Academy</h3>
                    <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                      Accédez à nos formations exclusives, tutoriels et ressources pédagogiques pour maîtriser l'IA dans votre métier.
                    </p>
                    <div className="mt-auto flex items-center gap-2 text-emerald-600 font-bold text-sm">
                      Ouvrir l'Academy <ExternalLink className="w-4 h-4" />
                    </div>
                  </a>

                 <div onClick={() => setActiveTab('charte')}
  className="bg-white p-8 rounded-2xl border border-emerald-100 flex flex-col cursor-pointer hover:border-emerald-400 hover:shadow-md transition-all group"
>
  <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-4 group-hover:bg-emerald-100 transition-colors">
    <ScrollText className="w-6 h-6" />
  </div>
  <h3 className="text-lg font-bold text-slate-800 mb-2">Charte IA</h3>
  <p className="text-slate-500 text-sm mb-4">
    Générez automatiquement la charte d'utilisation de l'IA de votre organisation, alignée avec vos défis.
  </p>
  <div className="mt-auto flex items-center gap-2 text-emerald-600 font-bold text-sm">
    Générer ma charte <ArrowRight className="w-4 h-4" />
  </div>
</div>
                </div>
              </div>
            )}
           {activeTab === 'charte' && (
              <CharteIA
                session={session}
                onNavigate={onNavigate}
                onBack={() => setActiveTab('members')}
              />
            )}
            {activeTab === 'matrice' && (
              matriceDefis.length === 0 ? (
                <div className="py-16 text-center">
                  <LayoutGrid className="w-10 h-10 mx-auto mb-4 text-slate-300" />
                  <p className="text-slate-500 font-medium">Aucune fiche défi à positionner pour le moment.</p>
                  <p className="text-sm text-slate-400 mt-1">
                    La matrice se remplit dès qu'un membre de l'organisation crée sa première fiche défi.
                  </p>
                </div>
              ) : (
                <>
                  {/* Le prompt qui calcule les positions, montré tel quel */}
                  <div className="flex justify-end mb-3">
                    <button
                      onClick={() => setPromptMatriceOuvert(true)}
                      className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 border border-slate-200 rounded-lg px-3 py-2 bg-white hover:border-emerald-300 hover:text-emerald-700 transition-colors"
                      title="Voir les consignes données à l'IA pour placer les fiches"
                    >
                      <HelpCircle className="w-4 h-4" />
                      Prompt d'analyse
                    </button>
                  </div>
                  {matriceDefisFiltres.length === 0 && (
                    <p className="text-center text-slate-400 py-6 italic">Aucune fiche ne correspond à la recherche ou au membre choisi.</p>
                  )}
                  <MatriceIAView
                    defis={matriceDefisFiltres}
                    onSelectDefi={(d) => setSelectedDefi(d)}
                    onUpdateDefiCollective={handleUpdateDefiCollective}
                    organisations={[]}
                    getUserDetails={getMatriceUserDetails}
                    canEditCollective={canEditMatrice}
                    hideOrgFilter
                    lockToCollective={!canEditMatrice}
                  />
                </>
              )
            )}
            {activeTab === 'cas_usage' && (
              <CasUsageIA
                session={session}
                initialViewId={selectedCasUsageId || undefined}
                userRole={userRole}
                filterUserId={selectedMemberId}
                filterDiagnosticIds={idsDefisFiltres}
              />
            )}
            {activeTab === 'sessions' && userRole === 'super_admin' && (
              <GestionSessions session={session} adminSelectedOrgId={adminSelectedOrgId} />
            )}
          </div>
        </div>
      </div>

      <PromptMatriceModal
        ouvert={promptMatriceOuvert}
        onFermer={() => setPromptMatriceOuvert(false)}
      />

      <ExportDefisModal
        ouvert={exportOuvert}
        onFermer={() => setExportOuvert(false)}
        fiches={defisFiltres}
        nomOrganisation={orgName}
        nomAuteur={(userId) => (userId ? getMemberName(userId) : '')}
      />

      {/* MODALE DETAIL DEFI */}
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
                        <p className="text-emerald-200 text-sm">Défi soumis par <span className="font-bold text-white">{getMemberName(selectedDefi.user_id)}</span> le {new Date(selectedDefi.created_at).toLocaleDateString()}</p>
                        
                        <div className="flex flex-wrap gap-2 mt-4">
                            {selectedDefi.motsCles ? (
                                selectedDefi.motsCles.split(',').map((tag, idx) => (<span key={idx} className="flex items-center gap-1 px-2.5 py-1 bg-white/10 rounded-full text-xs font-medium border border-white/20"><Tag className="w-3 h-3" /> {tag.trim()}</span>))
                            ) : (<span className="text-white/60 text-xs italic">Mots clés en cours...</span>)}
                        </div>
                    </div>
                    <button onClick={() => { setSelectedDefi(null); setIsEditingTitle(false); }} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X className="w-5 h-5" /></button>
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

                {/* 3. MATRICE PILOTERRA */}
                {selectedDefi.quadrant && (
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-8">
                        <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800 mb-6 pb-4 border-b border-slate-100">
                            <BarChart2 className="w-5 h-5 text-purple-600" /> Analyse Stratégique PiloTerra
                            <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-extrabold uppercase">IA Initial</span>
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

                {/* 3.2 ANALYSE STRATÉGIQUE COLLECTIVE */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-indigo-100 mb-8">
                    <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800 mb-6 pb-4 border-b border-slate-100">
                        <Users className="w-5 h-5 text-indigo-600" /> Analyse Stratégique Collective
                        <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full font-extrabold uppercase">
                            Consensus Organisation
                        </span>
                    </h3>
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
                </div>

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
