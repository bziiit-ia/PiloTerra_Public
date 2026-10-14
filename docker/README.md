# Préproduction PiloTerra sur Dokploy

Déploiement de la **préproduction** de PiloTerra dans Dokploy :

| | Préproduction | Production |
|---|---|---|
| Front | `https://piloterra.me` (Dokploy, ce dépôt) | `https://piloterra.fr` (**pas** construite depuis ce dépôt) |
| Supabase | `https://supabase.piloterra.me` (auto-hébergé, partagé avec le dev local) | `dgtctavkmcyhqopngcxk.supabase.co` |
| n8n | `n8n.bziiit.com`, copies de workflows préfixées `dev-` | `n8n.bziiit.com`, workflows de prod |

Depuis le 15/09/2026, le code lit Supabase et n8n dans des variables
`VITE_*`, sans valeur de repli (`supabaseClient.ts`, `n8nConfig.ts`). Vite
écrit ces valeurs dans le JavaScript **au moment du build** : dans
Dokploy, elles se saisissent donc en **Build-time Arguments**. L'image
n'adapte plus que ce qui reste propre à la préproduction (domaine,
`robots.txt`, Google Analytics), puis contrôle le résultat.

---

## 1. Principe

```
 GitHub (main)
      │  push
      ▼
 Dokploy ── docker build -f docker/Dockerfile .
      │
      │   Étage « build » (node:22-alpine)
      │     npm ci / npm install
      │     adapter-preprod.sh sources ──► contrôle des VITE_*, domaine, robots, Analytics
      │     vite build ──► SPA dans dist/, VITE_* écrites dans le JavaScript
      │     plugin SEO ──► supabase.piloterra.me (v_seo_pages) ──► pages HTML, sitemap, llms.txt
      │     adapter-preprod.sh dist ──► échec si une clé ou une API de prod subsiste
      │
      │   Étage « runtime » (nginx-unprivileged, port 8080)
      │     dist/ uniquement : ni Node, ni sources, ni .env
      ▼
 Traefik (HTTPS Let's Encrypt, piloterra.me) ──► conteneur :8080
```

PiloTerra est un **site statique** : pas de serveur applicatif, pas de
volume. Le navigateur appelle directement Supabase et n8n.

## 2. Contenu du dossier

| Fichier | Rôle |
|---|---|
| `Dockerfile` | Build en deux étages, paramétré pour la préproduction. Contexte = racine du dépôt |
| `scripts/adapter-preprod.sh` | Contrôle les variables, adapte domaine, robots et Analytics, puis contrôle `dist/` |
| `Dockerfile.dockerignore` | Exclusions du contexte de build (lu par BuildKit à la place d'un `.dockerignore` racine) |
| `nginx/default.conf.template` | Service statique : SPA, pages SEO sans extension, cache, `X-Robots-Tag`, sonde `/healthz` |
| `docker-compose.yml` | Test local de l'image, à l'identique de Dokploy |
| `README.md` | Ce document |

## 3. Ce que l'image reçoit, adapte et contrôle

### Reçu en Build-time Arguments, lu par Vite

| Variable | Préproduction | Lue par |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://supabase.piloterra.me` | `supabaseClient.ts`, `seo-plugin.mjs` (via `vite.config.ts`) |
| `VITE_SUPABASE_ANON_KEY` | clé anon de `supabase.piloterra.me` | idem |
| `VITE_N8N_ENVIRONNEMENT` | `dev` | `n8nConfig.ts` : préfixe `dev-` sur les 11 chemins n8n |

Ce sont les trois lignes du `.env.local` du dev : la préproduction et le
dev local partagent la même base et les mêmes copies n8n.

### Adapté dans la copie des sources

| Valeur en dur dans le dépôt | En préproduction | Où |
|---|---|---|
| `https://piloterra.fr` | `SITE_URL` | canoniques, sitemap, `llms.txt`, lien CGU du footer |
| `robots.txt` (Allow + sitemap) | `Disallow: /` | `public/robots.txt` |
| Google Analytics `G-40832BX2XJ` | fonction `gtag` vide | `index.html` |
| Images et PDF publics sur le stockage de prod | inchangés, ou `VITE_SUPABASE_URL` si `STOCKAGE_SUPABASE=preprod` | logos, trombinoscope, documents |

Deux remarques :

- **Analytics** est neutralisé, pas supprimé : `analytics.ts` ne fait rien
  sans `window.gtag`, y compris le relevé d'impact carbone
  (`piloterra_platform_metrics`). Avec la fonction vide, ce relevé reste
  testable, et il s'écrit dans le Supabase de préproduction.
- **Images et PDF publics** : avec `STOCKAGE_SUPABASE=prod` (défaut), ils
  restent lus sur le stockage de production, en lecture seule. Ils
  s'affichent sans recopier le bucket. Seul l'upload de logos clients
  (`About.tsx`) passe par le client Supabase, donc par la préproduction.

### Contrôles bloquants

Le build **échoue** si :

- `VITE_SUPABASE_ANON_KEY` est vide, illisible, n'est **pas une clé anon**
  (clé `service_role` ou `sb_secret_` refusée), ou appartient au projet de
  production ;
- `VITE_SUPABASE_URL` ou `SITE_URL` pointent sur la production ;
- `VITE_N8N_ENVIRONNEMENT` ne vaut pas `dev` ;
- `supabaseClient.ts` ou `n8nConfig.ts` ne lisent plus ces variables (la
  structure des sources a changé) ;
- après le build, `dist/` contient une clé du projet de production ou une
  clé `service_role`, ou une URL Supabase de production autre qu'une URL
  de stockage public ;
- le bundle ne contient pas `VITE_SUPABASE_URL` : les variables ne sont
  pas arrivées jusqu'à Vite (typiquement saisies dans Environment
  Settings) ;
- Google Analytics est encore chargé par une page.

Une préproduction branchée par erreur sur la production ne part donc
jamais en ligne.

### n8n

Avec `VITE_N8N_ENVIRONNEMENT=dev`, chaque appel vise la copie `dev-` du
workflow (`/webhook/dev-charte-ia`, `/form/dev-defIAPiloTerra`…), rangée
dans le dossier n8n de dev et branchée sur l'accès « Supabase Piloterra
DEV ». La liste des 11 chemins et l'état de l'audit sont tenus dans
`CLAUDE.md`, section n8n. Un workflow pas encore dupliqué ou désactivé
échoue en 404 : rien ne part en prod.

Effets réels hors base, à connaître en test : la Fiche Défi ajoute le
contact dans Brevo et envoie un e-mail, le Support crée un vrai ticket et
une alerte Telegram, le prototype de code envoie un e-mail.

## 4. Prérequis côté Supabase de préproduction

À faire sur `supabase.piloterra.me` **avant** le premier déploiement.

### Schéma et données

- [ ] Schéma de production recopié : tables, fonctions `SECURITY DEFINER`
      (`current_utilisateur_id()`, `current_organisation_id()`,
      `is_org_admin()`, `is_super_admin()`, `current_marche_code()`,
      `est_visible_pour()`), policies RLS, vues avec
      `security_invoker = on`
- [ ] Scripts du chantier multi-marché exécutés (`sql/`, dans l'ordre)
- [ ] Vue `v_seo_pages` présente et lisible par `anon`, sinon aucune page
      SEO n'est générée (le build continue, avec une alerte)
- [ ] Référentiels chargés : `marches`, `filieres`, `maturity_questions`,
      contenus `piloterra_resources`, `prompts`
- [ ] Bucket `PiloTerra` public, si `STOCKAGE_SUPABASE=preprod` ou pour
      tester l'upload de logos clients

Si des données de production sont recopiées, elles contiennent des
données personnelles : les pseudonymiser, ou protéger la préproduction
par une authentification (§5.6).

### Auth (variables de l'instance auto-hébergée)

| Variable | Valeur |
|---|---|
| `SITE_URL` | `https://piloterra.me` |
| `ADDITIONAL_REDIRECT_URLS` | `https://piloterra.me,https://piloterra.me/**,http://localhost:3000` |
| `API_EXTERNAL_URL` | `https://supabase.piloterra.me` |
| `GOTRUE_EXTERNAL_GOOGLE_ENABLED` | `true` — connexion Google utilisée par `Auth.tsx` |
| `GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID` / `_SECRET` | client OAuth Google dédié à la préproduction |
| `GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI` | `https://supabase.piloterra.me/auth/v1/callback` |
| `SMTP_*` | serveur d'envoi : réinitialisation de mot de passe, confirmations |

`http://localhost:3000` sert au dev local (`npm run dev`), qui partage
cette instance. Dans la console Google Cloud, sur le client OAuth :
ajouter `https://supabase.piloterra.me/auth/v1/callback` aux URI de
redirection autorisés et `https://piloterra.me` aux origines JavaScript.

### Clé anon

La récupérer dans la configuration de l'instance (variable `ANON_KEY` du
`.env` Supabase auto-hébergé). C'est elle qui va dans
`VITE_SUPABASE_ANON_KEY`. **Jamais la `SERVICE_ROLE_KEY`** : elle serait
lisible par n'importe quel visiteur dans le JavaScript servi. Le build la
refuse.

## 5. Déployer dans Dokploy — pas à pas

### 5.1 Créer l'application

1. **Projects** → créer (ou ouvrir) le projet `PiloTerra`.
2. **Create Service** → **Application** → nom `piloterra-preprod`.

> Type **Application**, pas **Docker Compose** : Dokploy gère alors
> lui-même le domaine, le certificat, les redémarrages et les rollbacks,
> sans étiquettes Traefik à maintenir à la main.

### 5.2 Source

Onglet **General** → **Provider** :

| Champ | Valeur |
|---|---|
| Provider | GitHub (via l'application GitHub de Dokploy) |
| Repository | `bziiitIA/Dev-PiloTerra` |
| Branch | `main` |
| Build Path | `/` |

Si l'application GitHub de Dokploy n'est installée que sur l'organisation
`bziiit-ia`, pointer sur le miroir `bziiit-ia/dev-piloterra` : il est
recopié à chaque push par `.github/workflows/miroir-bziiit-ia.yml`.

### 5.3 Build

Onglet **General** → **Build Type** :

| Champ | Valeur |
|---|---|
| Build Type | **Dockerfile** |
| Docker File | `docker/Dockerfile` |
| Docker Context Path | `.` |
| Docker Build Stage | `runtime` |

### 5.4 Variables

Onglet **Environment** → **Build-time Arguments** :

```
VITE_SUPABASE_URL=https://supabase.piloterra.me
VITE_SUPABASE_ANON_KEY=<clé anon de supabase.piloterra.me>
VITE_N8N_ENVIRONNEMENT=dev
# Valeurs par défaut du Dockerfile, à décommenter pour les changer :
# SITE_URL=https://piloterra.me
# STOCKAGE_SUPABASE=prod
# ANALYTICS=0
# EXIGER_SEO=1
```

| Argument | Défaut | Rôle |
|---|---|---|
| `VITE_SUPABASE_ANON_KEY` | — | **Obligatoire.** Clé anon du Supabase de préproduction |
| `VITE_SUPABASE_URL` | `https://supabase.piloterra.me` | Supabase de préproduction |
| `VITE_N8N_ENVIRONNEMENT` | `dev` | Copies `dev-` des workflows ; seule valeur acceptée |
| `SITE_URL` | `https://piloterra.me` | Domaine public |
| `STOCKAGE_SUPABASE` | `prod` | `preprod` = images et PDF lus sur la préproduction (bucket à recopier) |
| `ANALYTICS` | `0` | `1` = conserver Google Analytics |
| `EXIGER_SEO` | `0` | `1` = échec si les pages SEO ne sont pas générées. À passer à 1 une fois `v_seo_pages` alimentée |

Onglet **Environment** → **Environment Settings** : **rien à saisir**.
Des variables `VITE_*` placées là n'arriveraient qu'au démarrage du
conteneur, bien après le build : le site afficherait une page blanche
(le contrôle de `dist/` fait alors échouer le build). `X_ROBOTS_TAG` vaut
`noindex, nofollow` par défaut dans l'image.

Dokploy peut signaler un avertissement BuildKit
`SecretsUsedInArgOrEnv` à cause du mot `KEY` : sans conséquence, la clé
anon est publique par nature et n'est pas présente dans l'image finale
autrement que dans le JavaScript servi.

### 5.5 Domaine

Onglet **Domains** → **Add Domain** :

| Champ | Valeur |
|---|---|
| Host | `piloterra.me` |
| Path | `/` |
| Container Port | **8080** |
| HTTPS | activé |
| Certificate | Let's Encrypt |

DNS : enregistrement A (et AAAA si IPv6) de `piloterra.me` vers l'IP du
serveur Dokploy, **avant** le déploiement, sinon Let's Encrypt ne peut pas
émettre le certificat. Si `www.piloterra.me` est déclaré, ajouter une
redirection vers `piloterra.me` dans **Advanced** → **Redirects**.

Le port **8080** est le piège classique : l'image Nginx sans privilèges
n'écoute pas sur 80.

### 5.6 Protéger l'accès (recommandé)

Une préproduction publique expose le portail et, si la base a été recopiée,
des données réelles. Dans **Advanced** → **Security**, ajouter une
authentification HTTP basique (Traefik). Elle se place devant le site
uniquement : Supabase et la connexion Google ne sont pas concernés.

### 5.7 Premier déploiement

1. **Deploy**.
2. Onglet **Deployments** → suivre le log. Attendu, dans l'ordre :
   - `npm ci refusé … repli sur npm install`
   - `[préprod] Supabase : https://supabase.piloterra.me (lu par Vite)`
   - `[préprod] n8n : copies « dev- » des workflows`
   - `[préprod] Stockage`, `Domaine`, `robots.txt`, `Google Analytics : neutralisé`
   - `[SEO PiloTerra] N pages générées` (ou une alerte si `v_seo_pages` est vide)
   - `[préprod] Contrôles de dist/ passés`
3. Onglet **Logs** → Nginx démarre sans erreur.
4. Dérouler la recette du §7.

### 5.8 Déploiement continu

Onglet **General** → activer **Autodeploy** : chaque push sur `main`
redéploie la préproduction. Le conteneur n'est remplacé qu'une fois la
sonde `/healthz` passée ; en cas d'échec de build, l'ancienne version
continue de servir.

## 6. Tester en local

Prérequis : Docker démarré.

```bash
# depuis la racine du dépôt
VITE_SUPABASE_ANON_KEY=<clé anon de supabase.piloterra.me> \
  docker compose -f docker/docker-compose.yml up --build
```

Puis http://localhost:8080. L'application locale parle au Supabase de
préproduction. Pour une connexion par e-mail ou Google depuis
`localhost:8080`, ajouter `http://localhost:8080` à
`ADDITIONAL_REDIRECT_URLS`.

Pour le développement courant, `npm run dev` suffit : il lit les mêmes
variables dans `.env.local` (jamais commité).

Le script d'adaptation peut aussi être essayé seul, sur une copie du dépôt
(il modifie les fichiers en place — **jamais dans le dépôt lui-même**) :

```bash
cp -r . /tmp/piloterra-essai && cd /tmp/piloterra-essai
VITE_SUPABASE_URL=https://supabase.piloterra.me VITE_N8N_ENVIRONNEMENT=dev \
SITE_URL=https://piloterra.me VITE_SUPABASE_ANON_KEY=<clé> \
  sh docker/scripts/adapter-preprod.sh sources
```

## 7. Recette

```bash
D=https://piloterra.me
curl -s  $D/healthz                                   # ok
curl -sI $D/ | grep -iE 'HTTP/|x-robots-tag'          # 200 + noindex, nofollow
curl -s  $D/robots.txt                                # Disallow: /
curl -sI $D/agents | head -1                          # 200 (si pages SEO générées)
curl -s  $D/sitemap.xml | grep -m1 '<loc>'            # https://piloterra.me/…
curl -s  $D/ | grep -c googletagmanager               # 0
# Aucune API de prod dans le JavaScript servi :
curl -s $D/ | grep -oE '/assets/index-[^"]+\.js' | head -1 \
  | xargs -I{} curl -s $D{} | grep -c 'dgtctavkmcyhqopngcxk.supabase.co/rest\|dgtctavkmcyhqopngcxk.supabase.co/auth'   # 0
```

Dans un navigateur, outils de développement ouverts sur l'onglet Réseau :

- [ ] Pas de page blanche ; la console ne signale ni « Configuration
      Supabase manquante » ni « Configuration n8n manquante »
- [ ] Connexion e-mail : les appels partent vers `supabase.piloterra.me`
- [ ] Connexion Google : la fenêtre s'ouvre, revient sur `piloterra.me`
- [ ] Réinitialisation de mot de passe : le lien reçu pointe sur `piloterra.me`
- [ ] Sélecteur de marché, bibliothèque de prompts, console super admin
- [ ] Une URL publique `/agents/<slug>` ouverte directement
- [ ] Logos et trombinoscope affichés
- [ ] Un appel n8n (charte, support…) part vers un chemin `dev-`
- [ ] **Aucun** appel vers `dgtctavkmcyhqopngcxk.supabase.co` hors `/storage/`

## 8. Contenus SEO : quand redéployer

Les pages `/agents/…`, `/formations/…`, `/prompts/…`,
`/sources-de-donnees/…`, `sitemap.xml` et `llms.txt` sont écrits **au
build**, à partir du Supabase de préproduction. Un contenu publié ensuite
n'y apparaît qu'au déploiement suivant : bouton **Deploy** dans Dokploy,
ou appel de l'API :

```
POST https://<dokploy>/api/application.deploy
x-api-key: <clé API Dokploy, Settings → Profile → API>
Content-Type: application/json

{"applicationId": "<id visible dans l'URL de l'application>"}
```

## 9. Dépannage

| Symptôme | Cause probable | Action |
|---|---|---|
| `VITE_SUPABASE_ANON_KEY est vide` | Argument absent ou saisi dans Environment Settings | Le mettre dans **Build-time Arguments** |
| `le bundle JavaScript ne contient pas https://supabase.piloterra.me` | Variables `VITE_*` saisies dans Environment Settings, ou nom mal orthographié | Les mettre dans **Build-time Arguments**, noms exacts |
| `n'est pas une clé anon` | Clé `service_role` / `SERVICE_ROLE_KEY` copiée | Prendre `ANON_KEY` de l'instance auto-hébergée |
| `clé du Supabase de production` | Clé du projet Cloud copiée | Prendre `ANON_KEY` de l'instance auto-hébergée |
| `VITE_N8N_ENVIRONNEMENT doit valoir dev` | Valeur `prod` ou absente | `VITE_N8N_ENVIRONNEMENT=dev` |
| `… ne lit plus VITE_… : la structure des sources a changé` | `supabaseClient.ts` ou `n8nConfig.ts` réécrits | Adapter `scripts/adapter-preprod.sh` |
| `des références au Supabase de production subsistent` | Nouvelle URL Supabase de prod en dur dans le code | Le log liste les URL ; la sortir du code, ou vérifier `STOCKAGE_SUPABASE` s'il s'agit de stockage public |
| Page blanche, console « Configuration … manquante » | Image construite sans les `VITE_*` (build antérieur au correctif) | Redéployer avec les Build-time Arguments |
| `[SEO PiloTerra] … HTTP 401` | Clé anon erronée | Vérifier `VITE_SUPABASE_ANON_KEY` |
| `[SEO PiloTerra] … HTTP 404` ou `Aucune page à générer` | `v_seo_pages` absente, vide ou non lisible par `anon` | Recopier la vue et les contenus (§4) |
| `Bad Gateway` / 404 Traefik | Container Port à 80 | Mettre **8080** |
| Certificat non émis | DNS `piloterra.me` pas encore propagé | Vérifier `dig piloterra.me`, redéployer |
| Connexion : erreur de redirection | `SITE_URL` / `ADDITIONAL_REDIRECT_URLS` de l'Auth | §4 |
| Connexion Google : `redirect_uri_mismatch` | URI de callback absente du client OAuth Google | §4 |
| Appels bloqués par CORS vers Supabase | Kong ou proxy de l'instance restreint les origines | Autoriser `https://piloterra.me` |
| Fonction n8n en erreur (404) | Copie `dev-` absente ou désactivée dans n8n | Voir `CLAUDE.md`, section n8n |
| `COPY docker/nginx/… not found` | Docker Context Path différent de `.` | Remettre `.` |

## 10. Constats hors périmètre

- **Valeurs d'environnement en dur — résolu le 15/09/2026** pour Supabase
  et n8n (variables `VITE_*`). Restent en dur : le domaine, l'identifiant
  Google Analytics et les URL du stockage public, adaptés par le script.
- **Lockfile incomplet.** `npm ci` refuse ; un `npm install` commité le
  réparerait. À valider : AI Studio pourrait le réécrire.
- **Vite réellement installé : 6.4.1**, pas 7 (double déclaration dans
  `package.json`, le lockfile tranche).
- **Tailwind chargé depuis `cdn.tailwindcss.com` à l'exécution** : compile
  le CSS dans le navigateur à chaque visite, dépendance à un tiers.
- **Bundle unique de 1,5 Mo** (385 Ko compressé).
- **Fausses 404** : une URL publique inexistante renvoie `index.html`
  en 200.
- **Pas de Content-Security-Policy.**
