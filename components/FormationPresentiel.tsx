import React, { useState, useMemo, useEffect } from 'react';
import { Calendar, MapPin, Users, Star, ArrowRight, CheckCircle2, GraduationCap, BookOpen, Search, Filter, SlidersHorizontal, X, Target, Award, BrainCircuit, ExternalLink, Download, Trophy, ShieldCheck, Zap, TrendingUp, Medal, Building2, Wallet } from 'lucide-react';
import { Page, Training } from '../types';
import { useMarche } from './MarcheContext';
import { sendEvent } from '../analytics';
import { RenduMarkdown } from './RenduMarkdown';
import { pousserUrlFiche, retirerUrlFiche } from '../seoUrl';

interface FormationPresentielProps {
  session?: any;
  onNavigate: (page: Page) => void;
  trainings?: Training[]; // Dynamic props
  /** Slug de la fiche à ouvrir quand on arrive par une URL publique */
  slugInitial?: string | null;
  /** Appelé une fois la fiche ouverte, pour ne pas la rouvrir en boucle */
  onFicheOuverte?: () => void;
}


export const FormationPresentiel: React.FC<FormationPresentielProps> = ({ session, onNavigate, trainings = [], slugInitial, onFicheOuverte }) => {
  // Mot du marché affiché (« l'agriculture »…), null en vitrine
  const { motMarche } = useMarche();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<string>('Tous');
  const [selectedPublic, setSelectedPublic] = useState<string>('Tous');
  const [selectedTraining, setSelectedTraining] = useState<Training | null>(null);

  // TRACKING VIEW
  useEffect(() => {
    sendEvent('view_component', 'Navigation', 'FormationPresentiel');
  }, []);

  const handleLevelFilter = (level: string) => {
    setSelectedLevel(level);
    if (level !== 'Tous') sendEvent('filter_training', 'Formation', `Level:${level}`);
  };

  const handlePublicFilter = (pub: string) => {
    setSelectedPublic(pub);
    if (pub !== 'Tous') sendEvent('filter_training', 'Formation', `Public:${pub}`);
  };

  const handleSelectTraining = (training: Training) => {
    setSelectedTraining(training);
    if (training.slug) pousserUrlFiche('formations', training.slug);
    sendEvent('view_training_details', 'Engagement', training.title);
  };

  const fermerFiche = () => {
    setSelectedTraining(null);
    retirerUrlFiche('formation-presentiel');
  };

  // Ouverture automatique quand on arrive par piloterra.fr/formations/ma-formation
  useEffect(() => {
    if (!slugInitial || trainings.length === 0) return;
    const cible = trainings.find(t => t.slug === slugInitial);
    if (cible) {
      setSelectedTraining(cible);
      sendEvent('view_training_details', 'Engagement', cible.title);
      onFicheOuverte?.();
    }
  }, [slugInitial, trainings, onFicheOuverte]);

  // Le bouton « retour » du navigateur referme la fiche
  useEffect(() => {
    const surRetour = () => setSelectedTraining(null);
    window.addEventListener('popstate', surRetour);
    return () => window.removeEventListener('popstate', surRetour);
  }, []);

  const handleDownloadProgram = (trainingTitle: string) => {
    sendEvent('download_program', 'Engagement', trainingTitle);
  };

  // Extraction des filtres uniques
  const allLevels = useMemo(() => {
    const levels = new Set(trainings.map(t => t.niveau).filter(Boolean));
    return ['Tous', ...Array.from(levels).sort()];
  }, [trainings]);

  const allPublics = useMemo(() => {
    const pubs = new Set<string>();
    trainings.forEach(t => t.publics?.forEach(p => pubs.add(p)));
    return ['Tous', ...Array.from(pubs).sort()];
  }, [trainings]);

  const filteredTrainings = useMemo(() => {
    const filtered = trainings.filter(t => {
      const searchLower = searchQuery.toLowerCase();
      const matchSearch = 
        t.title.toLowerCase().includes(searchLower) || 
        t.description.some(d => d.toLowerCase().includes(searchLower)) ||
        (t.competences || []).some(c => c.toLowerCase().includes(searchLower)) ||
        (t.objectifs || []).some(o => o.toLowerCase().includes(searchLower)) ||
        (t.publics || []).some(p => p.toLowerCase().includes(searchLower));
      
      const matchLevel = selectedLevel === 'Tous' || t.niveau === selectedLevel;
      const matchPublic = selectedPublic === 'Tous' || t.publics.includes(selectedPublic);

      return matchSearch && matchLevel && matchPublic;
    });
    return [...filtered].sort((a, b) => a.niveau.localeCompare(b.niveau)); // Tri par défaut par niveau
  }, [trainings, searchQuery, selectedLevel, selectedPublic]);

  return (
    <div className="min-h-screen bg-white font-sans">
      
      {/* 1. HERO & QUI SOMMES NOUS */}
      <section className="bg-emerald-900 text-white pt-20 pb-24 relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-emerald-800/30 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-pilo-brown/20 rounded-full blur-3xl -ml-20 -mb-20 pointer-events-none"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="flex flex-col lg:flex-row items-center gap-12">
            <div className="lg:w-1/2 space-y-6">
               <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md border border-white/20 rounded-full text-xs font-bold uppercase tracking-wider text-emerald-300">
                  <Star className="w-3 h-3" /> Organisme certifié
               </div>
               <h1 className="text-5xl md:text-6xl font-black leading-tight">
                 Formation IA <br/>
                 <span className="text-emerald-400">PiloTerra</span>
               </h1>
               <p className="text-xl text-emerald-100 opacity-90 leading-relaxed max-w-lg">
                 Propulsé par <strong>bziiit</strong>, acteur historique de l'IA depuis 2015. Nous accompagnons la montée en compétence numérique {motMarche ? `des acteurs de ${motMarche}` : 'des entreprises et des territoires'}.
               </p>
               
               {/* Logos & Certifications */}
               <div className="flex flex-wrap items-center gap-6 pt-4">
                  <div className="space-y-1">
                     <div className="text-xs font-bold text-emerald-300 uppercase tracking-widest">MEMBRE DE</div>
                     <div className="flex gap-3 text-xs font-medium text-emerald-100/80">
                        <span>AFNOR</span> • <span>Hub France IA</span> • <span>Union Des Marques</span>
                     </div>
                  </div>
               </div>
            </div>

            {/* Chiffres Clés Bento */}
            <div className="lg:w-1/2 w-full">
               <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/10 backdrop-blur-md border border-white/10 p-6 rounded-2xl flex flex-col justify-between h-40 hover:bg-white/20 transition-colors">
                     <Calendar className="w-8 h-8 text-pilo-brown" />
                     <div>
                        <span className="text-4xl font-black text-white">10</span>
                        <span className="block text-sm font-medium text-emerald-200">Ans d'existence</span>
                     </div>
                  </div>
                  <div className="bg-emerald-800/50 backdrop-blur-md border border-white/10 p-6 rounded-2xl flex flex-col justify-between h-40 hover:bg-emerald-800/70 transition-colors">
                     <Building2 className="w-8 h-8 text-emerald-400" />
                     <div>
                        <span className="text-4xl font-black text-white">135</span>
                        <span className="block text-sm font-medium text-emerald-200">Clients</span>
                     </div>
                  </div>
                  <div className="col-span-2 bg-gradient-to-r from-pilo-brown/90 to-amber-700/90 backdrop-blur-md border border-white/10 p-6 rounded-2xl flex items-center justify-between hover:-translate-y-1 transition-transform">
                     <div>
                        <div className="flex items-center gap-2 mb-1">
                           <GraduationCap className="w-5 h-5 text-white" />
                           <span className="text-xs font-bold uppercase tracking-widest text-white/80">Formation</span>
                        </div>
                        <span className="text-4xl font-black text-white leading-tight block">1 050</span>
                        <span className="text-sm text-white/70">Stagiaires formés</span>
                     </div>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. PARCOURS 5 NIVEAUX (BANDEAU DEMANDÉ) */}
      <section className="py-16 bg-slate-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
           <h2 className="text-3xl font-black text-slate-900 mb-4">Du déclic à l'excellence</h2>
           <p className="text-slate-600 max-w-2xl mx-auto mb-12 text-lg">Un parcours structuré en 5 niveaux pour accompagner chaque collaborateur à son rythme.</p>
           
           <div className="relative">
              {/* Connecting Line */}
              <div className="hidden lg:block absolute top-12 left-[10%] right-[10%] h-1 bg-slate-200 -z-10 rounded-full"></div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
                 {[
                    { icon: Zap, title: "IA Starter", desc: "Initiation claire, démystification & usages immédiats.", color: "text-emerald-500 bg-emerald-50 border-emerald-100" },
                    { icon: CheckCircle2, title: "IA Praticien", desc: "Pratique régulière, maîtrise des outils, gains de productivité.", color: "text-teal-500 bg-teal-50 border-teal-100" },
                    { icon: BrainCircuit, title: "IA Spécialiste", desc: "Pilotage autonome, automatisation & processus métiers.", color: "text-blue-500 bg-blue-50 border-blue-100" },
                    { icon: ShieldCheck, title: "IA Expert", desc: "Solutions avancées, développement de cas complexes.", color: "text-indigo-500 bg-indigo-50 border-indigo-100" },
                    { icon: Trophy, title: "IA Leader", desc: "Stratégie, déploiement à l'échelle & ROI.", color: "text-purple-500 bg-purple-50 border-purple-100" },
                 ].map((step, idx) => (
                    <div key={idx} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center hover:shadow-lg hover:-translate-y-1 transition-all h-full group">
                       <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border-2 ${step.color} group-hover:scale-110 transition-transform`}>
                          <step.icon className="w-8 h-8" />
                       </div>
                       <h3 className="font-bold text-slate-900 mb-3 text-lg">{step.title}</h3>
                       <p className="text-xs text-slate-500 leading-relaxed font-medium">{step.desc}</p>
                    </div>
                 ))}
              </div>
           </div>
        </div>
      </section>

      {/* 3. L'EQUIPE PEDAGOGIQUE */}
      <section className="py-20 bg-white">
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-black text-slate-900 mb-12 text-center">Nos Experts <span className="text-pilo-green">Formateurs</span></h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
               {[
                  { 
                    name: "Laurent TRIPIED", 
                    role: "IA Productivité, Frugale & Éthique", 
                    tags: ["Productivité", "Graphique", "Auteur", "Vibe coding"],
                    image: "https://dgtctavkmcyhqopngcxk.supabase.co/storage/v1/object/public/PiloTerra/trombi/Laurent%20TRIPIED%20PiloTerra.svg" 
                  },
                  { 
                    name: "David JOULIN", 
                    role: "IA Gestion & Data", 
                    tags: ["Infrastructure", "SI", "Data", "Veille open source"],
                    image: "https://dgtctavkmcyhqopngcxk.supabase.co/storage/v1/object/public/PiloTerra/trombi/David%20JOULIN%20PiloTerra.svg" 
                  },
                  { 
                    name: "Cyril DUPLAND", 
                    role: "RAG & Applications IA", 
                    tags: ["Serveurs MCP", "Dev", "Technique", "Impact carbone"],
                    image: "https://dgtctavkmcyhqopngcxk.supabase.co/storage/v1/object/public/PiloTerra/trombi/Cyril%20DUPLAND%20PiloTerra.svg" 
                  },
                  { 
                    name: "Paul ARNON", 
                    role: "Automations & Agents IA", 
                    tags: ["n8n", "RH", "RSE", "Marketing"],
                    image: "https://dgtctavkmcyhqopngcxk.supabase.co/storage/v1/object/public/PiloTerra/trombi/Paul%20ARNON%20PiloTerra.svg" 
                  }
               ].map((expert, idx) => (
                  <div key={idx} className="group relative">
                     <div className="bg-slate-50 rounded-[2rem] p-6 text-center border border-slate-100 hover:border-emerald-200 transition-colors h-full flex flex-col items-center">
                        <div className="w-32 h-32 rounded-full overflow-hidden bg-pilo-green border-4 border-white shadow-lg mb-6 group-hover:scale-105 transition-transform duration-500">
                           <img src={expert.image} alt={expert.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 mb-1">{expert.name}</h3>
                        <p className="text-emerald-700 text-sm font-bold mb-4 h-10 flex items-center justify-center">{expert.role}</p>
                        <div className="flex flex-wrap justify-center gap-2 mt-auto">
                           {expert.tags.map((tag, i) => (
                              <span key={i} className="text-[10px] px-2 py-1 bg-white border border-slate-200 rounded text-slate-500 uppercase tracking-wide">{tag}</span>
                           ))}
                        </div>
                     </div>
                  </div>
               ))}
            </div>
         </div>
      </section>

      {/* QUALIOPI & SATISFACTION SECTION */}
      <section className="py-16 bg-gradient-to-br from-emerald-50 to-white overflow-hidden relative border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-12 bg-white rounded-[2rem] p-8 md:p-12 shadow-xl border border-emerald-100 relative">
             {/* Decorative background */}
             <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-100/50 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>

             {/* Logo Section */}
             <div className="shrink-0 relative z-10 flex flex-col items-center gap-4">
                <a href="https://certifopac.fr/qualiopi/certification/verification/?siren=813829876" target="_blank" rel="noopener noreferrer" className="hover:scale-105 transition-transform">
                    <img 
                      src="https://dgtctavkmcyhqopngcxk.supabase.co/storage/v1/object/public/PiloTerra/logo_formation/Qualiopi%20bziiit.png" 
                      alt="Logo Qualiopi - Processus Certifié" 
                      className="w-48 md:w-56 h-auto"
                    />
                </a>
                <div className="text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Certification Qualiopi</p>
                  <p className="text-[9px] text-slate-400">Actions de formation</p>
                </div>
             </div>

             {/* Content Section */}
             <div className="flex-grow space-y-8 relative z-10">
                <div className="text-center lg:text-left">
                  <h2 className="text-3xl font-black text-slate-900 leading-tight mb-4">
                    La satisfaction de nos <span className="text-emerald-600">apprenants</span>
                  </h2>
                  <p className="text-slate-600 text-sm leading-relaxed max-w-2xl">
                    Nos apprenants nous recommandent : <strong>96,2%</strong> de taux de satisfaction globale (données mises à jour le premier février 2026, basées sur les critères de contenu, pédagogie et satisfaction générale).
                  </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                   {[
                     { label: "Satisfaction Générale", value: 91.3, color: "bg-emerald-500" },
                     { label: "Qualité du Contenu", value: 90.9, color: "bg-teal-500" },
                     { label: "Évaluation du Formateur", value: 95.2, color: "bg-pilo-green" }
                   ].map((metric, idx) => (
                     <div key={idx} className="space-y-3">
                        <div className="flex justify-between items-end">
                           <span className="text-xs font-bold text-slate-700">{metric.label}</span>
                           <span className="text-lg font-black text-slate-900">{metric.value}%</span>
                        </div>
                        <div className="h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200 shadow-inner">
                           <div 
                             className={`h-full ${metric.color} rounded-full transition-all duration-1000 ease-out`}
                             style={{ width: `${metric.value}%` }}
                           ></div>
                        </div>
                     </div>
                   ))}
                </div>
             </div>
          </div>
        </div>
      </section>

      {/* Catalogue Formations Présentielles (Section Existante mais stylisée) */}
      <section className="py-20 bg-slate-50 border-t border-slate-200" id="catalogue">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
             <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-600 rounded-xl text-white shadow-lg shadow-emerald-600/20">
                  <GraduationCap className="w-6 h-6" />
                </div>
                <h2 className="text-3xl font-black text-slate-900">Le Catalogue</h2>
             </div>

             <div className="flex items-center gap-4">
                <div className="relative group">
                   <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                   <input 
                      type="text" 
                      placeholder="Rechercher une formation..." 
                      className="pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full md:w-72 shadow-sm"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                   />
                </div>
             </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-6 mb-10 p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
             <div className="space-y-3">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Star className="w-3 h-3" /> Niveau</label>
                <div className="flex flex-wrap gap-2">
                   {allLevels.map(level => (
                      <button 
                        key={level} 
                        onClick={() => handleLevelFilter(level)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${selectedLevel === level ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-white hover:border-slate-300'}`}
                      >
                        {level}
                      </button>
                   ))}
                </div>
             </div>
             <div className="space-y-3">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Users className="w-3 h-3" /> Public Cible</label>
                <div className="flex flex-wrap gap-2">
                   {allPublics.slice(0, 5).map(pub => (
                      <button 
                        key={pub} 
                        onClick={() => handlePublicFilter(pub)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${selectedPublic === pub ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-white hover:border-slate-300'}`}
                      >
                        {pub}
                      </button>
                   ))}
                </div>
             </div>
          </div>

          {filteredTrainings.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredTrainings.map((formation) => (
                <div 
                    key={formation.id}
                    className="group bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-2xl transition-all duration-300 overflow-hidden flex flex-col h-full hover:-translate-y-1"
                >
                    {/* Image Section - Top Banner */}
                    <div className="h-48 w-full relative overflow-hidden bg-slate-100">
                      <img 
                          src={formation.imageUrl || "https://bziiit.furious-squad.com/uploads/stock/resource/content/4651d2dbaac9d7dc47b4d86f83a11ad6.png"} 
                          alt={formation.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute top-3 left-3">
                          <span className="px-3 py-1 bg-white/95 backdrop-blur-md rounded-lg text-[10px] font-black uppercase tracking-widest text-emerald-800 shadow-sm border border-emerald-100/50">
                            {formation.niveau}
                          </span>
                      </div>
                    </div>

                    {/* Content Section */}
                    <div className="p-6 flex flex-col flex-grow">
                      <div className="mb-3 flex flex-wrap gap-1.5">
                          {formation.publics.slice(0, 2).map((pub, i) => (
                              <span key={i} className="px-2 py-0.5 bg-slate-50 text-slate-500 text-[9px] font-bold uppercase rounded border border-slate-100">
                                  {pub}
                              </span>
                          ))}
                          {formation.publics.length > 2 && <span className="px-2 py-0.5 bg-slate-50 text-slate-400 text-[9px] font-bold rounded border border-slate-100">+{formation.publics.length - 2}</span>}
                      </div>
                      
                      <h3 className="text-lg font-bold text-slate-900 mb-3 group-hover:text-emerald-600 transition-colors leading-tight line-clamp-2">
                          {formation.title}
                      </h3>
                      
                      {formation.objectifs && formation.objectifs.length > 0 ? (
                          <div className="mb-4 space-y-2 flex-grow">
                              <ul className="space-y-1">
                                  {formation.objectifs.slice(0, 2).map((point, i) => (
                                  <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                      <span className="line-clamp-2">{point}</span>
                                  </li>
                                  ))}
                              </ul>
                          </div>
                      ) : (
                          <p className="text-slate-500 text-sm mb-4 line-clamp-3 flex-grow">
                              {formation.description[0]}
                          </p>
                      )}

                      <div className="mt-auto pt-4 border-t border-slate-50 w-full">
                          <button 
                            onClick={() => handleSelectTraining(formation)}
                            className="w-full py-3 rounded-xl border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all flex items-center justify-center gap-2 group/btn shadow-sm"
                          >
                            Voir le programme <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                          </button>
                      </div>
                    </div>
                </div>
                ))}
            </div>
          ) : (
            <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Search className="w-8 h-8 text-slate-300" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Aucune formation trouvée</h3>
                <button onClick={() => { setSelectedLevel('Tous'); setSelectedPublic('Tous'); setSearchQuery(''); }} className="text-emerald-600 font-bold hover:underline">Réinitialiser les filtres</button>
            </div>
          )}
        </div>
      </section>

      {/* TRAINING DETAIL MODAL */}
      {selectedTraining && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto relative animate-in zoom-in-95 duration-200 flex flex-col">
                
                {/* Modal Header Image */}
                <div className="h-48 md:h-64 relative shrink-0">
                    <img 
                        src={selectedTraining.imageUrl || "https://bziiit.furious-squad.com/uploads/stock/resource/content/4651d2dbaac9d7dc47b4d86f83a11ad6.png"} 
                        alt={selectedTraining.title}
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-transparent"></div>
                    <button 
                        onClick={fermerFiche}
                        className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition-colors backdrop-blur-md z-10"
                    >
                        <X className="w-6 h-6" />
                    </button>
                    {/* Centered Title Overlay */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 pt-12">
                        <span className="inline-block px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold uppercase tracking-widest mb-3 shadow-lg">
                            {selectedTraining.niveau}
                        </span>
                        <h2 className="text-3xl md:text-4xl font-black text-white leading-tight shadow-black drop-shadow-md">
                            {selectedTraining.title}
                        </h2>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row">
                    {/* Main Content */}
                    <div className="p-8 md:w-2/3 space-y-8">
                        <div>
                            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                                <BookOpen className="w-5 h-5 text-emerald-600" /> Description
                            </h3>
                            <div className="space-y-4 text-slate-600 leading-relaxed text-sm text-justify">
                                {selectedTraining.description.map((paragraph, idx) => (
                                    <p key={idx}>{paragraph}</p>
                                ))}
                            </div>

                            {/* Fiche éditoriale publique (contenu_long) */}
                            {selectedTraining.contenuLong && (
                                <div className="mt-6 pt-6 border-t border-slate-100 text-sm">
                                    <RenduMarkdown texte={selectedTraining.contenuLong} />
                                </div>
                            )}
                        </div>

                        {selectedTraining.objectifs && selectedTraining.objectifs.length > 0 && (
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                                    <Target className="w-5 h-5 text-emerald-600" /> Objectifs Pédagogiques
                                </h3>
                                <ul className="space-y-3">
                                    {selectedTraining.objectifs.map((obj, idx) => (
                                        <li key={idx} className="flex items-start gap-3 text-sm text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                                            <span>{obj}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {(selectedTraining.title.includes("Découverte IA") || selectedTraining.title.includes("Outils Collaboratifs IA")) && (
                            <div className="pt-8 border-t border-slate-100">
                                <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                                    <Star className="w-5 h-5 text-amber-500" /> Satisfaction des apprenants
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    {[
                                        { 
                                            label: "Satisfaction Générale", 
                                            value: selectedTraining.title.includes("Découverte IA") ? "91%" : "93%" 
                                        },
                                        { 
                                            label: "Qualité du Contenu", 
                                            value: selectedTraining.title.includes("Découverte IA") ? "91%" : "90%" 
                                        },
                                        { 
                                            label: "Évaluation du formateur", 
                                            value: selectedTraining.title.includes("Découverte IA") ? "95%" : "96%" 
                                        }
                                    ].map((m, i) => (
                                        <div key={i} className="bg-slate-50 p-4 rounded-xl border border-slate-100 shadow-sm text-center">
                                            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-tight mb-2 h-8 flex items-center justify-center font-sans tracking-widest">{m.label}</div>
                                            <div className="text-2xl font-black text-emerald-600">{m.value}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Sidebar Info - Centered */}
                    <div className="p-8 md:w-1/3 bg-slate-50 border-l border-slate-100 space-y-8 text-center">
                        
                        {selectedTraining.publics && selectedTraining.publics.length > 0 && (
                            <div>
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center justify-center gap-2">
                                    <Users className="w-4 h-4" /> Public Cible
                                </h4>
                                <div className="flex flex-wrap justify-center gap-2">
                                    {selectedTraining.publics.map((pub, idx) => (
                                        <span key={idx} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700">
                                            {pub}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {selectedTraining.competences && selectedTraining.competences.length > 0 && (
                            <div>
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center justify-center gap-2">
                                    <Award className="w-4 h-4" /> Compétences
                                </h4>
                                <div className="flex flex-wrap justify-center gap-2">
                                    {selectedTraining.competences.map((comp, idx) => (
                                        <span key={idx} className="px-3 py-1.5 bg-emerald-5 border border-emerald-100 text-emerald-700 rounded-lg text-xs font-bold">
                                            {comp}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {selectedTraining.editor && (
                            <div>
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center justify-center gap-2">
                                    <BrainCircuit className="w-4 h-4" /> Organisme
                                </h4>
                                <p className="font-bold text-slate-800">{selectedTraining.editor}</p>
                            </div>
                        )}

                        <div className="pt-6 border-t border-slate-200">
                            <a 
                                href={selectedTraining.link} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                onClick={() => handleDownloadProgram(selectedTraining.title)}
                                className="flex items-center justify-center gap-2 w-full py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-emerald-600 transition-all shadow-lg hover:shadow-emerald-600/20"
                            >
                                Télécharger la présentation <Download className="w-4 h-4" />
                            </a>
                            <p className="text-center text-[10px] text-slate-400 mt-2">
                                Format PDF
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};