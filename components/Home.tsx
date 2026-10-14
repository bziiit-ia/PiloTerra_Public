
import React, { useState, useMemo, useEffect } from 'react';
import { Newspaper, Calendar, Filter, Search, Zap, Map, Clock, ExternalLink, Briefcase, ChevronDown, ChevronUp, SlidersHorizontal, Heart, ArrowRight, Sparkles } from 'lucide-react';
import { Page, NewsItem } from '../types';
import { useMarche } from './MarcheContext';
import { TAG_LABELS, getTagLabel } from '../constants';
import { sendEvent } from '../analytics';

interface HomeProps {
  onNavigate: (page: Page) => void;
  session?: any;
  news: NewsItem[]; 
  favorites?: string[];
  onToggleFavorite?: (id: string) => void;
}

export const Home: React.FC<HomeProps> = ({ onNavigate, session, news = [], favorites = [], onToggleFavorite }) => {
  // Mot du marché affiché (« l'agriculture »…), null en vitrine
  const { motMarche } = useMarche();
  const [showFilters, setShowFilters] = useState(false);
  
  // États des filtres basés sur les codes techniques
  const [selectedOutilsIA, setSelectedOutilsIA] = useState<string[]>([]);
  const [selectedMetiers, setSelectedMetiers] = useState<string[]>([]);
  const [selectedOutilsMetiers, setSelectedOutilsMetiers] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('Tous');

  // TRACKING VIEW
  useEffect(() => {
    sendEvent('view_component', 'Navigation', 'Home');
  }, []);

  // Extraction dynamique des tags disponibles dans les news affichées pour les options de filtre
  const availableTags = useMemo(() => {
    const ia = new Set<string>();
    const metiers = new Set<string>();
    const om = new Set<string>();

    news.forEach(item => {
        item.tagsOutilsIA.forEach(t => ia.add(t));
        item.tagsMetiers.forEach(t => metiers.add(t));
        item.tagsOutilsMetiers.forEach(t => om.add(t));
    });

    return {
        ia: Array.from(ia),
        metiers: Array.from(metiers),
        outilsMetiers: Array.from(om)
    };
  }, [news]);

  const dateOptions = useMemo(() => {
    const dates = news.map(item => {
      const d = new Date(item.date);
      return `${d.toLocaleString('fr-FR', { month: 'long' })} ${d.getFullYear()}`;
    });
    return ['Tous', ...Array.from(new Set(dates))].sort((a, b) => {
        if (a === 'Tous') return -1;
        if (b === 'Tous') return 1;
        // Tri grossier pour l'exemple, idéalement parser les dates
        return 0;
    });
  }, [news]);

  const toggleTag = (tag: string, current: string[], setter: (val: string[]) => void) => {
    if (current.includes(tag)) {
      setter(current.filter(t => t !== tag));
    } else {
      setter([...current, tag]);
      sendEvent('filter_news', 'Home', tag);
    }
  };

  const filteredNews = useMemo(() => {
    const result = news.filter(item => {
      const d = new Date(item.date);
      const itemDate = `${d.toLocaleString('fr-FR', { month: 'long' })} ${d.getFullYear()}`;
      
      // Filtrage exact sur les codes
      const outilsIAIn = selectedOutilsIA.length === 0 || selectedOutilsIA.some(t => item.tagsOutilsIA.includes(t));
      const metierIn = selectedMetiers.length === 0 || selectedMetiers.some(t => item.tagsMetiers.includes(t));
      const outilsMetiersIn = selectedOutilsMetiers.length === 0 || selectedOutilsMetiers.some(t => item.tagsOutilsMetiers.includes(t));
      const dateMatch = selectedDate === 'Tous' || itemDate === selectedDate;
      
      return outilsIAIn && metierIn && outilsMetiersIn && dateMatch;
    });

    // Tri par date décroissante
    return [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [selectedOutilsIA, selectedMetiers, selectedOutilsMetiers, selectedDate, news]);

  const resetFilters = () => {
    sendEvent('reset_filters', 'Home', 'All');
    setSelectedOutilsIA([]);
    setSelectedMetiers([]);
    setSelectedOutilsMetiers([]);
    setSelectedDate('Tous');
  };

  const activeFiltersCount = selectedOutilsIA.length + selectedMetiers.length + selectedOutilsMetiers.length + (selectedDate !== 'Tous' ? 1 : 0);

  return (
    <div className="flex flex-col overflow-hidden bg-white">
      
      {/* HERO SECTION ACTUALITE */}
      <section className="relative bg-emerald-900 py-20 lg:py-28 overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d="M0 100 C 20 0 50 0 100 100 Z" fill="white" />
          </svg>
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center z-10">
          <h1 className="text-4xl md:text-6xl font-black text-white mb-6 tracking-tight">
            L'Observatoire de l'<span className="text-emerald-400">IA{motMarche ? ` pour ${motMarche}` : ''}</span>
          </h1>
          <p className="max-w-3xl mx-auto text-xl text-emerald-100 leading-relaxed opacity-90 font-medium">
            Décryptage des tendances, veille technologique et innovations du secteur. 
            Restez informé des dernières avancées.
          </p>
        </div>
      </section>

      {/* SECTION ACTUALITES - LAYOUT BENTO */}
      <section className="py-20 bg-white relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <div>
              <h2 className="text-4xl font-black text-slate-900 mb-2">Les Dernières <span className="text-pilo-brown">Publications</span></h2>
              <p className="text-slate-500 text-lg">Veille technologique et sectorielle curée par nos experts.</p>
            </div>
            
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all border ${
                showFilters 
                ? 'bg-slate-900 border-slate-900 text-white shadow-lg' 
                : 'bg-white border-slate-200 text-slate-700 hover:border-pilo-green hover:text-pilo-green'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filtrer
              {activeFiltersCount > 0 && !showFilters && <span className="ml-1 bg-pilo-green text-white text-[10px] px-2 py-0.5 rounded-full">{activeFiltersCount}</span>}
            </button>
          </div>

          <div className="flex flex-col lg:flex-row gap-8">
            {/* SIDEBAR FILTRES */}
            {showFilters && (
              <aside className="lg:w-80 shrink-0 animate-in fade-in slide-in-from-left-4 duration-300">
                <div className="sticky top-32 space-y-6 bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">Filtres actifs</span>
                    {activeFiltersCount > 0 && <button onClick={resetFilters} className="text-xs font-bold text-pilo-brown hover:underline">Effacer</button>}
                  </div>
                  
                  {/* Filtre Métiers */}
                  {availableTags.metiers.length > 0 && (
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 block flex items-center gap-2"><Briefcase className="w-3 h-3" /> Métiers</label>
                        <div className="flex flex-wrap gap-2">
                           {availableTags.metiers.map(tag => (
                              <button key={tag} onClick={() => toggleTag(tag, selectedMetiers, setSelectedMetiers)} className={`text-[10px] px-3 py-1.5 rounded-lg border font-bold transition-all ${selectedMetiers.includes(tag) ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400'}`}>
                                {getTagLabel(tag)}
                              </button>
                           ))}
                        </div>
                    </div>
                  )}

                  {/* Filtre Outils IA */}
                  {availableTags.ia.length > 0 && (
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 block flex items-center gap-2"><Zap className="w-3 h-3" /> Outils IA</label>
                        <div className="flex flex-wrap gap-2">
                           {availableTags.ia.map(tag => (
                              <button key={tag} onClick={() => toggleTag(tag, selectedOutilsIA, setSelectedOutilsIA)} className={`text-[10px] px-3 py-1.5 rounded-lg border font-bold transition-all ${selectedOutilsIA.includes(tag) ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400'}`}>
                                {getTagLabel(tag)}
                              </button>
                           ))}
                        </div>
                    </div>
                  )}

                  {/* Filtre Outils Métiers */}
                  {availableTags.outilsMetiers.length > 0 && (
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 block flex items-center gap-2"><Map className="w-3 h-3" /> Outils Métiers</label>
                        <div className="flex flex-wrap gap-2">
                           {availableTags.outilsMetiers.map(tag => (
                              <button key={tag} onClick={() => toggleTag(tag, selectedOutilsMetiers, setSelectedOutilsMetiers)} className={`text-[10px] px-3 py-1.5 rounded-lg border font-bold transition-all ${selectedOutilsMetiers.includes(tag) ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400'}`}>
                                {getTagLabel(tag)}
                              </button>
                           ))}
                        </div>
                    </div>
                  )}

                </div>
              </aside>
            )}

            {/* BENTO GRID CONTENT */}
            <div className="flex-grow">
              {filteredNews.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[400px]">
                  {filteredNews.map((news, idx) => {
                    const isFavorite = favorites.includes(news.id);
                    // Feature layout: First item spans 2 cols if not filtered heavily
                    const isFeatured = idx === 0 && !showFilters; 
                    
                    return (
                      <article 
                        key={news.id} 
                        className={`group relative rounded-[2rem] overflow-hidden bg-white shadow-sm border border-slate-100 hover:shadow-2xl hover:shadow-slate-200/50 transition-all duration-500 hover:-translate-y-1 flex flex-col ${isFeatured ? 'md:col-span-2' : ''}`}
                      >
                        {/* Image Full Background or Top */}
                        <div className="absolute inset-0 z-0">
                            <img 
                              src={news.imageUrl} 
                              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                              alt={news.title} 
                              onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?auto=format&fit=crop&q=80"; }} 
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-90 transition-opacity duration-300"></div>
                        </div>

                        {/* Content Overlay */}
                        <div className="relative z-10 p-8 flex flex-col h-full text-white">
                           <div className="flex justify-between items-start">
                              <span className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-[10px] font-bold uppercase tracking-wider border border-white/10">
                                {new Date(news.date).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                              </span>
                              
                              {session && onToggleFavorite && (
                                <button
                                  onClick={(e) => { 
                                    e.stopPropagation(); 
                                    onToggleFavorite(news.id);
                                    sendEvent(isFavorite ? 'remove_favorite' : 'add_favorite', 'Home', news.title);
                                  }}
                                  className={`p-2 rounded-full backdrop-blur-md transition-all ${isFavorite ? 'bg-red-500 text-white' : 'bg-white/10 text-white hover:bg-white/30'}`}
                                >
                                  <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
                                </button>
                              )}
                           </div>

                           <div className="mt-auto">
                              <div className="flex flex-wrap gap-2 mb-3">
                                {news.tagsMetiers.slice(0,2).map(tag => (
                                    <span key={tag} className="text-[10px] px-2 py-0.5 bg-white/10 border border-white/20 rounded font-medium">{getTagLabel(tag)}</span>
                                ))}
                              </div>
                              <h3 className={`font-bold mb-4 leading-tight group-hover:text-pilo-green transition-colors ${isFeatured ? 'text-3xl md:text-4xl' : 'text-xl'}`}>
                                 {news.title}
                              </h3>
                              <p className={`text-slate-300 mb-6 line-clamp-3 ${isFeatured ? 'text-lg max-w-2xl' : 'text-sm'}`}>
                                {news.description}
                              </p>
                              
                              <a 
                                href={news.sourceLink} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                onClick={() => sendEvent('click_news', 'Engagement', news.title)}
                                className="inline-flex items-center gap-2 text-white font-bold border-b border-white/30 pb-1 hover:border-pilo-green hover:text-pilo-green transition-all"
                              >
                                Lire l'article <ArrowRight className="w-4 h-4" />
                              </a>
                           </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-32 bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-200">
                   <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm"><Search className="w-10 h-10 text-slate-300" /></div>
                   <h3 className="text-xl font-bold text-slate-900">Aucun résultat</h3>
                   <button onClick={resetFilters} className="mt-4 text-pilo-green font-bold hover:underline">Réinitialiser les filtres</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
