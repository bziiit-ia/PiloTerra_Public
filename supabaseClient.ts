import { createClient } from '@supabase/supabase-js';

// =====================================================================
//  Connexion Supabase
//  URL et clé lues dans les variables d'environnement Vite, jamais en
//  dur : le front de dev vise le Supabase de dev auto-hébergé, la prod
//  vise le sien, sans toucher au code.
//
//  En local : fichier .env.local à la racine (exclu de Git)
//    VITE_SUPABASE_URL=https://...
//    VITE_SUPABASE_ANON_KEY=...   ← clé anon uniquement, jamais service_role
//
//  Volontairement SANS valeur de repli : si la configuration manque,
//  l'application refuse de démarrer plutôt que de se connecter en
//  silence à une autre base — typiquement la prod.
// =====================================================================

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, '');
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Configuration Supabase manquante : définir VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY ' +
    "dans .env.local (en local) ou dans les variables d'environnement de l'hébergeur, " +
    'puis relancer le serveur.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
