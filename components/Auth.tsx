
import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Mail, Lock, Loader2, ArrowRight, RefreshCw, ChevronLeft } from 'lucide-react';
import { Page } from '../types';

interface AuthProps {
  onNavigate?: (page: Page) => void;
}

type AuthMode = 'login' | 'signup' | 'reset';

export const Auth: React.FC<AuthProps> = ({ onNavigate }) => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<AuthMode>('login');
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (mode === 'signup') {
        const cleanEmail = email.trim().toLowerCase();
        
        // Création du compte Auth (Le trigger DB créera la ligne dans 'utilisateurs')
        const { data: authData, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              email: cleanEmail
            }
          }
        });
        if (error) throw error;

        // On ne gère plus les invitations coopératives ici
        // Un utilisateur s'inscrit simplement
        setMessage({ type: 'success', text: 'Inscription réussie ! Vérifiez votre email pour confirmer votre compte.' });

      } else if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          if (error.message === 'Invalid login credentials') {
            throw new Error('Mauvaise combinaison utilisateur / mot de passe');
          }
          throw error;
        }
        if (onNavigate) onNavigate('dashboard');
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}`,
        });
        if (error) throw error;
        setMessage({ type: 'success', text: 'Un email de réinitialisation a été envoyé à votre adresse.' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Une erreur est survenue' });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}`,
          skipBrowserRedirect: true
        }
      });
      if (error) throw error;
      
      if (data?.url) {
        // Ouvre l'URL d'authentification dans un popup pour éviter le blocage de l'iframe par Google
        const authWindow = window.open(data.url, 'oauth_popup', 'width=600,height=700');
        if (!authWindow) {
          throw new Error("Le popup a été bloqué par votre navigateur. Veuillez autoriser les popups ou ouvrir l'application dans un nouvel onglet.");
        }
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Une erreur est survenue avec Google' });
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    if (mode === 'signup') return 'Créer un compte';
    if (mode === 'reset') return 'Réinitialiser le mot de passe';
    return 'Accéder à PiloTerra';
  };

  const getDescription = () => {
    if (mode === 'signup') return 'Identifiez-vous pour utiliser les outils et accéder à vos projets.';
    if (mode === 'reset') return 'Saisissez votre email pour recevoir un lien de récupération.';
    return 'Identifiez-vous pour utiliser les outils et accéder à vos projets.';
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-slate-800">
            {getTitle()}
          </h2>
          <p className="text-slate-500 text-sm mt-2">
            {getDescription()}
          </p>
        </div>

        {message && (
          <div className={`p-4 rounded-lg mb-6 text-sm flex flex-col gap-2 ${
            message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-green-50 text-green-700 border border-green-100'
          }`}>
            <p>{message.text}</p>
            {message.type === 'error' && mode === 'login' && (
              <button 
                onClick={() => { setMode('reset'); setMessage(null); }}
                className="text-xs font-bold underline text-left hover:text-red-900 transition-colors"
              >
                Réinitialiser le mot de passe ?
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          {mode !== 'reset' && (
            <div className="mb-6">
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Continuer avec Google
              </button>
              
              <div className="relative mt-6 mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-slate-500">Ou avec votre email</span>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email professionnel</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                placeholder="votre@email.com"
              />
            </div>
          </div>

          {mode !== 'reset' && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-slate-700">Mot de passe</label>
                {mode === 'login' && (
                  <button 
                    type="button"
                    onClick={() => { setMode('reset'); setMessage(null); }}
                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                  >
                    Oublié ?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-6"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                {mode === 'signup' ? "S'inscrire" : mode === 'reset' ? "Envoyer le lien" : "Se connecter"}
                {mode === 'reset' ? <RefreshCw className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center pt-6 border-t border-slate-100 space-y-3">
          {mode === 'reset' ? (
            <button
              onClick={() => { setMode('login'); setMessage(null); }}
              className="flex items-center justify-center gap-2 w-full text-sm font-semibold text-slate-600 hover:text-emerald-600 transition-all"
            >
              <ChevronLeft className="w-4 h-4" /> Retour à la connexion
            </button>
          ) : (
            <p className="text-sm text-slate-600">
              {mode === 'signup' ? "Déjà un compte ?" : "Pas encore de compte ?"}
              <button
                onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setMessage(null); }}
                className="ml-2 font-semibold text-emerald-600 hover:text-emerald-700 hover:underline transition-all"
              >
                {mode === 'signup' ? "Se connecter" : "Créer un compte"}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
