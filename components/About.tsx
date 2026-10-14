import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { FicheDefiModal } from './FicheDefiModal';
import { useMarche } from './MarcheContext';
import { PictosValeurs } from './PictosValeurs';
import { AccrocheMarche } from './AccrocheMarche';
import { Marche, PublicMarche } from './marcheShared';
import { Page } from '../types';
import { Target, Users, Leaf, Building2, User, Globe, Code, CheckCircle2, Server, Phone, Calendar, Sparkles, X, ArrowRight, MapPin, ExternalLink, Truck, Warehouse, Droplets, Recycle, Anchor, Scale } from 'lucide-react';

interface AboutProps {
  onNavigate: (page: Page) => void;
  session?: any;
}

interface ClientRef {
  name: string;
  logoUrl: string;
  websiteUrl: string;
}

// Configuration manuelle des sites web des clients.
// Clé = Nom du fichier exact dans le bucket (avec extension)
// Valeur = URL du site web
const CLIENT_WEBSITES: Record<string, string> = {
  "Agir - Agri.png": "https://www.agiragri.com/",
  "Agridemain.png": "https://agridemain.fr/",
  "Alicoop.png": "https://alicoop.coop/accueil/",
  "AS CEFIGA.png": "https://www.cefiga.fr/",
  "Association Interprofesionnelle Betterave Sucrieres.png": "https://aibs-france.fr/",
  "Axema.png": "https://www.axema.fr/",
  "Brad Technology.png": "https://brad.technology",
  "Chambre d'Agriculture des Pays de la Loire.png": "https://pays-de-la-loire.chambres-agriculture.fr/",
  "Chateau Cheval Blanc.png": "https://www.chateau-cheval-blanc.com/",
  "Cooperation Agricole Nouvelle-Aquitaine.png": "https://www.lacooperationagricole.coop/regions/nouvelle-aquitaine",
  "Cooperation Agricole Occitanie.png": "https://www.lacooperationagricole-occitanie.fr/index.php/fr/",
  "DRAAF Nouvelle-Aquitaine.png": "https://draaf.nouvelle-aquitaine.agriculture.gouv.fr/",
  "Durepaire.png": "https://www.durepaire.fr/",
  "FR CUMA Auvergne Rhones-Alpes.png": "https://aura.cuma.fr/",
  "FR CUMA Nouvelle-Aquitaine.png": "https://nouvelle-aquitaine.cuma.fr/",
  "Groupe CEGARA.png": "https://www.groupecegara.fr/",
  "Groupe Ocealia.pn": "https://www.ocealia-groupe.fr/",
  "Itinera - Neayi.png": "https://itinera.ag/",
  "Merithalle.png": "https://www.merithalle.fr/",
  "OSFARM.png": "https://www.osfarm.org/fr/y",
  "Peche Nouvelle-Aquitaine.png": "https://www.peche-nouvelle-aquitaine.org/",
  "Reseau des Etablissements Agricoles Nouvelle-Aquitaine (REANA).png": "https://www.reana.fr/",
  "SAFER Nouvelle-Aquitaine.png": "https://www.saferna.fr/",

  // Ajoutez les autres clients ici...
};

// Pictogrammes des publics (clé stockée dans marches.publics[].icone).
const PICTOS_PUBLICS: Record<string, React.ElementType> = {
  globe: Globe,
  batiment: Building2,
  groupe: Users,
  personne: User,
  camion: Truck,
  entrepot: Warehouse,
  feuille: Leaf,
  goutte: Droplets,
  recyclage: Recycle,
  ancre: Anchor,
  balance: Scale,
};
const pictoPublic = (icone?: string): React.ElementType =>
  (icone && PICTOS_PUBLICS[icone]) || Building2;

// Repli tant que sql/etape6_vitrine_tri_marche.sql n'est pas passé :
// la section historique, à l'identique.
const PUBLICS_REPLI: { intro: string; publics: PublicMarche[] } = {
  intro: 'Aux spécialistes du monde agricole.',
  publics: [
    { libelle: 'Coopératives Agricoles', icone: 'globe' },
    { libelle: "Chambres d'agriculture", icone: 'batiment' },
    { libelle: 'CUMA', icone: 'groupe' },
    { libelle: 'Fédérations', icone: 'personne' },
    { libelle: 'Cabinets comptables et centre de gestion', icone: 'batiment' },
  ],
};

const aDesPublics = (m: Marche | null | undefined): m is Marche =>
  !!m && Array.isArray(m.publics) && m.publics.length > 0;

export const About: React.FC<AboutProps> = ({ onNavigate, session }) => {
  const [isCalendlyOpen, setIsCalendlyOpen] = useState(false);
  // Session de formation en cours de l'utilisateur (null hors formation).
  // Préchargée au montage pour que handleLaunchDefi reste synchrone :
  // un await avant window.open ferait bloquer l'onglet par le navigateur.
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  // Fiche Défi : modale du portail (05/10/2026)
  const [ficheDefiOuverte, setFicheDefiOuverte] = useState(false);
  const [showPromoPopup, setShowPromoPopup] = useState(false);
  const [clients, setClients] = useState<ClientRef[]>([]);

  // Coordonnées pour les points sur la carte (en % du conteneur de l'image)
  const LOCATIONS = [
    { name: "Paris", top: "28%", left: "47%" },
    { name: "Saint-Porchaire", top: "54%", left: "27%" },
    { name: "Bordeaux", top: "65%", left: "29%" },
    { name: "Sarlat", top: "66%", left: "40%" },
    { name: "Pau", top: "79%", left: "31%" }
  ];

  const handleOpenCalendly = () => {
    setIsCalendlyOpen(true);
  };

  // Marché affiché, transmis au formulaire Fiche Défi (étape 5d) ; référentiel
  // et choix du secteur pour la vitrine tri-marché (étape 6).
  const {
    marcheActif, marches, marcheCourant, choisirMarche,
    selecteurDisponible, marcheVerrouille, chargement: chargementMarche,
    motMarche,
  } = useMarche();

  // Choix du secteur mis en avant sous l'accroche : pour tout visiteur, et
  // pour un connecté non verrouillé (super admin, compte sans marché).
  const choixSecteurVisible = selecteurDisponible && !marcheVerrouille && !chargementMarche;

  // Publics : ceux du marché affiché ; en vitrine, les marchés côte à côte.
  const marchesAvecPublics = marches.filter(aDesPublics);
  // Un seul marché actif (prod avant l'ouverture groupée) : ses publics.
  const publicsDuMarche = aDesPublics(marcheCourant)
    ? marcheCourant
    : (!marcheCourant && marchesAvecPublics.length === 1 ? marchesAvecPublics[0] : null);
  const vitrinePublics = !marcheCourant && marchesAvecPublics.length > 1;

  // Fiche Défi dans la modale du portail : marché, préremplissage et
  // session de formation y sont gérés.
  const handleLaunchDefi = () => {
    setShowPromoPopup(false);
    setFicheDefiOuverte(true);
  };

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

  useEffect(() => {
    // Scroll handling
    const hash = window.location.hash;
    if (hash === '#vision' || hash === '#offers') {
      setTimeout(() => {
        const element = document.getElementById(hash.substring(1));
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }, 500);
    }

    // Popup timer (10 seconds)
    const timer = setTimeout(() => {
        setShowPromoPopup(true);
    }, 10000);

    // Fetch Client Logos from Supabase
    const fetchLogos = async () => {
      try {
        console.log("🔍 [PiloTerra] Récupération logos bucket 'PiloTerra' > dossier 'clients'...");
        
        const { data, error } = await supabase
          .storage
          .from('PiloTerra')
          .list('clients', {
            limit: 100,
            offset: 0,
            sortBy: { column: 'name', order: 'asc' },
          });

        if (error) {
          console.error("❌ [PiloTerra] Erreur Supabase Storage:", error);
          return;
        }

        if (data && data.length > 0) {
          // Filtrage et transformation
          const validFiles = data.filter(file => 
            file.name !== '.emptyFolderPlaceholder' && 
            !file.name.startsWith('.')
          );

          const clientData: ClientRef[] = validFiles.map(file => {
              const publicUrl = supabase.storage.from('PiloTerra').getPublicUrl('clients/' + file.name).data.publicUrl;
              
              // Nettoyage du nom (enlève l'extension .png, .jpg, etc.)
              const cleanName = file.name.replace(/\.[^/.]+$/, "");
              
              // Recherche de l'URL dans la config ou fallback sur une recherche Google
              const websiteUrl = CLIENT_WEBSITES[file.name] || `https://www.google.com/search?q=${encodeURIComponent(cleanName + ' agriculture')}`;

              return {
                name: cleanName,
                logoUrl: publicUrl,
                websiteUrl: websiteUrl
              };
          });
          
          setClients(clientData);
        }
      } catch (err) {
        console.error("❌ [PiloTerra] Exception fetchLogos:", err);
      }
    };

    fetchLogos();

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-pilo-cream font-sans overflow-x-hidden relative">
      <style>{`
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-scroll {
          animation: scroll 60s linear infinite;
        }
        .animate-scroll:hover {
          animation-play-state: paused;
        }
      `}</style>
      
      {/* 1. HERO SECTION (Transféré de l'ancienne Home) */}
      <section className="relative pt-12 pb-10 lg:pt-20 lg:pb-16 px-4 overflow-hidden">
        {/* Background Elements */}
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-pilo-green/5 rounded-full blur-3xl animate-blob pointer-events-none"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-pilo-brown/5 rounded-full blur-3xl animate-blob animation-delay-2000 pointer-events-none"></div>

        <div className="max-w-7xl mx-auto text-center relative z-10">
          
          <h1 className="text-6xl md:text-8xl lg:text-9xl font-black mb-4 tracking-tight leading-none animate-in fade-in slide-in-from-bottom-6 duration-700 delay-100">
            <span className="text-pilo-green">Pilo</span><span className="text-pilo-brown">Terra</span>
          </h1>
          
          <AccrocheMarche className="max-w-4xl mx-auto text-2xl md:text-3xl text-slate-600 font-medium mb-3 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-200" />

          {/* CHOIX DU SECTEUR — le sélecteur du header, mis en avant (étape 6) */}
          {choixSecteurVisible && (
            <div className="flex flex-wrap items-center justify-center gap-2 mt-5 mb-8">
              <span className="w-full sm:w-auto text-sm font-bold text-slate-400 uppercase tracking-widest sm:mr-2">
                Votre secteur
              </span>
              {marches.map((m) => {
                const actif = marcheActif === m.code;
                return (
                  <button
                    key={m.code}
                    onClick={() => choisirMarche(actif ? null : m.code)}
                    aria-pressed={actif}
                    className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full border-2 text-base font-bold transition-all ${
                      actif ? 'text-white shadow-lg' : 'bg-white/80 text-slate-700 hover:bg-white'
                    }`}
                    style={{
                      borderColor: m.couleur_accent,
                      backgroundColor: actif ? m.couleur_accent : undefined,
                    }}
                    title={actif ? 'Revenir à tous les marchés' : `Voir le portail ${m.libelle}`}
                  >
                    {!actif && <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: m.couleur_accent }} />}
                    {m.libelle}
                    {actif && <X className="w-4 h-4" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* VALEURS DE LA MARQUE - PLUS GRAND */}
          <div className="flex justify-center mb-8 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-250">
             <PictosValeurs />
          </div>

          <div className="flex flex-wrap justify-center gap-4 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-300">
             <button onClick={() => onNavigate('defi-ia')} className="px-10 py-5 bg-pilo-green text-white rounded-full font-bold text-xl hover:bg-emerald-800 transition-all shadow-xl shadow-emerald-900/20 flex items-center gap-3 transform hover:scale-105 hover:shadow-2xl">
                <Sparkles className="w-6 h-6" />
                Lancer un défi IA
             </button>
          </div>

          <div className="mt-12 pt-6 border-t border-slate-200/60 max-w-4xl mx-auto animate-in fade-in duration-1000 delay-500">
             <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Un projet piloté par</p>
             <div className="flex justify-center transition-all">
                <img 
                  src="https://dgtctavkmcyhqopngcxk.supabase.co/storage/v1/object/public/PiloTerra/logo/BZIIIT_LOGO-HORIZ-COULEUR-svg.svg" 
                  alt="bziiit" 
                  className="h-14 md:h-20 w-auto object-contain"
                />
             </div>
          </div>
        </div>
      </section>

      {/* 2. VISION & MISSION (Qui sommes nous) */}
      <section id="vision" className="py-20 bg-white relative">
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
               <div className="space-y-8 animate-in fade-in slide-in-from-left-8 duration-700 delay-100">
                  <h2 className="text-4xl font-black text-slate-900">Une IA <span className="text-pilo-brown">Responsable, Frugale & Souveraine</span></h2>
                  <div className="bg-slate-50 p-8 rounded-3xl border-l-4 border-pilo-green shadow-sm">
                     <p className="text-lg text-slate-700 leading-relaxed italic">
                        "Notre ambition est de proposer des outils intelligents accessibles à toutes les structures. Pour nous, l'IA{motMarche ? ` appliquée à ${motMarche}` : ''} est un puissant levier pour relever les défis majeurs {motMarche ? 'du secteur' : 'de vos métiers'}."
                     </p>
                  </div>
                  <div className="space-y-4">
                     {[
                        "Réduire la surcharge administrative",
                        "Accélérer la transition écologique",
                        "Garantir la souveraineté numérique"
                     ].map((item, idx) => (
                        <div key={idx} className="flex items-center gap-4 group">
                           <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                              <Target className="w-5 h-5" />
                           </div>
                           <span className="text-xl font-bold text-slate-800">{item}</span>
                        </div>
                     ))}
                  </div>
               </div>
               
               <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-right-8 duration-700 delay-200">
                  <div className="bg-gradient-to-br from-emerald-800 to-emerald-900 p-8 rounded-[2rem] text-white flex flex-col justify-between h-64 shadow-2xl transform rotate-2 hover:rotate-0 transition-transform duration-500">
                     <Leaf className="w-10 h-10 text-emerald-400" />
                     <div>
                        <div className="text-3xl font-black mb-1">Durable</div>
                        <div className="text-emerald-200 text-sm">Impact positif</div>
                     </div>
                  </div>
                  <div className="bg-pilo-cream p-8 rounded-[2rem] border border-pilo-brown/20 flex flex-col justify-between h-64 shadow-lg transform -rotate-2 hover:rotate-0 transition-transform duration-500 mt-12">
                     <Code className="w-10 h-10 text-pilo-brown" />
                     <div>
                        <div className="text-3xl font-black text-slate-900 mb-1">Open Source</div>
                        <div className="text-slate-500 text-sm">Transparence totale</div>
                     </div>
                  </div>
               </div>
            </div>
         </div>
      </section>

      {/* 3. LA TEAM */}
      <section className="py-24 bg-slate-50">
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-4xl font-black text-slate-900 mb-16">La Team <span className="text-pilo-green">PiloTerra</span></h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
               {[
                  { 
                    name: "Laurent TRIPIED", 
                    role: "CEO", 
                    image: "https://dgtctavkmcyhqopngcxk.supabase.co/storage/v1/object/public/PiloTerra/trombi/Laurent%20TRIPIED%20PiloTerra.svg" 
                  },
                  { 
                    name: "David JOULIN", 
                    role: "CTO", 
                    image: "https://dgtctavkmcyhqopngcxk.supabase.co/storage/v1/object/public/PiloTerra/trombi/David%20JOULIN%20PiloTerra.svg" 
                  },
                  { 
                    name: "Cyril DUPLAND", 
                    role: "Responsable développement", 
                    image: "https://dgtctavkmcyhqopngcxk.supabase.co/storage/v1/object/public/PiloTerra/trombi/Cyril%20DUPLAND%20PiloTerra.svg" 
                  },
                  { 
                    name: "Paul ARNON", 
                    role: "Responsable automation IA", 
                    image: "https://dgtctavkmcyhqopngcxk.supabase.co/storage/v1/object/public/PiloTerra/trombi/Paul%20ARNON%20PiloTerra.svg" 
                  }
               ].map((member, idx) => (
                  <div key={idx} className="group bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 hover:shadow-xl hover:-translate-y-2 transition-all duration-300">
                     <div className="w-32 h-32 mx-auto rounded-full mb-6 overflow-hidden bg-pilo-green border-4 border-slate-50 shadow-inner group-hover:scale-110 transition-transform duration-300">
                        <img 
                          src={member.image} 
                          alt={member.name}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover"
                        />
                     </div>
                     <h3 className="text-xl font-bold text-slate-900 mb-2">{member.name}</h3>
                     <p className="text-slate-500 font-medium text-sm uppercase tracking-wide">{member.role}</p>
                  </div>
               ))}
            </div>
         </div>
      </section>

      {/* 3.5. TERRITOIRE (CARTE FRANCE) */}
      <section className="py-24 bg-white relative overflow-hidden">
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col lg:flex-row items-center gap-16">
               
               {/* Texte */}
               <div className="lg:w-1/2 space-y-6">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold uppercase tracking-wider border border-emerald-100">
                     <MapPin className="w-4 h-4" /> Proximité
                  </div>
                  <h2 className="text-4xl font-black text-slate-900 leading-tight">
                     Une présence forte en <span className="text-pilo-brown">Nouvelle-Aquitaine</span> & à <span className="text-pilo-brown">Paris</span>
                  </h2>
                  <p className="text-lg text-slate-600 leading-relaxed">
                     Parce que l'innovation se joue sur le terrain, nous avons choisi de nous implanter au cœur des territoires. 
                     Nos équipes sont réparties sur 5 sites stratégiques pour être au plus près de vos équipes et de vos projets.
                  </p>
                  <ul className="space-y-4 pt-4">
                     <li className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="bg-emerald-600 text-white p-2 rounded-lg"><Building2 className="w-5 h-5" /></div>
                        <div>
                           <span className="block font-bold text-slate-900">Siège Social & R&D</span>
                           <span className="text-sm text-slate-500">Bordeaux (33)</span>
                        </div>
                     </li>
                     <li className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="bg-pilo-brown text-white p-2 rounded-lg"><Users className="w-5 h-5" /></div>
                        <div>
                           <span className="block font-bold text-slate-900">Formation & Accompagnement</span>
                           <span className="text-sm text-slate-500">Pau, Sarlat, Saint-Porchaire, Paris</span>
                        </div>
                     </li>
                  </ul>
               </div>

               {/* Carte Image */}
               <div className="lg:w-1/2 w-full flex justify-center relative">
                  {/* Decorative Blob */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-gradient-to-tr from-emerald-50 to-pilo-brown/5 rounded-full blur-3xl pointer-events-none"></div>
                  
                  <div className="relative w-full max-w-md aspect-square z-10">
                     <img 
                        src="https://dgtctavkmcyhqopngcxk.supabase.co/storage/v1/object/public/PiloTerra/picto/carte_france.png" 
                        alt="Carte implantation PiloTerra"
                        className="w-full h-full object-contain drop-shadow-2xl"
                     />

                     {/* Points */}
                     {LOCATIONS.map((loc, idx) => (
                        <div 
                           key={idx}
                           className="absolute group flex flex-col items-center justify-center cursor-pointer"
                           style={{ top: loc.top, left: loc.left }}
                        >
                           {/* Pulse Effect */}
                           <span className="absolute inline-flex h-6 w-6 rounded-full bg-pilo-green opacity-20 animate-ping group-hover:bg-pilo-brown"></span>
                           {/* Core Dot */}
                           <span className="relative inline-flex rounded-full h-3 w-3 bg-pilo-green border-2 border-white shadow-md group-hover:scale-125 group-hover:bg-pilo-brown transition-all duration-300"></span>
                           
                           {/* Label (Tooltip style) */}
                           <div className="absolute bottom-6 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 pointer-events-none whitespace-nowrap z-20">
                              <div className="bg-slate-900 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-xl relative">
                                 {loc.name}
                                 <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45"></div>
                              </div>
                           </div>
                        </div>
                     ))}
                  </div>
               </div>

            </div>
         </div>
      </section>

      {/* 4. TARGET AUDIENCE (A qui est destiné ce portail) */}
      <section className="py-32 bg-emerald-900 text-white relative overflow-hidden">
         <div className="absolute inset-0 opacity-10 pointer-events-none">
            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M0 100 C 50 0 50 100 100 0 Z" fill="white" /></svg>
         </div>
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
            <h2 className="text-4xl md:text-5xl font-black mb-6">À qui est destiné ce portail IA ?</h2>

            {vitrinePublics ? (
               /* Vitrine : les publics de chaque marché, côte à côte (étape 6) */
               <>
                  <p className="text-emerald-200 text-xl font-medium mb-16">
                     Aux professionnels {marchesAvecPublics
                        .map((m) => `de ${m.mot_accroche || m.libelle.toLowerCase()}`)
                        .join(', ')
                        .replace(/, (?=[^,]*$)/, ' et ')}.
                  </p>
                  <div className={`grid grid-cols-1 gap-6 text-left ${marchesAvecPublics.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
                     {marchesAvecPublics.map((m) => (
                        <div
                           key={m.code}
                           className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-6 shadow-xl border-t-4"
                           style={{ borderTopColor: m.couleur_accent }}
                        >
                           <button
                              onClick={() => choixSecteurVisible && choisirMarche(m.code)}
                              disabled={!choixSecteurVisible}
                              className="flex items-center gap-2 text-2xl font-black mb-1 enabled:hover:underline disabled:cursor-default"
                           >
                              <span className="w-3 h-3 rounded-full ring-2 ring-white/60" style={{ backgroundColor: m.couleur_accent }} />
                              {m.libelle}
                           </button>
                           {m.publics_intro && <p className="text-emerald-200 text-sm mb-5">{m.publics_intro}</p>}
                           <ul className="space-y-2">
                              {(m.publics || []).map((p, idx) => {
                                 const Picto = pictoPublic(p.icone);
                                 return (
                                    <li key={idx} className="flex items-center gap-3 bg-white/5 rounded-xl px-3 py-2.5">
                                       <Picto className="w-5 h-5 text-pilo-cream shrink-0" />
                                       <span className="font-bold text-sm leading-tight">{p.libelle}</span>
                                    </li>
                                 );
                              })}
                           </ul>
                        </div>
                     ))}
                  </div>
               </>
            ) : (
               /* Un marché affiché (ou référentiel sans publics) : ses publics en cartes */
               (() => {
                  const intro = publicsDuMarche?.publics_intro || (publicsDuMarche ? '' : PUBLICS_REPLI.intro);
                  const liste = publicsDuMarche?.publics || PUBLICS_REPLI.publics;
                  return (
                     <>
                        {intro && <p className="text-emerald-200 text-xl font-medium mb-16">{intro}</p>}
                        <div className="flex flex-wrap justify-center gap-8">
                           {liste.map((p, idx) => {
                              const Picto = pictoPublic(p.icone);
                              return (
                                 <div key={idx} className="bg-white/10 backdrop-blur-md border border-white/20 p-8 rounded-3xl flex flex-col items-center gap-6 w-48 hover:bg-white/20 transition-all duration-300 transform hover:scale-105 shadow-xl">
                                    <Picto className="w-10 h-10 text-pilo-cream" />
                                    <span className="font-bold text-base leading-tight">{p.libelle}</span>
                                 </div>
                              );
                           })}
                        </div>
                     </>
                  );
               })()
            )}
         </div>
      </section>

      {/* 5. OFFRES & PRICING */}
      <section id="offers" className="py-24 bg-white">
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
               <h2 className="text-4xl font-black text-slate-900 mb-4">Nos Offres <span className="text-pilo-green">Cloud & On-Premise</span></h2>
               <p className="text-slate-500 max-w-2xl mx-auto">Des solutions adaptées à votre infrastructure et à vos besoins de souveraineté.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
               {/* Cloud Starter */}
               <div className="bg-slate-50 rounded-3xl p-8 border border-slate-200 flex flex-col hover:border-emerald-300 transition-colors">
                  <div className="mb-4">
                     <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Cloud</span>
                     <h3 className="text-2xl font-black text-slate-900">Starter</h3>
                  </div>
                  <div className="mb-6">
                     <div className="text-3xl font-black text-emerald-600">10k€ <span className="text-sm text-slate-500 font-medium">/ setup</span></div>
                     <div className="text-lg font-bold text-slate-700">+ 75€ <span className="text-xs text-slate-400 font-normal">/ user / an</span></div>
                  </div>
                  <ul className="space-y-3 mb-8 flex-grow text-sm text-slate-600">
                     <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Formation IA</li>
                     <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Chatbot personnel</li>
                     <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> 1 Agent</li>
                     <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Support email</li>
                     <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> 20 M tokens</li>
                  </ul>
                  <button onClick={handleOpenCalendly} className="w-full py-3 rounded-xl border border-slate-300 font-bold hover:bg-white transition-colors">Détails</button>
               </div>

               {/* Cloud Entreprise */}
               <div className="bg-white rounded-3xl p-8 border-2 border-emerald-500 shadow-xl relative flex flex-col transform md:-translate-y-4">
                  <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl rounded-tr-xl uppercase">Populaire</div>
                  <div className="mb-4">
                     <span className="text-xs font-bold uppercase tracking-widest text-emerald-600">Cloud</span>
                     <h3 className="text-2xl font-black text-slate-900">Entreprise</h3>
                  </div>
                  <div className="mb-6">
                     <div className="text-3xl font-black text-emerald-600">25k€ <span className="text-sm text-slate-500 font-medium">/ setup</span></div>
                     <div className="text-lg font-bold text-slate-700">+ 120€ <span className="text-xs text-slate-400 font-normal">/ user / an</span></div>
                  </div>
                  <ul className="space-y-3 mb-8 flex-grow text-sm text-slate-600">
                     <li className="font-bold text-emerald-700">Tout l'offre Starter +</li>
                     <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> 2 Agents</li>
                     <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Formation n8n</li>
                     <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> App n8n privée</li>
                     <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> 40 M tokens</li>
                  </ul>
                  <button onClick={handleOpenCalendly} className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20">Choisir</button>
               </div>

               {/* Cloud Premium */}
               <div className="bg-slate-50 rounded-3xl p-8 border border-slate-200 flex flex-col hover:border-emerald-300 transition-colors">
                  <div className="mb-4">
                     <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Cloud</span>
                     <h3 className="text-2xl font-black text-slate-900">Premium</h3>
                  </div>
                  <div className="mb-6">
                     <div className="text-3xl font-black text-emerald-600">45k€ <span className="text-sm text-slate-500 font-medium">/ setup</span></div>
                     <div className="text-lg font-bold text-slate-700">+ 189€ <span className="text-xs text-slate-400 font-normal">/ user / an</span></div>
                  </div>
                  <ul className="space-y-3 mb-8 flex-grow text-sm text-slate-600">
                     <li className="font-bold text-emerald-700">Tout l'offre Entreprise +</li>
                     <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> 5 Agents</li>
                     <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Modèle IA privé</li>
                     <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Support prioritaire</li>
                     <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> 80 M tokens</li>
                  </ul>
                  <button onClick={handleOpenCalendly} className="w-full py-3 rounded-xl border border-slate-300 font-bold hover:bg-white transition-colors">Détails</button>
               </div>

               {/* On Premise */}
               <div className="bg-slate-900 rounded-3xl p-8 border border-slate-800 text-white flex flex-col relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all"></div>
                  <div className="mb-4 relative z-10">
                     <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">Souveraineté</span>
                     <h3 className="text-2xl font-black">On Premise</h3>
                  </div>
                  <div className="mb-6 relative z-10">
                     <div className="text-3xl font-black text-white">7,5k€</div>
                     <div className="text-sm text-slate-400">+ 1,5k€ Formation</div>
                  </div>
                  <ul className="space-y-3 mb-8 flex-grow text-sm text-slate-300 relative z-10">
                     <li className="flex gap-2"><Server className="w-4 h-4 text-emerald-400 shrink-0" /> Setup sur votre infra</li>
                     <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> Agents illimités</li>
                     <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> App n8n privée</li>
                     <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> Modèle IA privé</li>
                     <li className="flex gap-2"><Calendar className="w-4 h-4 text-emerald-400 shrink-0" /> Dispo Juin 2026</li>
                  </ul>
                  <button onClick={handleOpenCalendly} className="w-full py-3 rounded-xl bg-white/10 text-white font-bold hover:bg-white/20 transition-colors relative z-10">Pré-commander</button>
               </div>
            </div>
            
            <div className="mt-8 text-center">
              <span className="inline-flex items-center gap-2 px-4 py-2 bg-pilo-green/10 text-pilo-green rounded-lg text-sm font-bold border border-pilo-green/20">
                <Globe className="w-4 h-4" /> AI Act Compliant (EU)
              </span>
            </div>
         </div>
      </section>

      {/* 5.5. CLIENTS / REFERENCES CAROUSEL */}
<section className="py-24 bg-emerald-900 border-t border-slate-800 overflow-hidden">
  <div className="text-center mb-16">
    <h2 className="text-3xl font-black text-white">Ils nous font <span className="text-emerald-400">confiance</span></h2>
  </div>
  
  {clients.length > 0 && (
    <div className="relative w-full overflow-hidden">
      <div className="absolute top-0 left-0 h-full w-48 bg-gradient-to-r from-emerald-900 to-transparent z-10 pointer-events-none"></div>
      <div className="absolute top-0 right-0 h-full w-48 bg-gradient-to-l from-emerald-900 to-transparent z-10 pointer-events-none"></div>
      
      <div className="flex w-max animate-scroll hover:pause">
        {/* Premier Set - MODIFIÉ : gap-10 au lieu de gap-24 */}
        <div className="flex items-center gap-10 px-5">
          {clients.map((client, idx) => (
            <a 
              key={`client-1-${idx}`} 
              href={client.websiteUrl}
              target="_blank" 
              rel="noopener noreferrer"
              /* MODIFIÉ : h-48 w-80 (plus grand) */
              className="h-48 w-80 flex items-center justify-center relative group"
            >
              <img 
                src={client.logoUrl} 
                alt={client.name} 
                /* MODIFIÉ : max-h-40 (plus grand) */
                className="max-h-40 max-w-full object-contain transition-all duration-300 opacity-50 group-hover:opacity-100 group-hover:scale-110" 
              />
              
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 pointer-events-none whitespace-nowrap z-20">
                  <div className="bg-white text-slate-900 text-xs font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1">
                      {client.name} <ExternalLink className="w-3 h-3 text-emerald-600" />
                  </div>
              </div>
            </a>
          ))}
        </div>

        {/* Second Set (Duplicate) - MODIFIÉ : gap-10 et px-5 pour matcher le premier */}
        <div className="flex items-center gap-10 px-5">
          {clients.map((client, idx) => (
            <a 
              key={`client-2-${idx}`} 
              href={client.websiteUrl}
              target="_blank" 
              rel="noopener noreferrer"
              className="h-48 w-80 flex items-center justify-center relative group"
            >
              <img 
                src={client.logoUrl} 
                alt={client.name} 
                className="max-h-40 max-w-full object-contain transition-all duration-300 opacity-50 group-hover:opacity-100 group-hover:scale-110" 
              />
              
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 pointer-events-none whitespace-nowrap z-20">
                  <div className="bg-white text-slate-900 text-xs font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1">
                      {client.name} <ExternalLink className="w-3 h-3 text-emerald-600" />
                  </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  )}
</section>

      {/* 6. CONTACT CTA (Re-numbered) */}
      <section className="py-24 bg-white relative overflow-hidden border-t border-slate-100">
         <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
            <h2 className="text-4xl font-black text-slate-900 mb-6">Un projet IA ?</h2>
            <p className="text-xl text-slate-600 mb-10">
               Prenez rendez-vous pour une démo de notre portail IA ou de nos solutions.
            </p>
            
            <div className="flex flex-col md:flex-row items-center justify-center gap-6">
               <a 
                  href="https://calendly.com/laurent-bziiit" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="px-8 py-4 bg-emerald-600 text-white rounded-full font-black text-lg hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-600/20 flex items-center gap-2 transform hover:scale-105"
               >
                  <Calendar className="w-5 h-5" />
                  Prendre RDV (Calendly)
               </a>
               <a 
                  href="tel:0670761499"
                  className="px-8 py-4 bg-white border-2 border-slate-200 text-slate-700 rounded-full font-bold text-lg hover:border-emerald-500 hover:text-emerald-600 transition-all flex items-center gap-2"
               >
                  <Phone className="w-5 h-5" />
                  06 70 76 14 99
               </a>
            </div>
         </div>
      </section>

      {/* MODALE CALENDLY */}
      {isCalendlyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-4xl h-[90vh] rounded-2xl overflow-hidden shadow-2xl relative flex flex-col animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-600" />
                Prendre un rendez-vous
              </h3>
              <button 
                onClick={() => setIsCalendlyOpen(false)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X className="w-6 h-6 text-slate-500" />
              </button>
            </div>
            <div className="flex-grow bg-white relative">
               <iframe 
                 src="https://calendly.com/laurent-bziiit/entretien-ia"
                 className="w-full h-full border-0"
                 title="Calendly Rendez-vous"
               />
            </div>
          </div>
        </div>
      )}

      {/* PROMO POPUP - Appears after 10s */}
      {showPromoPopup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-500">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative animate-in zoom-in-95 duration-500 border border-white/20">
                {/* Decoration */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-pilo-green to-pilo-brown"></div>
                
                <button 
                    onClick={() => setShowPromoPopup(false)} 
                    className="absolute top-3 right-3 p-1.5 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500 transition-colors z-10"
                >
                    <X className="w-4 h-4" />
                </button>

                <div className="p-8 text-center">
                    <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5 shadow-sm">
                        <Sparkles className="w-8 h-8 text-emerald-600" />
                    </div>
                    
                    <h3 className="text-2xl font-black text-slate-900 mb-3 leading-tight">
                        Passez de l'idée à l'action
                    </h3>
                    
                    <p className="text-slate-600 mb-8 leading-relaxed">
                        Ne repartez pas sans votre diagnostic personnalisé. Identifiez en 3 minutes comment l'IA peut servir votre organisation.
                    </p>

                    <button 
                        onClick={handleLaunchDefi}
                        className="w-full py-4 bg-pilo-brown text-white font-bold rounded-xl shadow-lg hover:bg-[#8a6310] transition-all transform hover:scale-[1.02] flex items-center justify-center gap-2 group"
                    >
                        Lancer mon Défi IA Gratuit
                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </button>
                    
                    <button 
                        onClick={() => setShowPromoPopup(false)}
                        className="mt-4 text-xs font-bold text-slate-400 hover:text-slate-600 underline"
                    >
                        Non merci, je continue ma visite
                    </button>
                </div>
            </div>
        </div>
      )}

      <FicheDefiModal
        ouvert={ficheDefiOuverte}
        onFermer={() => setFicheDefiOuverte(false)}
        session={session}
        sessionFormationId={activeSessionId}
      />
    </div>
  );
};