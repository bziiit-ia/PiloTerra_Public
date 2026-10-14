
export type Difficulty = 'Débutant' | 'Intermédiaire' | 'Expert';

export type Category = 'Tous' | 'Administration' | 'Marketing & Com' | 'Agronomie' | 'RH' | 'Gestion de Data';

export type Page = 'home' | 'news' | 'catalog' | 'usecases' | 'elearning' | 'dashboard' | 'defi-ia' | 'formation-presentiel' | 'my-space' | 'profile' | 'update-password' | 'assessment' | 'super-admin' | 'data-agri' | 'agents-ia' | 'cgu' | 'about' | 'admin-organisation' | 'prompts';

export type UserRole = 'user' | 'super_admin' | 'visitor' | 'admin_coop' | 'member_orga';

export type ResourceType = 'tool' | 'news' | 'usecase' | 'learning' | 'data' | 'agent' | 'elearning' | 'organisation';

// Nouvelle interface unifiée pour la DB
export interface UnifiedResource {
  id: string;
  type: ResourceType;
  title: string;
  description: string;
  image_url?: string;
  external_link?: string;
  metadata: any; // JSONB content
  created_at: string;
  published?: boolean;
  // Chantier multi-marché : codes marché auxquels la ressource s'adresse.
  // Tableau vide ou absent = contenu transverse, visible sur tous les marchés.
  marches?: string[] | null;
  // Horodatage de qualification manuelle (étape 4, console super admin).
  // null = jamais qualifié, encore au marquage par défaut du backfill.
  marche_qualifie_le?: string | null;
  started_at?: string; // Nouvelle colonne pour la date de l'événement/actu
  // Colonnes de référencement (chantier Visibilité)
  slug?: string;
  seo_title?: string;
  seo_description?: string;
  contenu_long?: string;
  seo_indexable?: boolean;
}

// Interfaces "Vue" pour compatibilité avec les composants existants
export interface Tool {
  id: string;
  name: string;
  description: string;
  category: Category;
  difficulty: Difficulty;
  icon?: string;
  featured?: boolean;
  link?: string;
  imageUrl?: string;
  tagsOutilsIA?: string[];
  tagsOutilsMetiers?: string[];
  metiers?: string[];
  licence?: 'open source' | 'gratuit' | 'payant';
  process?: string[];
  paysEditeur?: 'France' | 'Autres';
  roi?: number; // 1 à 5
}

export interface AgentIA {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  link: string;
  frameworks: string[]; // ex: LangChain, CrewAI, AutoGen
  capabilities: string[]; // ex: Recherche Web, Coding, Analyse
  tags: string[];
  slug?: string; // Identifiant d'URL publique (ex: assistant-aides-pac)
  contenuLong?: string; // Fiche éditoriale markdown, affichée dans la pop-up
}

export interface NewsItem {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  sourceLink: string;
  date: string; // YYYY-MM-DD
  tagsOutilsIA: string[];
  tagsMetiers: string[];
  tagsOutilsMetiers: string[];
}

export interface DataAgriItem {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  sourceLink: string;
  tags: string[]; // data_tags
  slug?: string; // Identifiant d'URL publique
  contenuLong?: string; // Fiche éditoriale markdown, affichée dans la pop-up
}

export interface UseCase {
  id: string;
  title: string;
  description: string;
  tagsOutilsMetiers: string[];
  tagsMetiers: string[];
  tagsOutilsIA: string[];
  tagsProcess: string[];
}

export interface Resource {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  link: string;
  outilsMetiers: string[];
  nature: string;
}

export interface Training {
  id: string;
  title: string;
  description: string[]; // Paragraphes ou liste
  imageUrl?: string;
  link: string;
  niveau: string;
  publics: string[];
  objectifs: string[];
  competences: string[];
  editor?: string;
  slug?: string; // Identifiant d'URL publique
  contenuLong?: string; // Fiche éditoriale markdown, affichée dans la pop-up
}

export interface DefiView {
  id: string;
  user_id: string;
  created_at: string;
  email: string;
  probleme: string;
  vision: string;
  ressources: string;
  titreDefi?: string;
  contexte_ia?: string; // Mapped to contexteProbleme
  questionCle?: string;
  pistesDeReflexion1?: string;
  pistesDeReflexion2?: string;
  pistesDeReflexion3?: string;
  motsCles?: string;
  quadrant?: string; // Mapped to quadrant_nom
  justification?: string;
  score_roi?: number;
  score_complexite?: number;
  score_roi_collectif?: number;
  score_complexite_collectif?: number;
  quadrant_collectif?: string;
  justification_collectif?: string;
  updated_at_collectif?: string;
  analyse_web?: any; // Objet complet enrichissement_scraper
}

export interface MaturityResult {
  profil_titre: string;
  profil_description: string;
  score_maturite: number;
  analyse_psychologique: string;
  top_priorite: string;
  phrase_choc: string;
}

export interface Organisation {
  id: string;
  nom: string;
  description?: string;
  created_at: string;
  marche_code?: string | null; // marché de l'organisation — prime sur celui du profil de ses membres
  filiere_code?: string | null; // filière proposée par défaut à ses membres
}

export interface Profile {
  id: string; 
  auth_id?: string;
  email?: string;
  prenom: string;
  nom: string;
  entreprise?: string;
  organisation_id?: string;
  organisation?: Organisation;
  secteur_activite?: string; // historique, remplacé par filiere_code (étape 5b), plus affiché
  marche_code?: string | null; // marché du profil — ne s'applique que hors organisation dotée d'un marché
  filiere_code?: string | null; // filière personnelle, dans le marché effectif
  site_web?: string;
  fonction_profil?: string;
  role: UserRole;
  last_seen?: string;
  updated_at?: string;
  maturity_results?: MaturityResult | null;
}

export interface Invitation {
  id: string;
  email: string;
  entreprise?: string;
  organisation_id?: string;
  organisation?: Organisation;
  role: UserRole;
  status: 'pending' | 'accepted';
  created_by: string;
  created_at: string;
  /** Date d'acceptation, posée par accepter_invitation(). Nulle pour les
   *  invitations acceptées avant le 18/09/2026. */
  accepted_at?: string | null;
}

export interface AdminStats {
  totalMembers: number;
  activeMembers: number;
  totalDefis: number;
}

export interface MaturityQuestion {
  id: string;
  question_text: string;
  category?: string;
  order_index: number;
  is_active: boolean;
  question_type: 'text' | 'choice';
  options?: string[];
}

export interface AgentMetric {
  trace_id: string;
  created_at: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  total_cost_usd: number;
  latency_s: number;
  emissions_gco2eq: number;
  equivalence_water_liters: number;
  equivalence_car_km: number;
  equivalence_tgv_km: number;
  equivalence_smartphone: number;
}

export interface PlatformMetric {
  id: string;
  created_at: string;
  auth_user_id: string;
  page_path: string;
  bytes_transferred: number;
  co2_grams: number;
}
