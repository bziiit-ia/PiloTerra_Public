import React, { useState, useRef, useEffect } from 'react';
import { Menu, X, UserCircle, ChevronDown, Shield, Sparkles, LayoutGrid, Info, Newspaper, Building2 } from 'lucide-react';
import { Page, UserRole } from '../types';
import { SelecteurMarche } from './SelecteurMarche';


interface HeaderProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  isLoggedIn: boolean;
  userRole?: UserRole;
}

export const Header: React.FC<HeaderProps> = ({ currentPage, onNavigate, isLoggedIn, userRole = 'user' }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navItems = [
    { label: 'Accueil', page: 'home' as Page },
    { label: 'Actualité IA', page: 'news' as Page, icon: <Newspaper className="w-3 h-3 text-pilo-green" /> },
    { label: 'Votre Défi IA', page: 'defi-ia' as Page, icon: <Sparkles className="w-3 h-3 text-pilo-brown" /> },
    {
      label: 'Ressources',
      id: 'catalog-menu',
      subItems: [
        { label: 'Catalogue Outils', page: 'catalog' as Page, desc: 'Explorer les solutions IA' },
        { label: 'Agents IA', page: 'agents-ia' as Page, desc: 'Agents IA open source' },
        { label: "Cas d'usages", page: 'usecases' as Page, desc: 'Exemples concrets' },
        { label: 'Bibliothèque de prompts', page: 'prompts' as Page, desc: 'Prompts prêts à l\'emploi' },
        { label: "Données ouvertes", page: 'data-agri' as Page, desc: 'Jeux de données & Open Data' },
      ]
    },
    { 
      label: 'Formation IA', 
      id: 'formation-menu',
      subItems: [
        { label: 'Nos formations', page: 'formation-presentiel' as Page, desc: 'Ateliers & Rencontres' },
        { label: 'E-learning', page: 'elearning' as Page, desc: 'Tutoriels & Vidéos' },
      ]
    },
  ];

  const handleNavClick = (page: Page) => {
    onNavigate(page);
    setIsMenuOpen(false);
    setActiveDropdown(null);
  };

  const toggleDropdown = (id: string) => {
    setActiveDropdown(activeDropdown === id ? null : id);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <>
      {/* Floating Island Navigation */}
      <header 
        className={`fixed top-4 left-1/2 -translate-x-1/2 w-[95%] max-w-[88rem] z-50 transition-all duration-500 ease-out`}
      >
        <div className={`
          relative rounded-full px-4 2xl:px-6 py-3 flex justify-between items-center gap-2 transition-all duration-500
          ${scrolled || isMenuOpen ? 'glass-nav shadow-lg' : 'bg-white/40 backdrop-blur-sm border border-white/30'}
        `}>
          
          {/* Logo Section */}
          <div 
            className="flex-shrink-0 flex items-center cursor-pointer group"
            onClick={() => handleNavClick('home')}
          >
            <div className="relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-pilo-green to-pilo-brown rounded-full blur opacity-0 group-hover:opacity-30 transition duration-500"></div>
                <img 
                  src="https://dgtctavkmcyhqopngcxk.supabase.co/storage/v1/object/public/PiloTerra/logo/logo%20PiloTerra.png" 
                  alt="PiloTerra" 
                  className="h-10 w-auto object-contain relative z-10"
                />
            </div>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden xl:flex items-center gap-1 2xl:gap-2 flex-nowrap" ref={navRef}>
            {navItems.map((item) => (
              'subItems' in item ? (
                <div key={item.label} className="relative group/dropdown">
                  <button
                    onClick={() => toggleDropdown(item.id!)}
                    className={`
                      flex items-center gap-1.5 px-3 2xl:px-5 py-2.5 rounded-full text-[15px] 2xl:text-base font-medium whitespace-nowrap transition-all duration-300
                      ${activeDropdown === item.id 
                        ? 'bg-pilo-green/10 text-pilo-green' 
                        : 'text-slate-600 hover:text-pilo-green hover:bg-white/50'}
                    `}
                  >
                    {item.label}
                    <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${activeDropdown === item.id ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {/* Mega Menu Dropdown */}
                  <div className={`
                    absolute left-1/2 -translate-x-1/2 top-full mt-4 w-72 p-2 
                    bg-white/95 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl 
                    transform transition-all duration-200 origin-top
                    ${activeDropdown === item.id ? 'opacity-100 scale-100 translate-y-0 visible' : 'opacity-0 scale-95 -translate-y-2 invisible'}
                  `}>
                    <div className="flex flex-col gap-1">
                      {item.subItems!.map(sub => (
                        <button
                          key={sub.page}
                          onClick={() => handleNavClick(sub.page)}
                          className={`
                            group/item text-left px-5 py-3.5 rounded-xl transition-all duration-200
                            ${currentPage === sub.page ? 'bg-pilo-light' : 'hover:bg-slate-50'}
                          `}
                        >
                          <div className={`font-bold text-base ${currentPage === sub.page ? 'text-pilo-green' : 'text-slate-800 group-hover/item:text-pilo-green'}`}>
                            {sub.label}
                          </div>
                          <div className="text-xs text-slate-400 font-medium mt-0.5">
                            {sub.desc}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  key={item.page}
                  onClick={() => handleNavClick(item.page as Page)}
                  className={`
                    flex items-center gap-2 px-3 2xl:px-5 py-2.5 rounded-full text-[15px] 2xl:text-base font-medium whitespace-nowrap transition-all duration-300 relative
                    ${currentPage === item.page 
                      ? 'text-pilo-green bg-white shadow-sm' 
                      : 'text-slate-600 hover:text-pilo-green hover:bg-white/50'}
                  `}
                >
                  {item.icon}
                  {item.label}
                  {currentPage === item.page && (
                    <span className="absolute inset-0 rounded-full border border-pilo-green/10 pointer-events-none"></span>
                  )}
                </button>
              )
            ))}
          </nav>

          {/* Right Actions */}
          <div className="hidden xl:flex items-center gap-2 2xl:gap-3 flex-shrink-0">
            {/* Multi-marché : ne rend rien tant que MULTI_MARCHE_ACTIF vaut false */}
            <SelecteurMarche />

            {isLoggedIn && (userRole === 'super_admin' || userRole === 'admin_coop' || userRole === 'user' || userRole === 'member_orga') && (
              <button
                onClick={() => handleNavClick('admin-organisation')}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:scale-105 transition-all"
                title={userRole === 'user' || userRole === 'member_orga' ? "Mon Organisation" : "Admin Organisation"}
              >
                <Building2 className="w-5 h-5" />
              </button>
            )}
            {isLoggedIn && userRole === 'super_admin' && (
              <button
                onClick={() => handleNavClick('super-admin')}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-red-50 text-red-600 hover:bg-red-100 hover:scale-105 transition-all"
                title="Super Admin"
              >
                <Shield className="w-5 h-5" />
              </button>
            )}

            <button 
              onClick={() => handleNavClick('dashboard')}
              className={`
                flex items-center gap-2 px-5 2xl:px-6 py-2.5 2xl:py-3 rounded-full text-[15px] 2xl:text-base font-bold whitespace-nowrap transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-0.5
                ${isLoggedIn 
                  ? 'bg-slate-900 text-white hover:bg-slate-800' 
                  : 'bg-gradient-to-r from-pilo-green to-emerald-700 text-white'}
              `}
            >
              <UserCircle className="w-5 h-5" />
              {isLoggedIn ? 'Mon Espace' : 'Connexion'}
            </button>
          </div>

          {/* Mobile Toggle */}
          <div className="xl:hidden flex items-center">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu Overlay */}
        {isMenuOpen && (
          <div className="xl:hidden absolute top-full left-0 w-full mt-2 p-4 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-4 space-y-2">
              {/* Multi-marché : ne rend rien tant que MULTI_MARCHE_ACTIF vaut false */}
              <div className="border-b border-slate-100 pb-2 mb-2 empty:hidden">
                <SelecteurMarche variante="mobile" />
              </div>

              {navItems.map((item) => (
                <div key={item.label || item.id} className="border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                  {'subItems' in item ? (
                    <div className="space-y-1">
                      <div className="px-4 py-2 text-xs font-black text-pilo-green uppercase tracking-widest opacity-70">
                        {item.label}
                      </div>
                      <div className="grid grid-cols-1 gap-1">
                        {item.subItems!.map(sub => (
                          <button
                            key={sub.page}
                            onClick={() => handleNavClick(sub.page)}
                            className="text-left px-4 py-3 rounded-xl text-slate-700 font-medium hover:bg-slate-50 transition-colors flex items-center justify-between group text-base"
                          >
                            {sub.label}
                            <ArrowIcon className="opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleNavClick(item.page as Page)}
                      className={`w-full text-left px-4 py-3 rounded-xl font-bold flex items-center gap-3 text-base ${
                        currentPage === item.page ? 'bg-pilo-light text-pilo-green' : 'text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      {item.icon}
                      {item.label}
                    </button>
                  )}
                </div>
              ))}
              
              {/* Mobile Actions */}
              <div className="pt-4 grid grid-cols-2 gap-3">
                  {isLoggedIn && (userRole === 'super_admin' || userRole === 'admin_coop' || userRole === 'user' || userRole === 'member_orga') && (
                    <button onClick={() => handleNavClick('admin-organisation')} className="flex items-center justify-center gap-2 py-3 bg-indigo-50 text-indigo-600 font-bold rounded-2xl">
                       <Building2 className="w-5 h-5" /> {userRole === 'user' || userRole === 'member_orga' ? 'Mon Org' : 'Org Admin'}
                    </button>
                 )}
                 {isLoggedIn && userRole === 'super_admin' && (
                    <button onClick={() => handleNavClick('super-admin')} className="flex items-center justify-center gap-2 py-3 bg-red-50 text-red-600 font-bold rounded-2xl">
                       <Shield className="w-5 h-5" /> Super Admin
                    </button>
                 )}
                 <button 
                    onClick={() => handleNavClick('dashboard')}
                    className={`col-span-${isLoggedIn && (userRole === 'super_admin' || userRole === 'admin_coop' || userRole === 'member_orga') ? '1' : '2'} flex items-center justify-center gap-2 py-3 bg-slate-900 text-white font-bold rounded-2xl shadow-lg text-base`}
                 >
                    <UserCircle className="w-5 h-5" /> {isLoggedIn ? 'Compte' : 'Connexion'}
                 </button>
              </div>
            </div>
          </div>
        )}
      </header>
      
      {/* Spacer to prevent content from hiding behind fixed header */}
      <div className="h-24"></div>
    </>
  );
};

const ArrowIcon = ({ className }: { className?: string }) => (
  <svg className={`w-4 h-4 text-pilo-green ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);
