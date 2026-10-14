
import React, { useState, useEffect } from 'react';
import { X, Send, LifeBuoy, Loader2, CheckCircle2, MessageSquare, AlertCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { N8N } from '../n8nConfig';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: any;
}

export const SupportModal: React.FC<SupportModalProps> = ({ isOpen, onClose, session }) => {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // États pour les utilisateurs non connectés ou si on veut forcer l'email
  const [emailContact, setEmailContact] = useState('');

  useEffect(() => {
    if (isOpen) {
      // Reset states on open
      setMessage('');
      setSent(false);
      setError(null);
      if (session?.user?.email) {
        setEmailContact(session.user.email);
      } else {
        setEmailContact('');
      }
    }
  }, [isOpen, session]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    
    setLoading(true);
    setError(null);

    try {
      // Récupération des infos utilisateur enrichies si possible
      let userDetails = {
        prenom: '',
        nom: '',
        entreprise: ''
      };

      if (session?.user?.id) {
        const { data } = await supabase
          .from('utilisateurs')
          .select('prenom, nom, entreprise')
          .eq('auth_id', session.user.id)
          .single();
        
        if (data) {
            userDetails = data;
        }
      }

      // Sécurisation de l'email : priorité à la session, sinon le champ formulaire
      const finalEmail = session?.user?.email || emailContact;

      const payload = {
        message: message,
        email: finalEmail,
        user_id: session?.user?.id || 'visitor',
        nom_complet: `${userDetails.prenom || ''} ${userDetails.nom || ''}`.trim(),
        entreprise: userDetails.entreprise || '',
        page_url: window.location.href,
        date: new Date().toISOString()
      };

      // Envoi au Webhook n8n
      // Note: On utilise 'no-cors' et 'text/plain' pour éviter les erreurs CORS (Failed to fetch)
      await fetch(N8N.support, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: JSON.stringify(payload),
      });

      setSent(true);
      setTimeout(() => {
          onClose();
      }, 2500);

    } catch (err: any) {
      console.error("Erreur support:", err);
      // Gestion spécifique des erreurs réseau (CORS, offline, etc.)
      if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
         setError("Impossible de joindre le serveur. Vérifiez votre connexion ou contactez info@bziiit.com (Erreur CORS/Réseau).");
      } else {
         setError(err.message || "Une erreur est survenue lors de l'envoi.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden relative animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-800 to-emerald-900 p-6 flex justify-between items-start text-white shrink-0">
            <div className="flex gap-4">
                <div className="bg-white/10 p-2 rounded-xl h-fit">
                    <LifeBuoy className="w-6 h-6 text-emerald-300" />
                </div>
                <div>
                    <h2 className="text-xl font-bold">Centre de Support</h2>
                    <p className="text-emerald-100 text-xs opacity-90 mt-1">
                        Signaler un bug, une difficulté ou poser une question.
                    </p>
                </div>
            </div>
            <button 
                onClick={onClose} 
                className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-1.5 rounded-full transition-colors"
            >
                <X className="w-5 h-5" />
            </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto">
            {sent ? (
                <div className="flex flex-col items-center justify-center py-8 text-center animate-in fade-in slide-in-from-bottom-2">
                    <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                        <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">Message envoyé !</h3>
                    <p className="text-slate-600">Notre équipe a bien reçu votre demande.<br/>Nous vous répondrons par email dans les plus brefs délais.</p>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Si pas connecté, on demande l'email */}
                    {!session?.user && (
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Votre Email <span className="text-red-500">*</span></label>
                            <input 
                                type="email" 
                                required
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                                placeholder="nom@exemple.com"
                                value={emailContact}
                                onChange={(e) => setEmailContact(e.target.value)}
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Votre message <span className="text-red-500">*</span></label>
                        <div className="relative">
                            <textarea 
                                required
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all min-h-[120px] resize-none text-slate-700"
                                placeholder="Décrivez votre problème ou votre question ici..."
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                            />
                            <MessageSquare className="absolute right-3 bottom-3 w-4 h-4 text-slate-300 pointer-events-none" />
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 text-right">
                            Les informations techniques de votre profil seront jointes automatiquement.
                        </p>
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-start gap-2 break-words">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="pt-2 flex justify-end gap-3">
                        <button 
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors"
                        >
                            Annuler
                        </button>
                        <button 
                            type="submit"
                            disabled={loading || !message.trim() || (!session?.user && !emailContact)}
                            className="px-6 py-2.5 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            Envoyer le ticket
                        </button>
                    </div>
                </form>
            )}
        </div>
      </div>
    </div>
  );
};
