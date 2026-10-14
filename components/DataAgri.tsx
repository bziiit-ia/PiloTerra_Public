import React, { useState, useMemo, useEffect } from 'react';
import { Database, Filter, Search, ExternalLink, ChevronDown, ChevronUp, SlidersHorizontal, Tag, Server, Lock, Heart } from 'lucide-react';
import { Page, DataAgriItem } from '../types';
import { getTagLabel } from '../constants';
import { sendEvent } from '../analytics';
import { DataDetailModal } from './DataDetailModal';
import { pousserUrlFiche, retirerUrlFiche } from '../seoUrl';

interface DataAgriProps {
  onNavigate: (page: Page) => void;
  dataItems: DataAgriItem[];
  session?: any;
  favorites?: string[];
  onToggleFavorite?: (id: string) => void;
  /** Slug de la fiche à ouvrir quand on arrive par une URL publique */
  slugInitial?: string | null;
  /** Appelé une fois la fiche ouverte, pour ne pas la rouvrir en boucle */
  onFicheOuverte?: () => void;
}

export const DataAgri: React.FC<DataAgriProps> = ({ onNavigate, dataItems = [], session, favorites = [], onToggleFavorite, slugInitial, onFicheOuverte }) => {
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [ficheOuverte, setFicheOuverte] = useState<DataAgriItem | null>(null);

  // Ouverture automatique quand on arrive par
  // piloterra.fr/sources-de-donnees/ma-source
  useEffect(() => {
    if (!slugInitial || dataItems.length === 0) return;
    const cible = dataItems.find(d => d.slug === slugInitial);
    if (cible) {
      setFicheOuverte(cible);
      sendEvent('view_data_detail', 'DataAgri', cible.title);
      onFicheOuverte?.();
    }
  }, [slugInitial, dataItems, onFicheOuverte]);

  const ouvrirFiche = (item: DataAgriItem) => {
    setFicheOuverte(item);
    if (item.slug) pousserUrlFiche('sources-de-donnees', item.slug);
    sendEvent('view_data_detail', 'DataAgri', item.title);
  };

  const fermerFiche = () => {
    setFicheOuverte(null);
    retirerUrlFiche('data-agri');
  };

  // Le bouton « retour » du navigateur referme la fiche
  useEffect(() => {
    const surRetour = () => setFicheOuverte(null);
    window.addEventListener('popstate', surRetour);
    return () => window.removeEventListener('popstate', surRetour);
  }, []);

  // Extract all unique tags dynamically from the data
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    dataItems.forEach(item => {
      item.tags.forEach(tag => tags.add(tag));
    });
    return Array.from(tags).sort();
  }, [dataItems]);

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const filteredData = useMemo(() => {
    return dataItems.filter(item => {
      const searchLower = searchQuery.toLowerCase();
      const matchSearch = 
        item.title.toLowerCase().includes(searchLower) || 
        item.description.toLowerCase().includes(searchLower) ||
        // Tags
        item.tags.some(t => t.toLowerCase().includes(searchLower));
      
      const matchTags = selectedTags.length === 0 || selectedTags.every(t => item.tags.includes(t));
      
      return matchSearch && matchTags;
    });
  }, [dataItems, searchQuery, selectedTags]);

  const resetFilters = () => {
    setSelectedTags([]);
    setSearchQuery('');
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <section className="relative bg-emerald-900 overflow-hidden py-20 lg:py-28">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d="M0 100 C 20 0 50 0 100 100 Z" fill="white" />
          </svg>
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-6 tracking-tight">
            Données <span className="text-emerald-400">ouvertes</span>
          </h1>
          <p className="max-w-2xl mx-auto text-xl text-emerald-100 leading-relaxed opacity-90">
            Accédez aux meilleures sources de données ouvertes et APIs pour nourrir vos projets d'intelligence artificielle.
          </p>
        </div>
      </section>

      <section className="py-12 bg-white flex-grow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          {/* Toolbar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
             <div className="flex items-center gap-3">
               <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
                 <Server className="w-6 h-6" />
               </div>
               <div>
                 <h2 className="text-2xl font-bold text-slate-900">Jeux de données & APIs</h2>
                 <p className="text-sm text-slate-500">{filteredData.length} ressource{filteredData.length > 1 ? 's' : ''} disponible{filteredData.length > 1 ? 's' : ''}</p>
               </div>
             </div>

             <div className="flex items-center gap-4">
                <div className="relative">
                   <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                   <input 
                      type="text" 
                      placeholder="Rechercher une data..." 
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
                  {selectedTags.length > 0 && !showFilters && <span className="ml-1 bg-emerald-500 text-white text-[10px] px-2 py-0.5 rounded-full">{selectedTags.length}</span>}
                  {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
             </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {showFilters && (
              <aside className="lg:col-span-1 animate-in fade-in slide-in-from-left-4 duration-300">
                <div className="sticky top-28 bg-slate-50 p-6 rounded-2xl border border-slate-100 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                      <Filter className="w-4 h-4 text-emerald-600" /> Types de données
                    </div>
                    {selectedTags.length > 0 && <button onClick={resetFilters} className="text-[10px] font-bold text-emerald-600 hover:underline uppercase">Effacer</button>}
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
              </aside>
            )}

            <div className={showFilters ? "lg:col-span-3 transition-all duration-300" : "lg:col-span-4 transition-all duration-300"}>
              {filteredData.length > 0 ? (
                <div className={`grid grid-cols-1 ${showFilters ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3'} gap-6`}>
                   {filteredData.map((item, index) => {
                     const isRestricted = !session && index >= 3;
                     const isFavorite = favorites.includes(item.id);

                     return (
                     <article 
                        key={item.id} 
                        className={`group bg-white rounded-2xl border border-slate-200 overflow-hidden transition-all flex flex-col h-full shadow-sm relative ${isRestricted ? 'cursor-not-allowed select-none' : 'hover:shadow-xl hover:-translate-y-1'}`}
                        onClick={() => { if(isRestricted) onNavigate('dashboard'); }}
                     >
                        <div className={`flex flex-col h-full ${isRestricted ? 'blur-[5px] grayscale opacity-40' : ''}`}>
                            <div className="h-40 bg-slate-100 relative overflow-hidden flex items-center justify-center p-4">
                            {item.imageUrl ? (
                                <img 
                                src={item.imageUrl} 
                                alt={item.title} 
                                className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-500"
                                onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80"; }} 
                                />
                            ) : (
                                <Database className="w-16 h-16 text-slate-300" />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                            
                            {/* Bouton Favori */}
                            {session && onToggleFavorite && !isRestricted && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onToggleFavorite(item.id);
                                        sendEvent('toggle_favorite', 'DataAgri', item.title);
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
                            <h3
                                onClick={() => { if (!isRestricted) ouvrirFiche(item); }}
                                className="text-lg font-bold text-slate-900 mb-2 group-hover:text-emerald-600 transition-colors leading-tight cursor-pointer"
                            >
                                {item.title}
                            </h3>
                            <p className="text-slate-500 text-sm mb-4 line-clamp-3 leading-relaxed flex-grow">
                                {item.description}
                            </p>

                            <div className="flex flex-wrap gap-2 mb-4">
                                {item.tags.slice(0, 3).map(tag => (
                                    <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold border border-slate-200 uppercase">
                                    <Tag className="w-2.5 h-2.5" /> {getTagLabel(tag)}
                                    </span>
                                ))}
                                {item.tags.length > 3 && (
                                    <span className="inline-flex items-center px-2 py-0.5 bg-slate-50 text-slate-400 rounded text-[10px] font-bold border border-slate-100">+{item.tags.length - 3}</span>
                                )}
                            </div>

                            <div className="mt-auto">
                                <a 
                                    href={item.sourceLink} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    onClick={() => sendEvent('click_data', 'DataAgri', item.title)}
                                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all text-sm shadow-sm"
                                >
                                    Accéder aux données <ExternalLink className="w-4 h-4" />
                                </a>
                                <button
                                    onClick={(e) => { e.stopPropagation(); ouvrirFiche(item); }}
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
                                    Connectez-vous pour découvrir l'ensemble des jeux de données et APIs.
                                </p>
                                <button 
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        sendEvent('click_login', 'DataAgri', 'Restricted Overlay');
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
                   <h3 className="text-xl font-bold text-slate-900 mb-2">Aucune donnée trouvée</h3>
                   <p className="text-slate-500 mb-6">Essayez de modifier vos filtres ou votre recherche.</p>
                   <button onClick={resetFilters} className="text-emerald-600 font-bold hover:underline">Réinitialiser les filtres</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <DataDetailModal item={ficheOuverte} onClose={fermerFiche} />
    </div>
  );
};