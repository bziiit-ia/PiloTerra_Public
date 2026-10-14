
import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Page } from '../types';
import { URL_CODE_SOURCE } from '../constants';
import { useMarche } from './MarcheContext';

interface FooterProps {
  onNavigate?: (page: Page) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  // Phrase fixe du marché affiché ; en vitrine, la promesse sans marché.
  const { baseline } = useMarche();
  return (
    <footer className="bg-emerald-900 text-white py-12 border-t border-emerald-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          
          {/* Brand & Qualiopi */}
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="flex items-center gap-1 text-2xl font-black">
                 <span>Pilo</span><span className="text-pilo-brown">Terra</span>
              </div>
              <p className="text-emerald-100 text-sm max-w-xs">
                {baseline}.
              </p>
            </div>

            {/* Qualiopi Certification */}
            <div>
                <a 
                  href="https://certifopac.fr/qualiopi/certification/verification/?siren=813829876"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-white p-3 rounded-lg shadow-md hover:scale-105 transition-transform duration-300"
                  title="Vérifier la certification Qualiopi de bziiit"
                >
                   <img 
                     src="https://dgtctavkmcyhqopngcxk.supabase.co/storage/v1/object/public/PiloTerra/logo_formation/Qualiopi%20bziiit.png" 
                     alt="Qualiopi Processus Certifié" 
                     className="h-16 w-auto"
                   />
                </a>
                <p className="text-[10px] text-emerald-200/80 mt-2 max-w-xs leading-tight">
                   La certification qualité a été délivrée au titre de la catégorie d'action suivante : <br/>
                   <span className="font-bold text-emerald-100">ACTIONS DE FORMATION</span>
                </p>
            </div>
          </div>

          {/* Links */}
          <div className="space-y-4 md:text-right">
            <h4 className="text-emerald-200 font-bold uppercase tracking-widest text-xs">Liens Rapides</h4>
            <ul className="space-y-2 text-sm">
              <li>
                  <a 
                    href="https://dgtctavkmcyhqopngcxk.supabase.co/storage/v1/object/public/PiloTerra/documents/Charte_IA_bziiit.pdf"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-pilo-brown transition-colors font-medium text-emerald-100"
                  >
                    Notre Charte IA
                  </a>
              </li>
              <li>
                  <button 
                    onClick={() => {
                        if (onNavigate) {
                            onNavigate('home');
                            setTimeout(() => {
                                const el = document.getElementById('offers');
                                if (el) el.scrollIntoView({ behavior: 'smooth' });
                            }, 100);
                        }
                    }} 
                    className="hover:text-pilo-brown transition-colors"
                  >
                    Nos Offres
                  </button>
              </li>
              <li>
                  <a 
                    href="https://piloterra.fr/#cgu"
                    className="hover:text-pilo-brown transition-colors"
                  >
                    Mentions légales / CGU
                  </a>
              </li>
              <li>
                  <a 
                    href="https://dgtctavkmcyhqopngcxk.supabase.co/storage/v1/object/public/PiloTerra/documents/Reglement%20jeu%20concours.pdf"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-pilo-brown transition-colors"
                  >
                    Règlement jeu concours
                  </a>
              </li>
            </ul>
          </div>

        </div>
        
        <div className="border-t border-emerald-800 pt-8 text-center text-xs text-emerald-200/60 flex flex-col md:flex-row justify-center gap-4">
          {/* Licence AGPL-3.0 : le lien vers le code source doit rester
              visible de tout utilisateur du portail (article 13). */}
          <span>&copy; {new Date().getFullYear()} bziiit SAS. PiloTerra est un logiciel libre sous licence AGPL-3.0.</span>
          <a
            href={URL_CODE_SOURCE}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-pilo-brown transition-colors"
          >
            Code source
          </a>
        </div>
      </div>
    </footer>
  );
};