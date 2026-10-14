import { supabase } from './supabaseClient';
import { calculateCO2, getTransferSize } from './src/lib/co2.ts';

// Déclaration globale pour que TypeScript reconnaisse gtag
declare global {
  interface Window {
    gtag: (
      command: 'config' | 'event',
      targetId: string,
      config?: Record<string, any>
    ) => void;
  }
}

export const GA_MEASUREMENT_ID = 'G-40832BX2XJ';

/**
 * Marché affiché, transmis à GA4 avec toutes les pages vues et tous les
 * événements qui suivent (étape 10, reporting segmenté). Appelé par
 * MarcheContext à chaque changement de marché. « vitrine » = aucun
 * marché choisi. Seule source pour le trafic des visiteurs non connectés.
 *
 * Côté GA4, déclarer une fois la dimension personnalisée « marche »
 * (portée : événement) et la propriété utilisateur « marche ».
 */
export const definirMarcheAnalytics = (code: string | null) => {
  if (typeof window === 'undefined' || !window.gtag) return;
  const marche = code ?? 'vitrine';
  // gtag('set', …) n'est pas dans la déclaration ci-dessus : appel direct.
  const gtag = window.gtag as unknown as (...args: unknown[]) => void;
  gtag('set', { marche });
  gtag('set', 'user_properties', { marche });
};

/**
 * Envoie une vue de page virtuelle à GA4 et enregistre l'impact carbone
 * @param pageName Le nom interne de la page (ex: 'defi-ia')
 */
export const sendPageView = async (pageName: string) => {
  if (typeof window !== 'undefined' && window.gtag) {
    // On simule une URL basée sur le nom de la page
    const path = pageName === 'home' ? '/' : `/${pageName}`;
    const title = `PiloTerra - ${pageName.charAt(0).toUpperCase() + pageName.slice(1)}`;

    window.gtag('config', GA_MEASUREMENT_ID, {
      page_path: path,
      page_title: title,
    });
    
    // Suivi de l'impact intrinsèque (CO2.js / SWD Model)
    await logPlatformImpact(path);
  }
};

/**
 * Calcule et enregistre l'impact carbone de la navigation actuelle
 * @param path Le chemin de la page consultée
 */
const logPlatformImpact = async (path: string) => {
  try {
    const { data, error: authError } = await supabase.auth.getSession();
    const session = data?.session;
    
    if (authError) {
      // Si c'est une erreur de refresh token, on ne log pas d'erreur critique
      if (authError.message.includes('Refresh Token') || authError.message.includes('refresh_token')) {
        return;
      }
      throw authError;
    }

    if (!session?.user?.id) return;

    // Récupération de la taille de transfert cumulée depuis le dernier appel
    const bytes = getTransferSize();
    if (bytes <= 0) return;

    const co2Grams = calculateCO2(bytes);

    // Enregistrement dans Supabase
    const { error } = await supabase
      .from('piloterra_platform_metrics')
      .insert({
        auth_user_id: session.user.id,
        page_path: path,
        bytes_transferred: bytes,
        co2_grams: co2Grams,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error("Erreur lors de l'enregistrement de l'impact plateforme:", error);
    } else {
      // On vide le buffer de performance pour ne pas compter deux fois les mêmes ressources
      if (window.performance && window.performance.clearResourceTimings) {
        window.performance.clearResourceTimings();
      }
    }
  } catch (err) {
    console.warn("Impossible d'enregistrer l'impact plateforme:", err);
  }
};

/**
 * Envoie un événement personnalisé (clic, action, etc.)
 * @param action L'action réalisée (ex: 'click_tool', 'start_defi')
 * @param category La catégorie (ex: 'Navigation', 'Engagement')
 * @param label Un label pour préciser (ex: nom de l'outil, ID du défi)
 * @param value Une valeur numérique optionnelle
 */
export const sendEvent = (
  action: string,
  category: string,
  label: string,
  value?: number
) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', action, {
      event_category: category,
      event_label: label,
      value: value,
    });
  }
};
