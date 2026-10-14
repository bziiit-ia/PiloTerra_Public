
import { Category } from './types';

// Dépôt public du code source, affiché en pied de page. Licence AGPL-3.0,
// article 13 : toute personne qui utilise le portail par le réseau doit
// pouvoir en obtenir le code. Adresse à confirmer à la création du dépôt.
export const URL_CODE_SOURCE = 'https://github.com/bziiit-ia/piloterra';

export const CATEGORIES: Category[] = [
  'Tous',
  'Administration',
  'Marketing & Com',
  'Agronomie',
  'RH',
  'Gestion de Data'
];

// Mapping des codes tags vers des libellés lisibles
export const TAG_LABELS: Record<string, string> = {
  // Métiers (Codes CSV: tagsMetiers)
  'gc': 'Grandes cultures',
  'viti': 'Viticulture',
  'elevage': 'Élevage',
  'maraichage': 'Maraîchage',
  'arbo': 'Arboriculture',
  'ppam': 'PPAM',
  'ostreiculture': 'Ostréiculture',

  // Outils IA (Codes CSV: tagsOutilsIA)
  'llm': 'LLM / Chatbot',
  'app': 'Application / Site Web',
  'oad': 'Outil d\'Aide à la Décision',
  'auto': 'Automatisation',
  'trans': 'Transcription / Traduction',
  'ocr': 'OCR / Numérisation',
  'image': 'Génération d\'Image',
  'video': 'Génération de Vidéo',
  'pres': 'Génération de Présentation',

  // Outils Métiers (Codes CSV: tagsOutilsMetiers)
  'geo': 'Géolocalisation / Cartographie',
  'traca': 'Traçabilité',
  'iot': 'Capteurs / IoT / Robotique',
  'climate': 'Climat / Météo / Eau',
  'biodiv': 'Biodiversité',

  // Processus (Codes CSV: tagsProcess - Cas d'usage)
  'prod': 'Production',
  'compta': 'Compta / Admin / Finance',
  'vente': 'Commerce / Vente',
  'juri': 'Juridique / Réglementaire',
  'rh': 'Ressources Humaines',
  'market': 'Marketing / Com',
  'achat': 'Achats',
  'env': 'Environnement / Sécurité',
  'stock': 'Stock / Logistique',

  // Data specific (Codes CSV: tags - DataAgri)
  'alim': 'Alimentation',
  'plant': 'Plantes / Végétal',
  'phyto': 'Phytosanitaire',
  'veto': 'Vétérinaire',
  'agri': 'Agriculture Générale',
  'meteo': 'Météo',
  'bdc': 'Base de Connaissance',
  'appr': 'Apprentissage / Recherche',
  'ent': 'Entreprises',
  'img': 'Imagerie / Satellite',
  'juri_data': 'Juridique' // Alias si conflit
};

// Fonction utilitaire pour récupérer le label ou renvoyer le code si pas de mapping
export const getTagLabel = (code: string): string => {
  return TAG_LABELS[code] || code;
};
