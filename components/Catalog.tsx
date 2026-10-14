import React, { useState, useMemo, useEffect } from 'react';
import { Search, Filter, PlayCircle, GraduationCap, ChevronDown, ChevronUp, X, Globe, Zap, ShieldCheck, SlidersHorizontal, Layers } from 'lucide-react';
import { ToolCard } from './ToolCard';
import { Page, Tool } from '../types';
import { useMarche } from './MarcheContext';
import { TAG_LABELS, getTagLabel } from '../constants';
import { sendEvent } from '../analytics';

interface CatalogProps {
    onNavigate: (page: Page) => void;
    session?: any;
    tools: Tool[]; // Outils passés dynamiquement
    favorites?: string[];
    onToggleFavorite?: (id: string) => void;
}

type FilterState = {
  ia: string[];
  licence: string[];
  pays: string[];
  category: string[];
};

export const Catalog: React.FC<CatalogProps> = ({ onNavigate, session, tools = [], favorites = [], onToggleFavorite }) => {
  // Mot du marché affiché (« l'agriculture »…), null en vitrine
  const { motMarche } = useMarche();
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    ia: [],
    licence: [],
    pays: [],
    category: []
  });

  // TRACKING VIEW
  useEffect(() => {
    sendEvent('view_component', 'Navigation', 'Catalog');
  }, []);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    ia: true,
    licence: true,
    pays: true,
    category: true
  });

  // Extraction dynamique des filtres basés sur les données existantes
  const availableFilters = useMemo(() => {
    const ia = new Set<string>();
    const licence = new Set<string>();
    const pays = new Set<string>();
    const category = new Set<string>();

    tools.forEach(tool => {
        if(tool.tagsOutilsIA) tool.tagsOutilsIA.forEach(t => ia.add(t));
        if(tool.licence) licence.add(tool.licence);
        if(tool.paysEditeur) pays.add(tool.paysEditeur);
        if(tool.category) category.add(tool.category);
    });

    return {
        ia: Array.from(ia).sort(),
        licence: Array.from(licence).sort(),
        pays: Array.from(pays).sort(),
        category: Array.from(category).sort()
    };
  }, [tools]);

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleFilter = (category: keyof FilterState, value: string) => {
    setFilters(prev => {
      const current = prev[category] as string[];
      let newValues;
      if (current.includes(value)) {
        newValues = current.filter(v => v !== value);
      } else {
        newValues = [...current, value];
        // TRACKING FILTER ADD
        sendEvent('filter_tool', 'Catalog', `${category}:${value}`);
      }
      return { ...prev, [category]: newValues };
    });
  };

  const resetFilters = () => {
    sendEvent('reset_filters', 'Catalog', 'All');
    setFilters({
      ia: [],
      licence: [],
      pays: [],
      category: []
    });
    setSearchQuery('');
  };

  const filteredTools: Tool[] = useMemo(() => {
    return tools.filter((tool: Tool) => {
      if (tool.id === 'defi-iagriboost') return false;
      
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = 
        tool.name.toLowerCase().includes(searchLower) || 
        tool.description.toLowerCase().includes(searchLower) ||
        (tool.tagsOutilsIA || []).some(t => t.toLowerCase().includes(searchLower)) ||
        (tool.tagsOutilsMetiers || []).some(t => t.toLowerCase().includes(searchLower)) ||
        (tool.metiers || []).some(t => t.toLowerCase().includes(searchLower)) ||
        (tool.process || []).some(t => t.toLowerCase().includes(searchLower));
      
      const matchesIA = filters.ia.length === 0 || (tool.tagsOutilsIA || []).some(t => filters.ia.includes(t));
      const matchesLicence = filters.licence.length === 0 || (tool.licence && filters.licence.includes(tool.licence));
      const matchesPays = filters.pays.length === 0 || (tool.paysEditeur && filters.pays.includes(tool.paysEditeur));
      const matchesCategory = filters.category.length === 0 || (tool.category && filters.category.includes(tool.category));

      return matchesSearch && matchesIA && matchesLicence && matchesPays && matchesCategory;
    });
  }, [searchQuery, filters, tools]);

  const activeFiltersCount: number = useMemo(() => {
    let count = 0;
    (Object.entries(filters) as [keyof FilterState, string[]][]).forEach(([_, value]) => {
      count += value.length;
    });
    return count;
  }, [filters]);

  const FilterSection = ({ title, icon: Icon, section, values }: { title: string, icon: any, section: string, values: string[] }) => {
    const isOpen = openSections[section];
    
    return (
      <div className="border-b border-slate-100 last:border-0">
        <button 
          onClick={() => toggleSection(section)}
          className="w-full flex items-center justify-between py-4 text-left group"
        >
          <div className="flex items-center gap-2 text-slate-800 font-bold text-sm uppercase tracking-tight">
            <Icon className="w-4 h-4 text-emerald-500" />
            {title}
          </div>
          {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {isOpen && (
          <div className="pb-4 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
            {values.map(val => (
              <label key={val} className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 p-1.5 rounded-lg transition-colors group">
                <input 
                  type="checkbox"
                  checked={(filters[section as keyof FilterState] as string[]).includes(val)}
                  onChange={() => toggleFilter(section as keyof FilterState, val)}
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className={`text-xs ${
                  (filters[section as keyof FilterState] as string[]).includes(val) ? 'text-emerald-700 font-bold' : 'text-slate-600'
                }`}>
                  {section === 'ia' ? getTagLabel(val) : val}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* Header Search Section */}
      <div className="bg-emerald-900 pt-16 pb-32 px-4 relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d="M0 100 C 20 0 50 0 100 100 Z" fill="white" />
            </svg>
          </div>
          <div className="max-w-4xl mx-auto text-center relative z-10">
            <h1 className="text-4xl md:text-5xl font-black text-white mb-6">Catalogue des Outils</h1>
            <p className="text-emerald-100 mb-8 max-w-xl mx-auto opacity-90 text-lg">Découvrez le sourcing complet d'outils d'intelligence artificielle pour {motMarche ?? 'vos métiers'}.</p>
            <div className="relative group max-w-2xl mx-auto">
                <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                <Search className="h-6 w-6 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                </div>
                <input
                type="text"
                className="block w-full pl-14 pr-6 py-5 bg-white rounded-2xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-emerald-500/30 shadow-2xl transition-all text-lg"
                placeholder="Rechercher un outil..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
          </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 -mt-16 pb-20 relative z-20 w-full">
        {/* Toolbar with Filter Toggle */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
           <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex-grow flex items-center justify-between">
              <div className="text-slate-600 text-sm font-medium">
                 Affichage de <span className="text-slate-900 font-bold">{filteredTools.length}</span> outil{filteredTools.length > 1 ? 's' : ''}
              </div>
              
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all border ${
                    showFilters 
                      ? 'bg-slate-900 border-slate-900 text-white shadow-md' 
                      : 'bg-white border-slate-200 text-slate-700 hover:border-emerald-500 hover:text-emerald-600'
                  }`}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  {showFilters ? 'Masquer les filtres' : 'Afficher les filtres'}
                  {activeFiltersCount > 0 && !showFilters && (
                    <span className="ml-1 px-2 py-0.5 bg-emerald-500 text-white text-[10px] rounded-full">
                      {activeFiltersCount}
                    </span>
                  )}
                </button>
              </div>
           </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* SIDEBAR FILTERS - COLLAPSIBLE */}
          {showFilters && (
            <aside className="w-full lg:w-72 shrink-0 animate-in fade-in slide-in-from-left-4 duration-300">
              <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-6 sticky top-24 max-h-[calc(100vh-120px)] overflow-y-auto">
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                   <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                     <Filter className="w-5 h-5 text-emerald-600" />
                     Filtres
                   </h2>
                   {activeFiltersCount > 0 && (
                     <button 
                      onClick={resetFilters}
                      className="text-[10px] font-bold text-emerald-600 uppercase hover:underline"
                     >
                       Réinitialiser ({activeFiltersCount})
                     </button>
                   )}
                </div>

                <div className="space-y-2">
                  <FilterSection title="Catégorie" icon={Layers} section="category" values={availableFilters.category} />
                  <FilterSection title="Type d'IA" icon={Zap} section="ia" values={availableFilters.ia} />
                  <FilterSection title="Licence" icon={ShieldCheck} section="licence" values={availableFilters.licence} />
                  <FilterSection title="Pays Editeur" icon={Globe} section="pays" values={availableFilters.pays} />
                </div>
              </div>
            </aside>
          )}

          {/* MAIN CATALOG CONTENT */}
          <div className="flex-grow">
            {/* ACTIVE FILTERS TAGS */}
            {activeFiltersCount > 0 && (
              <div className="flex flex-wrap gap-2 mb-6 p-3 bg-white/50 rounded-xl border border-slate-200 shadow-inner">
                {Object.entries(filters).map(([cat, values]) => {
                  if (Array.isArray(values)) return values.map(v => (
                    <span key={v} className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-bold border border-emerald-100 shadow-sm">
                      {cat === 'ia' ? getTagLabel(v) : v}
                      <button onClick={() => toggleFilter(cat as keyof FilterState, v)} className="hover:text-red-500 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ));
                  return null;
                })}
                <button onClick={resetFilters} className="text-[10px] font-bold text-slate-400 hover:text-red-500 uppercase px-2 ml-auto">Tout effacer</button>
              </div>
            )}

            {/* TOOLS GRID */}
            {filteredTools.length > 0 ? (
              <div className={`grid grid-cols-1 md:grid-cols-2 ${showFilters ? 'xl:grid-cols-3' : 'lg:grid-cols-3 xl:grid-cols-4'} gap-6 transition-all duration-300`}>
                {filteredTools.map((tool) => (
                  <ToolCard 
                    key={tool.id} 
                    tool={tool} 
                    isLoggedIn={!!session} 
                    onNavigateToAuth={() => onNavigate('dashboard')} 
                    isFavorite={favorites.includes(tool.id)}
                    onToggleFavorite={onToggleFavorite}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-32 bg-white rounded-3xl border border-dashed border-slate-300 shadow-sm">
                <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Search className="w-10 h-10 text-slate-300" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Aucun outil ne correspond</h3>
                <p className="text-slate-500 max-w-xs mx-auto text-sm">Essayez de simplifier vos critères de recherche ou de réinitialiser les filtres.</p>
                <button 
                    onClick={resetFilters}
                    className="mt-8 px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all active:scale-95"
                >
                    Réinitialiser les filtres
                </button>
              </div>
            )}
            
            {/* FOOTER CALL TO ACTION */}
            <div className="mt-20">
              <section className="bg-gradient-to-br from-slate-900 to-emerald-900 rounded-[2.5rem] p-10 md:p-16 shadow-2xl relative overflow-hidden text-white">
                <div className="absolute top-0 right-0 -mt-20 -mr-20 w-96 h-96 bg-emerald-500 rounded-full opacity-10 blur-3xl"></div>
                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-12">
                  <div className="space-y-6 max-w-2xl">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 border border-emerald-500/30 rounded-full text-emerald-400 text-xs font-bold uppercase tracking-wider">
                      <GraduationCap className="w-4 h-4" />
                      Apprentissage continu
                    </div>
                    <h2 className="text-3xl md:text-4xl font-black">Apprenez à utiliser ces outils métier</h2>
                    <p className="text-emerald-100 text-lg opacity-80 leading-relaxed">
                      Notre académie propose des tutoriels vidéos pour chaque outil phare du catalogue. Maîtrisez l'IA pour transformer votre activité.
                    </p>
                    <button 
                      onClick={() => {
                        sendEvent('click_academy_cta', 'Engagement', 'Catalog Footer');
                        onNavigate('elearning');
                      }}
                      className="px-8 py-4 bg-white text-emerald-900 rounded-xl font-black text-lg transition-all shadow-xl hover:scale-105 active:scale-95 flex items-center gap-2"
                    >
                      <PlayCircle className="w-6 h-6" />
                      Accéder à l'Académie
                    </button>
                  </div>
                  
                  <div className="hidden lg:block shrink-0">
                    <div className="w-64 h-64 bg-white/5 backdrop-blur-md rounded-full border border-white/10 flex items-center justify-center p-8">
                       <Zap className="w-32 h-32 text-emerald-400 opacity-50" />
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};