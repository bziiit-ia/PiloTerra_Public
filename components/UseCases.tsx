import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, ChevronDown, Lightbulb, Zap, Briefcase, MapPin, BarChart3, X, Filter, Check, Heart, Lock } from 'lucide-react';
import { Page, UseCase } from '../types';
import { useMarche } from './MarcheContext';
import { TAG_LABELS, getTagLabel } from '../constants';
import { sendEvent } from '../analytics';

interface UseCasesProps {
  session?: any;
  onNavigate: (page: Page) => void;
  favorites?: string[];
  onToggleFavorite?: (id: string) => void;
  useCases?: UseCase[];
}

export const UseCases: React.FC<UseCasesProps> = ({ session, onNavigate, favorites = [], onToggleFavorite, useCases = [] }) => {
  // Mot du marché affiché (« l'agriculture »…), null en vitrine
  const { motMarche } = useMarche();
  const [activeFilters, setActiveFilters] = useState<{
    ia: string[],
    outilsMetiers: string[],
    metiers: string[],
    process: string[]
  }>({
    ia: [],
    outilsMetiers: [],
    metiers: [],
    process: []
  });

  // TRACKING VIEW
  useEffect(() => {
    sendEvent('view_component', 'Navigation', 'UseCases');
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Extraction dynamique des filtres disponibles
  const filterOptions = useMemo(() => {
    const options = {
        metiers: new Set<string>(),
        ia: new Set<string>(),
        outilsMetiers: new Set<string>(),
        process: new Set<string>()
    };

    useCases.forEach(uc => {
        uc.tagsMetiers.forEach(t => options.metiers.add(t));
        uc.tagsOutilsIA.forEach(t => options.ia.add(t));
        uc.tagsOutilsMetiers.forEach(t => options.outilsMetiers.add(t));
        uc.tagsProcess.forEach(t => options.process.add(t));
    });

    return {
        metiers: Array.from(options.metiers).sort(),
        ia: Array.from(options.ia).sort(),
        outilsMetiers: Array.from(options.outilsMetiers).sort(),
        process: Array.from(options.process).sort()
    };
  }, [useCases]);

  const FILTER_CONFIG = {
    metiers: { label: "Métiers", icon: Briefcase, color: "blue", options: filterOptions.metiers },
    ia: { label: "Outils IA", icon: Zap, color: "emerald", options: filterOptions.ia },
    outilsMetiers: { label: "Outils Métiers", icon: MapPin, color: "orange", options: filterOptions.outilsMetiers },
    process: { label: "Processus", icon: BarChart3, color: "teal", options: filterOptions.process }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleFilter = (category: keyof typeof activeFilters, tag: string) => {
    setActiveFilters(prev => {
      const current = prev[category];
      if (current.includes(tag)) {
        return { ...prev, [category]: current.filter(t => t !== tag) };
      } else {
        sendEvent('filter_usecase', 'UseCases', `${String(category)}:${tag}`);
        return { ...prev, [category]: [...current, tag] };
      }
    });
  };

  const resetFilters = () => {
    sendEvent('reset_filters', 'UseCases', 'All');
    setActiveFilters({ ia: [], outilsMetiers: [], metiers: [], process: [] });
    setSearchQuery('');
  };

  const filteredUseCases = useMemo(() => {
    return useCases.filter(uc => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = 
        uc.title.toLowerCase().includes(searchLower) || 
        uc.description.toLowerCase().includes(searchLower) ||
        // Tags
        uc.tagsOutilsIA.some(t => t.toLowerCase().includes(searchLower)) ||
        uc.tagsMetiers.some(t => t.toLowerCase().includes(searchLower)) ||
        uc.tagsOutilsMetiers.some(t => t.toLowerCase().includes(searchLower)) ||
        uc.tagsProcess.some(t => t.toLowerCase().includes(searchLower));
      
      const matchesIA = activeFilters.ia.length === 0 || uc.tagsOutilsIA.some(t => activeFilters.ia.includes(t));
      const matchesOM = activeFilters.outilsMetiers.length === 0 || uc.tagsOutilsMetiers.some(t => activeFilters.outilsMetiers.includes(t));
      const matchesMetier = activeFilters.metiers.length === 0 || uc.tagsMetiers.some(t => activeFilters.metiers.includes(t));
      const matchesProcess = activeFilters.process.length === 0 || uc.tagsProcess.some(t => activeFilters.process.includes(t));

      return matchesSearch && matchesIA && matchesOM && matchesMetier && matchesProcess;
    });
  }, [searchQuery, activeFilters, useCases]);

  const activeFiltersList = (Object.entries(activeFilters) as [keyof typeof activeFilters, string[]][]).flatMap(([cat, tags]) => 
    tags.map(tag => ({ cat, tag }))
  );

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      
      {/* Hero Banner */}
      <div className="bg-emerald-900 pt-16 pb-32 px-4 relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d="M0 100 C 20 0 50 0 100 100 Z" fill="white" />
            </svg>
          </div>
          <div className="max-w-4xl mx-auto text-center relative z-10">
            <h1 className="text-4xl md:text-5xl font-black text-white mb-6">Bibliothèque de Cas d'Usage</h1>
            <p className="text-emerald-100 mb-8 max-w-xl mx-auto opacity-90 text-lg">Découvrez comment l'IA transforme concrètement {motMarche ?? 'vos métiers'} à travers des projets réels.</p>
            <div className="relative group max-w-2xl mx-auto">
                <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                <Search className="h-6 w-6 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                </div>
                <input
                type="text"
                className="block w-full pl-14 pr-6 py-5 bg-white rounded-2xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-emerald-500/30 shadow-2xl transition-all text-lg"
                placeholder="Rechercher par titre, description, technologie..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
          </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 -mt-16 pb-20 relative z-20 w-full">
        {/* Horizontal Filter Bar */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8" ref={dropdownRef}>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm mr-2">
              <Filter className="w-4 h-4 text-emerald-600" />
              Filtrer par :
            </div>
            
            {(Object.entries(FILTER_CONFIG) as [keyof typeof activeFilters, any][]).map(([key, config]) => (
              <div key={key} className="relative">
                <button
                  onClick={() => setOpenDropdown(openDropdown === key ? null : key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                    activeFilters[key].length > 0 
                      ? 'bg-slate-900 border-slate-900 text-white' 
                      : 'bg-white border-slate-200 text-slate-700 hover:border-emerald-500'
                  }`}
                >
                  <config.icon className={`w-4 h-4 ${activeFilters[key].length > 0 ? 'text-emerald-400' : 'text-slate-400'}`} />
                  {config.label}
                  {activeFilters[key].length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 bg-emerald-500 text-white text-[10px] rounded-full">
                      {activeFilters[key].length}
                    </span>
                  )}
                  <ChevronDown className={`w-4 h-4 transition-transform ${openDropdown === key ? 'rotate-180' : ''}`} />
                </button>

                {openDropdown === key && (
                  <div className="absolute left-0 mt-2 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-2 max-h-80 overflow-y-auto">
                      {config.options.map((opt: string) => (
                        <button
                          key={opt}
                          onClick={() => toggleFilter(key, opt)}
                          className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm text-left hover:bg-slate-50 transition-colors group"
                        >
                          <span className={activeFilters[key].includes(opt) ? 'text-emerald-700 font-bold' : 'text-slate-600'}>
                            {getTagLabel(opt)}
                          </span>
                          {activeFilters[key].includes(opt) && <Check className="w-4 h-4 text-emerald-600" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {activeFiltersList.length > 0 && (
              <button 
                onClick={resetFilters}
                className="text-xs font-bold text-emerald-600 hover:text-emerald-700 underline underline-offset-4 decoration-emerald-200 transition-all ml-auto"
              >
                Réinitialiser
              </button>
            )}
          </div>

          {/* Active Filter Tags */}
          {activeFiltersList.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-6 p-3 bg-slate-50 rounded-xl border border-slate-100">
              {activeFiltersList.map(({ cat, tag }) => (
                <button
                  key={`${String(cat)}-${tag}`}
                  onClick={() => toggleFilter(cat, tag)}
                  className="flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-medium hover:bg-red-50 hover:text-red-700 hover:border-red-100 transition-all group shadow-sm"
                >
                  {getTagLabel(tag)}
                  <X className="w-3.5 h-3.5 text-slate-400 group-hover:text-red-500" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Main Content: Projects Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredUseCases.length > 0 ? (
            filteredUseCases.map((uc, index) => {
              const isFavorite = favorites.includes(uc.id);
              const isRestricted = !session && index >= 3;

              return (
                <div 
                  key={uc.id} 
                  className={`group bg-white p-6 rounded-2xl border border-slate-100 shadow-sm transition-all flex flex-col h-full relative overflow-hidden ${isRestricted ? 'cursor-not-allowed select-none' : 'hover:shadow-xl hover:-translate-y-1'}`}
                  onClick={() => { if(isRestricted) onNavigate('dashboard'); }}
                >
                  {/* Content with conditional blur */}
                  <div className={`flex flex-col h-full ${isRestricted ? 'blur-[5px] grayscale opacity-40' : ''}`}>
                    {/* Heart Button */}
                    {session && onToggleFavorite && (
                      <button
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          onToggleFavorite(uc.id);
                          sendEvent(isFavorite ? 'remove_favorite' : 'add_favorite', 'UseCases', uc.title);
                        }}
                        className={`absolute top-4 right-4 p-2 rounded-full transition-all ${
                          isFavorite 
                            ? 'text-red-500 bg-red-50' 
                            : 'text-slate-300 hover:text-red-400 hover:bg-slate-50'
                        }`}
                      >
                        <Heart className={`w-5 h-5 ${isFavorite ? 'fill-current' : ''}`} />
                      </button>
                    )}

                    <div className="flex flex-wrap gap-1.5 mb-4 pr-10">
                      {uc.tagsMetiers.slice(0,3).map(m => (
                        <span key={m} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[9px] font-bold uppercase tracking-wider rounded border border-blue-100">
                          {getTagLabel(m)}
                        </span>
                      ))}
                    </div>
                    
                    <h3 className="text-lg font-bold text-slate-900 mb-3 group-hover:text-emerald-600 transition-colors leading-tight">
                      {uc.title}
                    </h3>
                    <p className="text-slate-600 text-sm mb-6 flex-grow line-clamp-3 leading-relaxed">
                      {uc.description}
                    </p>
                    
                    <div className="space-y-3 pt-4 border-t border-slate-50 mt-auto">
                      <div className="flex flex-wrap gap-1.5">
                        {uc.tagsOutilsIA.slice(0, 3).map(t => (
                          <span key={t} className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 font-bold rounded border border-emerald-100">
                             <Zap className="w-2.5 h-2.5" /> {getTagLabel(t)}
                          </span>
                        ))}
                        {uc.tagsOutilsMetiers.slice(0, 3).map(t => (
                          <span key={t} className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 bg-orange-50 text-orange-700 font-bold rounded border border-orange-100">
                             <MapPin className="w-2.5 h-2.5" /> {getTagLabel(t)}
                          </span>
                        ))}
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
                        Connectez-vous pour découvrir plus de 30 cas d'usage concrets et détaillés.
                      </p>
                      <button 
                        onClick={(e) => { e.stopPropagation(); onNavigate('dashboard'); }}
                        className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20"
                      >
                        S'identifier
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="col-span-full py-20 bg-slate-50 rounded-3xl border border-dashed border-slate-200 text-center">
               <Search className="w-12 h-12 text-slate-300 mx-auto mb-4" />
               <h3 className="text-xl font-bold text-slate-900 mb-2">Aucun cas d'usage trouvé</h3>
               <p className="text-slate-500 text-sm">Essayez de modifier vos filtres ou votre recherche.</p>
               <button onClick={resetFilters} className="mt-6 text-emerald-600 font-bold hover:underline">
                  Voir tout le catalogue
               </button>
            </div>
          )}
        </div>

        {/* Footer methodology / info */}
        <div className="mt-16 grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-8 rounded-[2rem] text-white shadow-xl relative overflow-hidden">
               <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
               <div className="relative z-10">
                 <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center mb-4 border border-emerald-500/30">
                    <Lightbulb className="w-6 h-6 text-emerald-400" />
                 </div>
                 <h3 className="text-2xl font-bold mb-3">En manque d'idées ?</h3>
                 <p className="text-slate-300 leading-relaxed mb-6">
                    Parcourez les modèles de projets validés par PiloTerra pour démarrer rapidement et efficacement votre transition numérique.
                 </p>
                 <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                   <Check className="w-4 h-4" />
                   Plus de 50 modèles disponibles en interne
                 </div>
               </div>
            </div>

            <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
               <h3 className="font-bold text-slate-800 mb-6 uppercase tracking-tighter text-sm flex items-center gap-2">
                 <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                 Méthodologie d'accompagnement IA
               </h3>
               <div className="grid grid-cols-2 gap-4">
                  {[
                    { step: "01", title: "Cadrage du besoin", status: "terminé" },
                    { step: "02", title: "Test de faisabilité", status: "en cours" },
                    { step: "03", title: "Déploiement Pilote", status: "à venir" },
                    { step: "04", title: "Passage à l'échelle", status: "à venir" }
                  ].map((s, idx) => (
                    <div key={idx} className={`p-4 rounded-2xl border ${idx === 1 ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                      <span className="block text-[10px] font-bold text-slate-400 mb-1">{s.step}</span>
                      <span className={`text-xs font-bold ${idx === 1 ? 'text-emerald-700' : 'text-slate-600'}`}>
                        {s.title}
                      </span>
                    </div>
                  ))}
               </div>
            </div>
        </div>
      </div>
    </div>
  );
};