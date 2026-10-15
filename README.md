<div align="center">

# PiloTerra

### Votre portail IA open source pour l'agriculture, l'environnement et la logistique

[![Licence : AGPL-3.0](https://img.shields.io/badge/Licence-AGPL--3.0-1b5e1f?style=for-the-badge)](LICENSE)
[![Édité par bziiit](https://img.shields.io/badge/Édité%20par-bziiit-a77a15?style=for-the-badge)](https://bziiit.com)
[![Qualiopi](https://img.shields.io/badge/Formation-Qualiopi-1b5e1f?style=for-the-badge)](https://certifopac.fr/qualiopi/certification/verification/?siren=813829876)

[piloterra.fr](https://piloterra.fr)

</div>

---

## À propos

**PiloTerra** est un portail d'intelligence artificielle open source, édité
par [bziiit](https://bziiit.com), organisme de formation certifié Qualiopi.
Il accompagne les organisations de trois marchés — **agriculture**,
**environnement** et **logistique** — de la découverte de l'IA jusqu'à des
projets concrets.

Le portail a deux vocations :

- **outil de formation** : il sert de support aux sessions animées par
  bziiit, et les participants y produisent des livrables réels (charte IA,
  fiches défi, cas d'usage, prompts, matrice de priorisation) ;
- **plateforme pour les organisations** : chaque organisation retrouve ses
  membres, ses productions et ses priorités dans un espace qui lui est
  propre, isolé des autres.

Ses valeurs : **souverain, frugal, éthique, open source et orienté
résultats**. L'audit de frugalité des cas d'usage s'appuie sur la
spécification AFNOR SPEC 2314 (IA frugale).

---

## Fonctionnalités

| Module | Description |
| :--- | :--- |
| **Observatoire** | Veille sur l'IA, collectée et classée par marché. |
| **Catalogue d'outils** | Solutions IA référencées, filtrables par catégorie, licence et pays. |
| **Agents IA** | Fiches d'agents spécialisés et guides de mise en œuvre. |
| **Bibliothèque de prompts** | Prompts prêts à l'emploi, avec prompts communautaires modérés. |
| **Données ouvertes** | Répertoire de jeux de données et de référentiels publics. |
| **Fiche Défi** | Questionnaire court qui transforme un irritant métier en défi IA structuré. |
| **Cas d'usage → prototype → audit** | Du défi au cas d'usage, au prompt de prototype, puis à l'audit de frugalité. |
| **Charte IA** | Rédaction assistée de la charte d'usage de l'IA de l'organisation. |
| **Test de maturité** | Positionnement de l'utilisateur à l'entrée du portail. |
| **Formations** | Formations en présentiel, e-learning, sessions de formation rejointes par code. |
| **Espace organisation** | Membres, invitations, fiches défi de l'équipe, matrice de priorisation, export. |
| **Console d'administration** | Organisations, contenus, qualification par marché, couleurs, reporting. |

Le portail s'adapte au marché affiché : contenus, vocabulaire, couleurs,
pages de référencement.

---

## Architecture

| Brique | Rôle |
| :--- | :--- |
| [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/), [Vite 7](https://vite.dev/) | Application (SPA), routage par ancre sans bibliothèque (`App.tsx`) |
| [Tailwind CSS](https://tailwindcss.com/), [Lucide](https://lucide.dev/), [Recharts](https://recharts.org/) | Styles, icônes, graphiques |
| [Supabase](https://supabase.com/) (PostgreSQL, Row Level Security) | Authentification, base de données, stockage ; isolation des organisations par RLS |
| [n8n](https://n8n.io/) | Scénarios d'IA appelés par le portail (fiche défi, cas d'usage, charte, maturité, veille…) |
| `seo-plugin.mjs` | Plugin Vite : pages statiques indexables, `sitemap.xml` et `llms.txt`, générés au build |
| [`@tgwf/co2`](https://www.thegreenwebfoundation.org/co2-js/) | Estimation de l'empreinte carbone des pages |
| `docker/` | Image de déploiement (Nginx sans privilèges) |

```text
├── App.tsx                 # Racine, routage, chargement et filtrage des contenus
├── components/             # Écrans et composants
├── supabaseClient.ts       # Connexion Supabase (variables d'environnement)
├── n8nConfig.ts            # Adresses des scénarios n8n
├── seo-plugin.mjs          # Génération SEO au build
├── sql/                    # Schéma et migrations SQL (ordre : voir Base de données)
├── docker/                 # Dockerfile, Nginx, script de contrôle du build
└── public/                 # Icônes, robots.txt
```

### Ce que ce dépôt ne contient pas

Soyons clairs pour qui voudrait installer sa propre instance :

- **les scénarios n8n** : les traitements d'IA (agents, prompts des
  scénarios) vivent dans n8n et ne sont pas publiés ici. Sans eux, les
  modules qui en dépendent ne répondent pas ;
- **les contenus** (fiches, actualités, prompts de la bibliothèque) et les
  fichiers du stockage (logos, portraits, documents).

---

## Démarrage en local

### Prérequis

- [Node.js](https://nodejs.org/) 22 (20.19 au minimum, exigé par Vite 7)
- un projet Supabase et une instance n8n (voir ci-dessus)

### Installation

```bash
git clone https://github.com/bziiit-ia/piloterra.git
cd piloterra
npm install
```

Le fichier `package-lock.json` est incomplet : `npm ci` le refuse, utilisez
`npm install`.

### Configuration

Copiez le modèle `.env.example` en `.env.local`, puis renseignez-le :

```bash
cp .env.example .env.local
```

| Variable | Valeur |
| :--- | :--- |
| `VITE_SUPABASE_URL` | Adresse de votre projet Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clé **anon** (publique) de ce projet. Jamais la clé `service_role` |
| `VITE_N8N_ENVIRONNEMENT` | `dev` (scénarios préfixés `dev-`) ou `prod` |

Sans ces trois variables, le portail refuse de démarrer : c'est voulu, pour
ne jamais se connecter par erreur à une autre base.

### Base de données

Sur un projet Supabase neuf, exécutez les scripts de `sql/` dans l'éditeur
SQL, chacun en une fois, dans cet ordre :

| # | Script | Objet |
| :--- | :--- | :--- |
| 1 | `etape0_schema_initial.sql` | Schéma d'origine : tables, fonctions, RLS, buckets de stockage. Base vierge uniquement |
| 2 | `etape1a3_socle_multi_marche.sql` | Référentiels marchés et filières, colonnes de marché |
| 3 | `etape4_qualification_marche.sql` | Console de qualification des contenus |
| 4 | `etape5a_socle_points_entree.sql` | Règle du marché effectif |
| 5 | `etape5c_organisations.sql` | Marché et filière des organisations |
| 6 | `etape5d_profils_par_marche.sql` | Profils proposés selon le marché |
| 7 | `securite_rls_utilisateurs_invitations_diagnostics.sql` | Fermeture des politiques RLS trop larges |
| 8 | `correctif_sessions_invitations.sql` | Sessions de formation et invitations |
| 9 | `etape6_vitrine_tri_marche.sql` | Vitrine par marché |
| 10 | `etape7_veille_par_marche.sql` | Sources de veille par marché |
| 11 | `etape8_seo_tri_marche.sql` | Pages SEO par marché |
| 12 | `etape9_redaction_seo_multi_marche.sql` | Rédaction SEO multi-marché |
| 13 | `etape10_accent_visuel_marche.sql` | Couleurs par marché |
| 14 | `etape10_questions_maturite_tri_marche.sql` | Diagnostic de maturité par marché |
| 15 | `etape10_reporting_marches.sql` | Reporting par marché |

Sauf le premier, les scripts sont idempotents : les rejouer ne casse rien.
Le schéma initial comporte des politiques RLS d'origine trop larges, que
les scripts n° 5 et 7 remplacent : n'ouvrez pas la base au public avant
d'avoir tout exécuté.

Deux réglages restent à faire à la main : le trigger qui prévient n8n d'une
inscription (exemple en tête de `etape0_schema_initial.sql`) et les textes
propres à chaque marché (consigne de veille, couleurs), à reprendre dans la
console super admin.

Les adresses n8n (`n8nConfig.ts`), l'identifiant Google Analytics
(`analytics.ts`, `index.html`) et les adresses des images et documents
sont propres à bziiit : remplacez-les par les vôtres.

### Commandes

```bash
npm run dev       # Serveur de développement sur http://localhost:3000
npm run build     # Build de production, avec génération des pages SEO
npm run preview   # Aperçu du build
npm run lint      # Vérification TypeScript (tsc --noEmit)
```

---

## Sécurité

Vous pensez avoir trouvé une faille ? Merci de **ne pas ouvrir de ticket
public** : écrivez à info@bziiit.com, nous vous répondrons rapidement.

---

## Contribuer

Les contributions sont bienvenues : tickets pour signaler un défaut ou
proposer une amélioration, demandes de fusion pour proposer du code. En
contribuant, vous acceptez que votre contribution soit distribuée sous la
même licence que le projet.

---

## Licence

Copyright © 2026 bziiit SAS

Ce programme est un logiciel libre : vous pouvez le redistribuer et le
modifier selon les termes de la **GNU Affero General Public License**,
version 3, publiée par la Free Software Foundation. Il est distribué dans
l'espoir qu'il sera utile, mais **sans aucune garantie**, ni explicite ni
implicite. Voir le texte complet dans le fichier [LICENSE](LICENSE).

En pratique, la licence AGPL vous demande, si vous mettez en ligne une
version modifiée du portail, d'en proposer le code source à ses
utilisateurs, sous la même licence. Le pied de page du portail contient un
lien « Code source » à cet effet : gardez-le, en le pointant vers votre
propre dépôt.

La licence porte sur le code, pas sur les marques : les noms et logos
PiloTerra, bziiit et Qualiopi ne sont pas concernés. Voir
[MARQUES.md](MARQUES.md).

---

## Contact

- **bziiit** : [bziiit.com](https://bziiit.com) — info@bziiit.com
- **Prendre rendez-vous** : [Calendly](https://calendly.com/laurent-bziiit)
- **Certification Qualiopi** : [vérifier le certificat](https://certifopac.fr/qualiopi/certification/verification/?siren=813829876)
