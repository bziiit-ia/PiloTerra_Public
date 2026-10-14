import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
// Génération des pages publiques indexables, du sitemap et du llms.txt.
// Ne s'exécute qu'au build, jamais en développement.
import { pluginSeoPiloTerra } from './seo-plugin.mjs';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        // Même base que le front : lue dans .env.local ou chez l'hébergeur.
        pluginSeoPiloTerra({
          supabaseUrl: env.VITE_SUPABASE_URL,
          supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY,
        }),
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});