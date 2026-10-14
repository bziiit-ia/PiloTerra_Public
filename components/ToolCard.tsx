import React from 'react';
import { ArrowRight, BarChart, FileText, Tractor, Users, Database, Globe, ExternalLink, Lock, Star, MapPin, Heart, Zap, ShieldCheck } from 'lucide-react';
import { Tool, Category } from '../types';
import { sendEvent } from '../analytics';

interface ToolCardProps {
  tool: Tool;
  className?: string;
  isLoggedIn?: boolean;
  onNavigateToAuth?: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
}

const getCategoryColor = (category: Category) => {
  switch (category) {
    case 'Agronomie': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    case 'Gestion de Data': return 'bg-indigo-50 text-indigo-700 border-indigo-100';
    case 'RH': return 'bg-pink-50 text-pink-700 border-pink-100';
    case 'Marketing & Com': return 'bg-orange-50 text-orange-700 border-orange-100';
    case 'Administration': return 'bg-blue-50 text-blue-700 border-blue-100';
    default: return 'bg-slate-50 text-slate-700 border-slate-100';
  }
};

export const ToolCard: React.FC<ToolCardProps> = ({ 
  tool, 
  className = '', 
  isLoggedIn, 
  onNavigateToAuth,
  isFavorite,
  onToggleFavorite
}) => {
  
  const handleAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isLoggedIn) {
      if (onNavigateToAuth) onNavigateToAuth();
      return;
    }
    
    // TRACKING GA4
    sendEvent('click_tool', 'Engagement', tool.name);

    if (tool.link) {
      window.open(tool.link, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div 
      className={`group relative bg-white rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-emerald-900/5 transition-all duration-500 hover:-translate-y-1 overflow-hidden flex flex-col h-full ${className}`}
    >
      {/* Top Banner Gradient */}
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-br from-pilo-cream to-white opacity-50 group-hover:opacity-100 transition-opacity"></div>
      
      {/* Content Container */}
      <div className="relative p-6 flex flex-col h-full z-10">
        
        {/* Header: Logo & Badges */}
        <div className="flex justify-between items-start mb-6">
          <div className="w-16 h-16 rounded-2xl bg-white shadow-lg border border-slate-50 flex items-center justify-center overflow-hidden p-2 group-hover:scale-110 transition-transform duration-500">
             {tool.imageUrl ? (
               <img src={tool.imageUrl} alt={tool.name} className="w-full h-full object-contain" />
             ) : (
               <Zap className="w-8 h-8 text-pilo-green" />
             )}
          </div>
          
          <div className="flex flex-col items-end gap-2">
             {/* Favorite Button */}
             {isLoggedIn && onToggleFavorite && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(tool.id);
                    sendEvent(isFavorite ? 'remove_favorite' : 'add_favorite', 'Engagement', tool.name);
                  }}
                  className={`p-2 rounded-full transition-all ${
                    isFavorite 
                      ? 'bg-red-50 text-red-500 shadow-sm scale-110' 
                      : 'bg-slate-50 text-slate-300 hover:bg-red-50 hover:text-red-400'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
                </button>
             )}
             <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${getCategoryColor(tool.category)}`}>
               {tool.category}
             </span>
          </div>
        </div>

        {/* Title & Desc */}
        <div className="mb-4">
          <h3 className="text-xl font-bold text-slate-900 mb-2 leading-tight group-hover:text-pilo-green transition-colors">
            {tool.name}
          </h3>
          <p className="text-slate-500 text-xs leading-relaxed line-clamp-3">
            {tool.description}
          </p>
        </div>

        {/* Meta Info Grid */}
        <div className="grid grid-cols-2 gap-2 mb-6">
           <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-medium bg-slate-50 px-2 py-1.5 rounded-lg">
              <ShieldCheck className="w-3 h-3 text-pilo-brown" />
              {tool.licence}
           </div>
           <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-medium bg-slate-50 px-2 py-1.5 rounded-lg">
              <MapPin className="w-3 h-3 text-blue-500" />
              {tool.paysEditeur}
           </div>
           {tool.roi && (
             <div className="col-span-2 flex items-center gap-1 text-[10px] text-slate-500 font-medium bg-slate-50 px-2 py-1.5 rounded-lg">
                <span className="text-slate-400 uppercase tracking-widest mr-1">Impact ROI</span>
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className={`w-3 h-3 ${i < tool.roi! ? 'fill-yellow-400 text-yellow-400' : 'text-slate-200'}`} />
                ))}
             </div>
           )}
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mb-6 mt-auto">
           {tool.tagsOutilsIA?.slice(0, 3).map(tag => (
             <span key={tag} className="text-[9px] font-bold text-slate-500 border border-slate-200 px-2 py-0.5 rounded-md">
               {tag}
             </span>
           ))}
        </div>

        {/* Action Button */}
        <button 
          onClick={handleAction}
          className={`w-full group/btn flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all relative overflow-hidden ${
            isLoggedIn 
              ? 'bg-slate-900 text-white hover:shadow-lg hover:shadow-pilo-green/20'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
          }`}
        >
          {isLoggedIn && <div className="absolute inset-0 bg-gradient-to-r from-pilo-green to-emerald-600 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300"></div>}
          <span className="relative z-10 flex items-center gap-2">
            {isLoggedIn ? (tool.link ? "Accéder à l'outil" : "Voir la fiche") : "Connexion requise"}
            {!isLoggedIn ? <Lock className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform" />}
          </span>
        </button>

      </div>
    </div>
  );
};