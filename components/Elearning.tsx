import React, { useState, useMemo, useEffect } from 'react';
import { Play, FileText, Headphones, Video, BookOpen, Search, ExternalLink, Lock, Zap, Tag, MonitorPlay, Heart } from 'lucide-react';
import { Page, Resource } from '../types';
import { useMarche } from './MarcheContext';
import { sendEvent } from '../analytics';

const OUTILS_METIERS_MAPPING: Record<string, string> = {
  'geo': 'Géolocalisation / Cartographie',
  'traca': 'Traçabilité',
  'iot': 'Capteurs / IoT / Robotique',
  'climate': 'Environnement / Eau / Météo / Climat',
  'biodiv': 'Biodiversité'
};

const NATURE_MAPPING: Record<string, string> = {
  'replay': 'Replay',
  'pdf': 'Fiche / Livre PDF',
  'tuto': 'Tutoriel',
  'podcast': 'Podcast',
  'cours': 'Cours en ligne',
  'video': 'Vidéo'
};

interface ElearningProps {
  session?: any;
  onNavigate: (page: Page) => void;
  resources: Resource[]; // Dynamic resources (Only E-learning items passed from App.tsx)
  favorites?: string[];
  onToggleFavorite?: (id: string) => void;
}

export const Elearning: React.FC<ElearningProps> = ({ session, onNavigate, resources = [], favorites = [], onToggleFavorite }) => {
  // Mot du marché affiché (« l'agriculture »…), null en vitrine
  const { motMarche } = useMarche();
  const [searchQuery, setSearchQuery] = useState('');
  const [natureFilter, setNatureFilter] = useState('Tous');
  const [metierFilter, setMetierFilter] = useState('Tous');

  // TRACKING VIEW
  useEffect(() => {
    sendEvent('view_component', 'Navigation', 'Elearning');
  }, []);

  const handleNatureFilter = (f: string) => {
    setNatureFilter(f);
    if (f !== 'Tous') sendEvent('filter_resource', 'Elearning', `Nature:${f}`);
  };

  const handleMetierFilter = (f: string) => {
    setMetierFilter(f);
    if (f !== 'Tous') sendEvent('filter_resource', 'Elearning', `Metier:${f}`);
  };

  const filteredResources = useMemo(() => {
    return resources.filter(r => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = 
        r.title.toLowerCase().includes(searchLower) || 
        r.description.toLowerCase().includes(searchLower) ||
        r.outilsMetiers.some(m => m.toLowerCase().includes(searchLower));

      const matchesNature = natureFilter === 'Tous' || NATURE_MAPPING[r.nature] === natureFilter;
      // Verification plus souple pour les tags metiers qui sont des tableaux
      const matchesMetier = metierFilter === 'Tous' || r.outilsMetiers.some(m => OUTILS_METIERS_MAPPING[m] === metierFilter);
      return matchesSearch && matchesNature && matchesMetier;
    });
  }, [searchQuery, natureFilter, metierFilter, resources]);

  const getIcon = (nature: string) => {
    switch (nature) {
      case 'pdf': return <FileText className="w-5 h-5" />;
      case 'podcast': return <Headphones className="w-5 h-5" />;
      case 'replay': return <MonitorPlay className="w-5 h-5" />;
      case 'video': return <Video className="w-5 h-5" />;
      case 'cours': return <BookOpen className="w-5 h-5" />;
      default: return <Play className="w-5 h-5" />;
    }
  };

  const getBadgeStyles = (nature: string) => {
    switch (nature) {
      case 'pdf': return 'bg-red-50 text-red-700 border-red-100';
      case 'podcast': return 'bg-amber-50 text-amber-700 border-amber-100';
      case 'replay': return 'bg-orange-50 text-orange-700 border-orange-100';
      case 'video': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'cours': return 'bg-blue-50 text-blue-700 border-blue-100';
      default: return 'bg-slate-50 text-slate-700 border-slate-100';
    }
  };

  const handleResourceClick = (link: string, title: string) => {
    if (!session) { onNavigate('dashboard'); return; }
    sendEvent('click_resource', 'Engagement', title);
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-emerald-900 pt-20 pb-40 px-4 relative overflow-hidden">
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h1 className="text-4xl md:text-5xl font-black text-white mb-6">Académie PiloTerra</h1>
          <p className="text-emerald-100 mb-10 max-w-2xl mx-auto text-lg opacity-90 leading-relaxed">Formez-vous aux enjeux de l'IA{motMarche ? ` pour ${motMarche}` : ''}. Retrouvez masterclasses et tutoriels exclusifs.</p>
          <div className="relative max-w-2xl mx-auto">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-400" />
            <input type="text" placeholder="Rechercher une ressource..." className="w-full pl-14 pr-6 py-5 bg-white rounded-2xl shadow-2xl outline-none text-lg text-slate-900" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-20 relative z-20 pb-20">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 mb-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-4"><Tag className="w-3.5 h-3.5" /> Filtrer par Nature</label>
              <div className="flex flex-wrap gap-2">
                {['Tous', ...Object.values(NATURE_MAPPING)].map(f => (
                  <button key={f} onClick={() => handleNatureFilter(f)} className={`px-4 py-2 rounded-xl text-xs font-bold border ${natureFilter === f ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-white hover:border-emerald-200'}`}>{f}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-4"><Zap className="w-3.5 h-3.5" /> Outils Métiers</label>
              <div className="flex flex-wrap gap-2">
                {['Tous', ...Object.values(OUTILS_METIERS_MAPPING)].map(f => (
                  <button key={f} onClick={() => handleMetierFilter(f)} className={`px-4 py-2 rounded-xl text-xs font-bold border ${metierFilter === f ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-white hover:border-blue-200'}`}>{f}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {filteredResources.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredResources.map((resource) => {
              const isFavorite = favorites.includes(resource.id);
              const natureLabel = NATURE_MAPPING[resource.nature] || resource.nature;

              return (
                <div 
                  key={resource.id} 
                  className="group bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-2xl transition-all duration-300 flex flex-col h-full overflow-hidden relative"
                >
                  <div className="h-52 relative overflow-hidden bg-slate-100 flex items-center justify-center p-4">
                    
                    <img src={resource.imageUrl} alt={resource.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 absolute inset-0" onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?auto=format&fit=crop&q=80"; }} />
                    
                    {/* Badge */}
                    <div className={`absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest shadow-sm backdrop-blur-md z-10 ${getBadgeStyles(resource.nature)}`}>
                        {getIcon(resource.nature)} {natureLabel}
                    </div>

                    {/* Zone Cliquable invisible (lien) */}
                    <div 
                        onClick={() => handleResourceClick(resource.link, resource.title)} 
                        className="absolute inset-0 cursor-pointer z-10"
                    />
                    
                    {/* Bouton Favori au dessus de tout (Z-20) */}
                    {session && onToggleFavorite && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(resource.id);
                          sendEvent(isFavorite ? 'remove_favorite' : 'add_favorite', 'Elearning', resource.title);
                        }}
                        className={`absolute top-4 right-4 p-2 rounded-full backdrop-blur-md transition-all shadow-sm z-20 cursor-pointer ${
                          isFavorite 
                            ? 'bg-red-500 text-white scale-110' 
                            : 'bg-white/80 text-slate-400 hover:text-red-500 hover:bg-white'
                        }`}
                        type="button"
                      >
                        <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
                      </button>
                    )}
                  </div>

                  <div className="p-7 flex flex-col flex-grow bg-white z-20 relative">
                    <h3 
                        onClick={() => handleResourceClick(resource.link, resource.title)}
                        className="text-xl font-bold text-slate-900 mb-3 group-hover:text-emerald-600 transition-colors leading-tight cursor-pointer"
                    >
                        {resource.title}
                    </h3>
                    <p className="text-slate-500 text-sm leading-relaxed mb-6 line-clamp-3">{resource.description}</p>
                    
                    <div className="mt-auto pt-5 border-t border-slate-50 flex items-center justify-between">
                      <button 
                        onClick={() => handleResourceClick(resource.link, resource.title)}
                        className={`flex items-center gap-2 text-xs font-bold ${session ? 'text-emerald-600 hover:underline' : 'text-slate-400'}`}
                      >
                        {session ? <>Consulter la ressource <ExternalLink className="w-3 h-3" /></> : <>Connexion requise <Lock className="w-3 h-3" /></>}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-32 bg-white rounded-[3rem] border border-dashed border-slate-200">
            <h3 className="text-2xl font-bold text-slate-900">Aucune ressource trouvée</h3>
            <button onClick={() => { setNatureFilter('Tous'); setMetierFilter('Tous'); setSearchQuery(''); }} className="mt-8 px-8 py-3 bg-emerald-600 text-white rounded-xl font-bold">Réinitialiser</button>
          </div>
        )}
      </div>
    </div>
  );
};