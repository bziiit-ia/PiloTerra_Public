import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { FicheDefiModal } from './FicheDefiModal';
import { Sparkles, ArrowRight, Mail, FileCheck, Lightbulb, Zap, CheckCircle2, TrendingUp, BarChart3, Target, BrainCircuit, ShieldCheck, Timer, FileText } from 'lucide-react';
import { Page } from '../types';
import { sendEvent } from '../analytics';

interface DefiIAProps {
  onNavigate: (page: Page) => void;
  session?: any;
}

export const DefiIA: React.FC<DefiIAProps> = ({ session, onNavigate }) => {
  const [totalDefis, setTotalDefis] = useState<number | null>(null);
  // Session de formation en cours de l'utilisateur (null hors formation).
  // Préchargée au montage pour que handleLaunchDefi reste synchrone :
  // un await avant window.open ferait bloquer l'onglet par le navigateur.
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  // Fiche Défi : modale du portail (05/10/2026), plus le formulaire n8n
  // dans un nouvel onglet.
  const [ficheDefiOuverte, setFicheDefiOuverte] = useState(false);

  // TRACKING VIEW
  useEffect(() => {
    sendEvent('view_component', 'Navigation', 'DefiIA');
  }, []);

  useEffect(() => {
    const fetchCount = async () => {
      try {
        // Fonction dédiée : la table diagnostics n'est plus lisible par un
        // visiteur, seul le nombre total est exposé.
        const { data: count, error } = await supabase.rpc('nombre_defis_piloterra');

        if (!error && count !== null) {
          setTotalDefis(Number(count));
        }
      } catch (err) {
        console.error("Erreur lors du comptage des défis", err);
      }
    };
    
    fetchCount();
  }, []);

  // Récupère la session de formation en cours, s'il y en a une.
  // Silencieux par nature : hors formation la fonction renvoie null.
  useEffect(() => {
    let cancelled = false;

    const loadActiveSession = async () => {
      if (!session?.user) {
        setActiveSessionId(null);
        return;
      }
      const { data, error } = await supabase.rpc('active_session_id');
      if (cancelled) return;
      if (error) {
        console.error('Session de formation non récupérée :', error.message);
        setActiveSessionId(null);
        return;
      }
      setActiveSessionId((data as string) || null);
    };

    loadActiveSession();
    return () => { cancelled = true; };
  }, [session]);

  // Le marché, le préremplissage et la session de formation sont gérés
  // par la modale (FicheDefiModal).
  const handleLaunchDefi = () => {
    // TRACKING GA4
    sendEvent('start_defi', 'Engagement', 'Lancer mon Défi IA');
    setFicheDefiOuverte(true);
  };

  return (
    <div className="min-h-screen bg-white font-sans">
      
      {/* 1. HERO SECTION */}
      <section className="relative bg-pilo-green pt-20 pb-32 overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
           <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
             <path d="M0 100 C 50 0 50 100 100 0 Z" fill="white" />
           </svg>
        </div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-white z-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-emerald-100 text-sm font-bold mb-8 backdrop-blur-sm animate-in fade-in slide-in-from-top-4 duration-700">
            <Sparkles className="w-4 h-4 text-pilo-brown" />
            Outil d'aide à la décision gratuit
          </div>
          
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-black mb-6 tracking-tight leading-tight">
            Transformez vos frustrations<br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-pilo-brown to-yellow-400">en leviers d'innovation.</span>
          </h1>
          
          <p className="max-w-3xl mx-auto text-xl text-emerald-100 mb-8 leading-relaxed font-medium">
            Transformez une frustration terrain en projet d'innovation concret.
            Une analyse stratégique propulsée par l'IA pour évaluer instantanément le ROI et la complexité de vos idées.
          </p>

          {/* Dynamic Counter - MOVED & RESIZED */}
          {totalDefis !== null && totalDefis > 0 && (
            <div className="flex justify-center mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
                <div className="inline-flex items-center gap-4 bg-white/10 backdrop-blur-md border border-white/20 py-3 px-8 rounded-full shadow-lg transform hover:scale-105 transition-transform cursor-default">
                    <span className="flex h-4 w-4 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-4 w-4 bg-green-500"></span>
                    </span>
                    <span className="text-white text-lg font-medium">
                        Déjà <span className="text-yellow-400 font-black text-2xl mx-1">{totalDefis}</span> diagnostics générés par la communauté
                    </span>
                </div>
            </div>
          )}
          
          <div className="flex flex-col items-center gap-8">
            <button 
                onClick={handleLaunchDefi}
                className="group relative px-12 py-7 md:px-16 md:py-8 bg-pilo-brown text-white rounded-full font-black text-2xl md:text-3xl transition-all hover:scale-105 shadow-[0_0_50px_-10px_rgba(167,122,21,0.6)] flex items-center justify-center gap-4 overflow-hidden border-4 border-white/10"
            >
                <span className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></span>
                <span className="relative flex items-center gap-3">
                  Lancer mon Défi IA
                  <ArrowRight className="w-8 h-8 md:w-10 md:h-10 group-hover:translate-x-2 transition-transform" />
                </span>
            </button>
          </div>
        </div>
      </section>

      {/* 2. HOW IT WORKS (Processus Simple) */}
      <section className="py-20 bg-white -mt-10 relative z-20 rounded-t-[3rem]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-black text-slate-900 mb-4">Du problème à la solution en 3 étapes</h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">Pas besoin d'être un expert technique. Vous connaissez votre métier, notre IA s'occupe du reste.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
            {/* Ligne connectrice (Desktop) */}
            <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-1 bg-gradient-to-r from-slate-200 via-pilo-green/30 to-slate-200 -z-10"></div>

            {[
              {
                icon: <FileText className="w-8 h-8 text-pilo-brown" />,
                step: "01",
                title: "Décrivez votre besoin",
                desc: "Répondez à 3 questions simples sur votre problématique métier (Agro, RH, Logistique...)."
              },
              {
                icon: <BrainCircuit className="w-8 h-8 text-pilo-green" />,
                step: "02",
                title: "Analyse IA Croisée",
                desc: "Notre moteur analyse votre site web et croise vos données avec notre base de connaissances métier."
              },
              {
                icon: <Target className="w-8 h-8 text-blue-600" />,
                step: "03",
                title: "Recevez votre diagnostic",
                desc: "Une fiche stratégique complète (PDF) arrive dans votre boîte mail instantanément."
              }
            ].map((item, idx) => (
              <div key={idx} className="flex flex-col items-center text-center group">
                <div className="w-24 h-24 bg-white border-4 border-slate-50 rounded-full flex items-center justify-center shadow-xl mb-6 relative group-hover:scale-110 transition-transform duration-300">
                  <div className="absolute -top-3 -right-3 w-8 h-8 bg-slate-900 text-white rounded-full flex items-center justify-center font-bold text-sm border-2 border-white">
                    {item.step}
                  </div>
                  {item.icon}
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{item.title}</h3>
                <p className="text-slate-600 leading-relaxed max-w-xs">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. EXEMPLE DE RESULTAT (Preuve visuelle) */}
      <section className="py-20 bg-pilo-cream relative overflow-hidden">
        {/* Background blobs */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-pilo-green/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-pilo-brown/5 rounded-full blur-3xl"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            
            {/* Texte à gauche */}
            <div className="lg:w-1/2 space-y-8">
               <h2 className="text-3xl md:text-4xl font-black text-slate-900 leading-tight">
                 Ce que vous recevez <span className="text-pilo-green">immédiatement</span>
               </h2>
               <p className="text-lg text-slate-600 leading-relaxed">
                 Fini les suppositions. Obtenez une feuille de route claire pour décider de lancer (ou non) votre projet.
               </p>
               
               <div className="space-y-6">
                  <div className="flex gap-4">
                    <div className="mt-1 bg-white p-2 rounded-lg shadow-sm border border-slate-100 h-fit">
                       <Target className="w-6 h-6 text-pilo-brown" />
                    </div>
                    <div>
                       <h4 className="font-bold text-slate-900 text-lg">Reformulation Stratégique</h4>
                       <p className="text-slate-500">Votre besoin traduit en cas d'usage technique précis.</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="mt-1 bg-white p-2 rounded-lg shadow-sm border border-slate-100 h-fit">
                       <BarChart3 className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div>
                       <h4 className="font-bold text-slate-900 text-lg">Score de Faisabilité</h4>
                       <p className="text-slate-500">Une évaluation objective du ROI potentiel et de la complexité technique.</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="mt-1 bg-white p-2 rounded-lg shadow-sm border border-slate-100 h-fit">
                       <ShieldCheck className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                       <h4 className="font-bold text-slate-900 text-lg">Diagnostic & Recommandations</h4>
                       <p className="text-slate-500">Savoir si c'est un "Gain Rapide", un "Projet Majeur" ou une "Fausse Bonne Idée".</p>
                    </div>
                  </div>
               </div>

               <button 
                  onClick={handleLaunchDefi}
                  className="inline-flex items-center gap-2 text-pilo-green font-black border-b-2 border-pilo-green pb-1 hover:text-emerald-800 hover:border-emerald-800 transition-colors mt-4"
               >
                  Lancer mon Défi IA <ArrowRight className="w-5 h-5" />
               </button>
            </div>

            {/* MOCKUP VISUEL à droite */}
            <div className="lg:w-1/2 w-full">
               <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden transform rotate-2 hover:rotate-0 transition-transform duration-500">
                  {/* Header Mockup */}
                  <div className="bg-slate-900 p-6 flex items-center justify-between text-white">
                     <div className="flex items-center gap-3">
                        <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                        <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                     </div>
                     <div className="text-xs font-bold uppercase tracking-widest text-emerald-400">Analyse PiloTerra</div>
                  </div>

                  {/* Body Mockup */}
                  <div className="p-8 space-y-8">
                     {/* Titre Projet */}
                     <div>
                        <div className="text-xs font-bold text-slate-400 uppercase mb-2">Projet Analysé</div>
                        <h3 className="text-xl font-black text-slate-800">Optimisation des tournées de collecte par IA</h3>
                     </div>

                     {/* Verdict Badge */}
                     <div className="flex items-center gap-4 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                        <div className="p-3 bg-emerald-600 text-white rounded-full shadow-lg shadow-emerald-600/20">
                           <TrendingUp className="w-6 h-6" />
                        </div>
                        <div>
                           <div className="text-xs font-bold text-emerald-800 uppercase">Diagnostic Stratégique</div>
                           <div className="text-2xl font-black text-emerald-600">GAIN RAPIDE</div>
                        </div>
                     </div>

                     {/* Jauges */}
                     <div className="space-y-4">
                        <div>
                           <div className="flex justify-between text-sm font-bold mb-1">
                              <span className="text-slate-600">Rentabilité (ROI)</span>
                              <span className="text-emerald-600">85/100</span>
                           </div>
                           <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 w-[85%] rounded-full"></div>
                           </div>
                        </div>
                        <div>
                           <div className="flex justify-between text-sm font-bold mb-1">
                              <span className="text-slate-600">Complexité Technique</span>
                              <span className="text-orange-500">42/100</span>
                           </div>
                           <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-orange-400 w-[42%] rounded-full"></div>
                           </div>
                        </div>
                     </div>
                  </div>
               </div>
               
               {/* Background decoration elements behind mockup */}
               <div className="absolute -z-10 -bottom-10 -right-10 w-full h-full bg-slate-900 rounded-3xl opacity-5 transform rotate-6"></div>
            </div>

          </div>
        </div>
      </section>

      {/* 4. FINAL CTA & BENEFITS */}
      <section className="py-24 bg-white">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-black text-slate-900 mb-6">Arrêtez de naviguer à vue</h2>
          <p className="text-xl text-slate-500 mb-12 leading-relaxed">
            L'innovation n'est pas une question de budget, c'est une question de méthode.
            Sachez immédiatement si votre idée mérite d'être développée.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 text-left">
             <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <CheckCircle2 className="w-6 h-6 text-pilo-green mb-2" />
                <h4 className="font-bold text-slate-900">100% Gratuit</h4>
                <p className="text-sm text-slate-500">Aucun engagement requis.</p>
             </div>
             <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <Timer className="w-6 h-6 text-pilo-green mb-2" />
                <h4 className="font-bold text-slate-900">Ultra Rapide</h4>
                <p className="text-sm text-slate-500">Résultat en moins de 3 min.</p>
             </div>
             <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <ShieldCheck className="w-6 h-6 text-pilo-green mb-2" />
                <h4 className="font-bold text-slate-900">Confidentiel</h4>
                <p className="text-sm text-slate-500">Vos données restent privées.</p>
             </div>
          </div>

          <button 
             onClick={handleLaunchDefi}
             className="px-12 py-6 bg-pilo-green hover:bg-emerald-800 text-white text-xl font-bold rounded-2xl shadow-xl shadow-emerald-900/20 transform hover:-translate-y-1 transition-all flex items-center justify-center gap-3 mx-auto"
          >
             Je lance mon analyse maintenant
             <Zap className="w-6 h-6" />
          </button>
          
          <p className="mt-6 text-sm text-slate-400">
             Rejoignez les {totalDefis ? totalDefis : 'nombreux'} pionniers qui ont déjà lancé leur défi IA.
          </p>
        </div>
      </section>

      <FicheDefiModal
        ouvert={ficheDefiOuverte}
        onFermer={() => setFicheDefiOuverte(false)}
        session={session}
        sessionFormationId={activeSessionId}
      />
    </div>
  );
};