import { co2 } from '@tgwf/co2';

/**
 * Calcule les émissions de CO2 pour un volume de données transférées
 * en utilisant le modèle SWD (Sustainable Web Design).
 * @param bytes Octets transférés
 * @returns Grammes de CO2
 */
export const calculateCO2 = (bytes: number): number => {
  const swd = new co2({ model: 'swd' });
  // perByte returns grams of CO2 per byte
  // Actually perVisit is often used for a whole page view, but perByte is more granular for individual resources
  // The user asked for SWD model specifically.
  return swd.perByte(bytes);
};

/**
 * Estime la taille de transfert de la page actuelle en octets.
 * Utilise l'API Performance pour sommer la taille de transfert des ressources chargées.
 */
export const getTransferSize = (): number => {
  if (typeof window === 'undefined' || !window.performance) return 0;
  
  const resources = window.performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  return resources.reduce((acc, resource) => acc + (resource.transferSize || 0), 0);
};
