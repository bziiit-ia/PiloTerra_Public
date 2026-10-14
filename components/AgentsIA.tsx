import React, { useState, useMemo, useEffect } from 'react';
import { Bot, Filter, Search, ExternalLink, ChevronDown, ChevronUp, SlidersHorizontal, Tag, Lock, Heart, Terminal, Cpu } from 'lucide-react';
import { Page, AgentIA } from '../types';
import { getTagLabel } from '../constants';
import { sendEvent } from '../analytics';
import { AgentDetailModal } from './AgentDetailModal';
import { pousserUrlFiche, retirerUrlFiche } from '../seoUrl';

interface AgentsIAProps {
  onNavigate: (page: Page) => void;
  agents: AgentIA[];
  session?: any;
  favorites?: string[];
  onToggleFavorite?: (id: string) => void;
  /** Slug de la fiche à ouvrir quand on arrive par une URL publique */
  slugInitial?: string | null;
  /** Appelé une fois la fiche ouverte, pour ne pas la rouvrir en boucle */
  onFicheOuverte?: () => void;
}

export const AgentsIA: React.FC<AgentsIAProps> = ({ onNavigate, agents = [], session, favorites = [], onToggleFavorite, slugInitial, onFicheOuverte }) => {
  const [showFilters, setShowFilters] = useState(false);
  const [selectedFrameworks, setSelectedFrameworks] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [agentOuvert, setAgentOuvert] = useState<AgentIA | null>(null);

  // Ouverture automatique quand on arrive par piloterra.fr/agents/mon-agent
  useEffect(() => {
    if (!slugInitial || agents.length === 0) return;
    const cible = agents.find(a => a.slug === slugInitial);
    if (cible) {
      setAgentOuvert(cible);
      sendEvent('view_agent_detail', 'AgentsIA', cible.name);
      onFicheOuverte?.();
    }
  }, [slugInitial, agents, onFicheOuverte]);

  const ouvrirFiche = (agent: AgentIA) => {
    setAgentOuvert(agent);
    if (agent.slug) pousserUrlFiche('agents', agent.slug);
    sendEvent('view_agent_detail', 'AgentsIA', agent.name);
  };

  const fermerFiche = () => {
    setAgentOuvert(null);
    retirerUrlFiche('agents-ia');
  };

  // Le bouton « retour » du navigateur referme la fiche
  useEffect(() => {
    const surRetour = () => setAgentOuvert(null);
    window.addEventListener('popstate', surRetour);
    return () => window.removeEventListener('popstate', surRetour);
  }, []);

  // Extract all unique frameworks and tags
  const allFrameworks = useMemo(() => {
    const fw = new Set<string>();
    agents.forEach(item => {
      item.frameworks.forEach(f => fw.add(f));
    });
    return Array.from(fw).sort();
  }, [agents]);

  const allTags = useMemo(() => {
    const tg = new Set<string>();
    agents.forEach(item => {
      item.tags.forEach(t => tg.add(t));
    });
    return Array.from(tg).sort();
  }, [agents]);

  const toggleFramework = (fw: string) => {
    if (selectedFrameworks.includes(fw)) {
      setSelectedFrameworks(selectedFrameworks.filter(t => t !== fw));
    } else {
      setSelectedFrameworks([...selectedFrameworks, fw]);
    }
  };

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const filteredAgents = useMemo(() => {
    return agents.filter(item => {
      const searchLower = searchQuery.toLowerCase();
      const matchSearch = 
        item.name.toLowerCase().includes(searchLower) || 
        item.description.toLowerCase().includes(searchLower) ||
        // Tags, Frameworks, Capabilities
        item.tags.some(t => t.toLowerCase().includes(searchLower)) ||
        item.frameworks.some(f => f.toLowerCase().includes(searchLower)) ||
        item.capabilities.some(c => c.toLowerCase().includes(searchLower));
      
      const matchFw = selectedFrameworks.length === 0 || selectedFrameworks.every(f => item.frameworks.includes(f));
      const matchTags = selectedTags.length === 0 || selectedTags.every(t => item.tags.includes(t));
      
      return matchSearch && matchFw && matchTags;
    });
  }, [agents, searchQuery, selectedFrameworks, selectedTags]);

  const resetFilters = () => {
    setSelectedFrameworks([]);
    setSelectedTags([]);
    setSearchQuery('');
  };

  const activeFiltersCount = selectedFrameworks.length + selectedTags.length;

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <section className="relative bg-emerald-900 overflow-hidden py-20 lg:py-28">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d="M0 100 C 20 0 50 0 100 100 Z" fill="white" />
          </svg>
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-emerald-100 text-sm font-bold mb-6 backdrop-blur-sm">
            <Terminal className="w-4 h-4 text-pilo-brown" />
            Open Source
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-6 tracking-tight">
            Agents IA <span className="text-emerald-400">Autonomes</span>
          </h1>
          <p className="max-w-2xl mx-auto text-xl text-emerald-100 leading-relaxed opacity-90">
            Explorez notre sélection d'agents intelligents open source prêts à être déployés pour automatiser vos tâches complexes.
          </p>
        </div>
      </section>

      <section className="py-12 bg-white flex-grow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          {/* Toolbar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
             <div className="flex items-center gap-3">
               <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                 <Bot className="w-6 h-6" />
               </div>
               <div>
                 <h2 className="text-2xl font-bold text-slate-900">Catalogue des Agents</h2>
                 <p className="text-sm text-slate-500">{filteredAgents.length} agent{filteredAgents.length > 1 ? 's' : ''} disponible{filteredAgents.length > 1 ? 's' : ''}</p>
               </div>
             </div>

             <div className="flex items-center gap-4">
                <div className="relative">
                   <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                   <input 
                      type="text" 
                      placeholder="Rechercher un agent..." 
                      className="pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full md:w-64"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                   />
                </div>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold transition-all border text-sm ${
                    showFilters 
                    ? 'bg-slate-900 border-slate-900 text-white shadow-lg' 
                    : 'bg-white border-slate-200 text-slate-700 hover:border-emerald-500 hover:text-emerald-600'
                  }`}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  Filtres
                  {activeFiltersCount > 0 && !showFilters && <span className="ml-1 bg-emerald-500 text-white text-[10px] px-2 py-0.5 rounded-full">{activeFiltersCount}</span>}
                  {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
             </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {showFilters && (
              <aside className="lg:col-span-1 animate-in fade-in slide-in-from-left-4 duration-300 space-y-6">
                
                {/* FILTRE TAGS METIERS */}
                {allTags.length > 0 && (
                    <div className="sticky top-28 bg-slate-50 p-6 rounded-2xl border border-slate-100 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                        <Tag className="w-4 h-4 text-emerald-600" /> Métiers / Usage
                        </div>
                        {selectedTags.length > 0 && <button onClick={() => setSelectedTags([])} className="text-[10px] font-bold text-emerald-600 hover:underline uppercase">Effacer</button>}
                    </div>
                    <div className="space-y-2">
                        {allTags.map(tag => (
                        <label key={tag} className="flex items-center gap-3 cursor-pointer hover:bg-white p-2 rounded-lg transition-colors group border border-transparent hover:border-slate-200">
                            <input 
                            type="checkbox"
                            checked={selectedTags.includes(tag)}
                            onChange={() => toggleTag(tag)}
                            className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className={`text-sm ${selectedTags.includes(tag) ? 'text-emerald-700 font-bold' : 'text-slate-600'}`}>
                            {getTagLabel(tag)}
                            </span>
                        </label>
                        ))}
                    </div>
                    </div>
                )}

                {/* FILTRE FRAMEWORKS */}
                {allFrameworks.length > 0 && (
                    <div className="sticky top-[calc(28px+200px)] bg-slate-50 p-6 rounded-2xl border border-slate-100 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                        <Filter className="w-4 h-4 text-emerald-600" /> Frameworks
                        </div>
                        {selectedFrameworks.length > 0 && <button onClick={() => setSelectedFrameworks([])} className="text-[10px] font-bold text-emerald-600 hover:underline uppercase">Effacer</button>}
                    </div>
                    <div className="space-y-2">
                        {allFrameworks.map(fw => (
                        <label key={fw} className="flex items-center gap-3 cursor-pointer hover:bg-white p-2 rounded-lg transition-colors group border border-transparent hover:border-slate-200">
                            <input 
                            type="checkbox"
                            checked={selectedFrameworks.includes(fw)}
                            onChange={() => toggleFramework(fw)}
                            className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className={`text-sm ${selectedFrameworks.includes(fw) ? 'text-emerald-700 font-bold' : 'text-slate-600'}`}>
                            {fw}
                            </span>
                        </label>
                        ))}
                    </div>
                    </div>
                )}
              </aside>
            )}

            <div className={showFilters ? "lg:col-span-3 transition-all duration-300" : "lg:col-span-4 transition-all duration-300"}>
              {filteredAgents.length > 0 ? (
                <div className={`grid grid-cols-1 ${showFilters ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3'} gap-6`}>
                   {filteredAgents.map((agent, index) => {
                     const isRestricted = !session && index >= 3;
                     const isFavorite = favorites.includes(agent.id);

                     // Construction de l'URL avec l'ID utilisateur si connecté
                     let targetUrl = agent.link;
                     if (session?.user?.id) {
                        const separator = targetUrl.includes('?') ? '&' : '?';
                        targetUrl = `${targetUrl}${separator}user_id=${session.user.id}`;
                     }

                     return (
                     <article 
                        key={agent.id} 
                        className={`group bg-white rounded-2xl border border-slate-200 overflow-hidden transition-all flex flex-col h-full shadow-sm relative ${isRestricted ? 'cursor-not-allowed select-none' : 'hover:shadow-xl hover:-translate-y-1'}`}
                        onClick={() => { if(isRestricted) onNavigate('dashboard'); }}
                     >
                        <div className={`flex flex-col h-full ${isRestricted ? 'blur-[5px] grayscale opacity-40' : ''}`}>
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
                                
                                {/* Bouton Favori */}
                                {session && onToggleFavorite && !isRestricted && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onToggleFavorite(agent.id);
                                            sendEvent('toggle_favorite', 'AgentsIA', agent.name);
                                        }}
                                        className={`absolute top-3 right-3 p-2 rounded-full backdrop-blur-md transition-all shadow-sm z-20 ${
                                            isFavorite 
                                            ? 'bg-red-500 text-white scale-110' 
                                            : 'bg-white/80 text-slate-400 hover:text-red-500 hover:bg-white'
                                        }`}
                                    >
                                        <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
                                    </button>
                                )}
                            </div>

                            <div className="p-6 flex flex-col flex-grow">
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {agent.tags.slice(0, 2).map(tag => (
                                        <span key={tag} className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100 uppercase tracking-wide">
                                            {getTagLabel(tag)}
                                        </span>
                                    ))}
                                    {agent.frameworks.slice(0, 1).map(fw => (
                                        <span key={fw} className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-100 uppercase tracking-wide">
                                            {fw}
                                        </span>
                                    ))}
                                </div>

                                <h3
                                    onClick={() => { if (!isRestricted) ouvrirFiche(agent); }}
                                    className="text-lg font-bold text-slate-900 mb-2 group-hover:text-emerald-600 transition-colors leading-tight cursor-pointer"
                                >
                                    {agent.name}
                                </h3>
                                <p className="text-slate-500 text-sm mb-4 line-clamp-3 leading-relaxed flex-grow">
                                    {agent.description}
                                </p>

                                {/* Tags additionnels */}
                                {(agent.tags.length > 2 || agent.capabilities.length > 0) && (
                                    <div className="flex flex-wrap gap-1 mb-4">
                                        {[...agent.tags.slice(2), ...agent.capabilities].slice(0, 3).map((cap, i) => (
                                            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-bold border border-slate-200">
                                                <Cpu className="w-2.5 h-2.5" /> {cap}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                <div className="mt-auto">
                                    <a 
                                        href={targetUrl} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        onClick={() => sendEvent('click_agent', 'AgentsIA', agent.name)}
                                        className="flex items-center justify-center gap-2 w-full py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all text-sm shadow-sm"
                                    >
                                        Accéder à l'agent IA <ExternalLink className="w-4 h-4" />
                                    </a>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); ouvrirFiche(agent); }}
                                        className="w-full py-2 mt-2 text-emerald-700 font-bold text-sm hover:underline"
                                    >
                                        En savoir plus
                                    </button>
                                </div>
                            </div>
                        </div>

                         {/* Restricted Access Overlay */}
                         {isRestricted && (
                            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 text-center bg-white/20 backdrop-blur-[2px]">
                                <div className="bg-slate-900 text-white p-3 rounded-full mb-4 shadow-xl">
                                    <Lock className="w-6 h-6" />
                                </div>
                                <h4 className="text-slate-900 font-black text-lg mb-2">Accès réservé</h4>
                                <p className="text-slate-700 text-xs font-medium mb-4">
                                    Connectez-vous pour découvrir l'ensemble des agents.
                                </p>
                                <button 
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        sendEvent('click_login', 'AgentsIA', 'Restricted Overlay');
                                        onNavigate('dashboard'); 
                                    }}
                                    className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20"
                                >
                                    S'identifier
                                </button>
                            </div>
                         )}
                     </article>
                   )})}
                </div>
              ) : (
                <div className="text-center py-20 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                   <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                      <Search className="w-8 h-8 text-slate-300" />
                   </div>
                   <h3 className="text-xl font-bold text-slate-900 mb-2">Aucun agent trouvé</h3>
                   <p className="text-slate-500 mb-6">Essayez de modifier vos filtres ou votre recherche.</p>
                   <button onClick={resetFilters} className="text-emerald-600 font-bold hover:underline">Réinitialiser les filtres</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <AgentDetailModal agent={agentOuvert} onClose={fermerFiche} session={session} />
    </div>
  );
};