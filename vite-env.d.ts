/// <reference types="vite/client" />

// Variables d'environnement exposées au front (préfixe VITE_ obligatoire).
// Déclarées ici pour que TypeScript connaisse import.meta.env : le
// tsconfig ne charge que les types "node".
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_N8N_ENVIRONNEMENT: string; // 'dev' | 'prod', vérifié dans n8nConfig.ts
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
