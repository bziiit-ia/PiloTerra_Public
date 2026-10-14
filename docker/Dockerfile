# syntax=docker/dockerfile:1
#
# PiloTerra — image de PRÉPRODUCTION pour Dokploy
# -----------------------------------------------
# Cible : https://piloterra.me, adossée au Supabase auto-hébergé
# https://supabase.piloterra.me et aux copies « dev- » des workflows n8n.
#
# Deux étages :
#   1. « build »   : docker/scripts/adapter-preprod.sh contrôle les
#                    paramètres et adapte ce qui reste propre à la
#                    préproduction (domaine, robots.txt, Analytics). Node
#                    lance ensuite `vite build` : Vite lit les variables
#                    VITE_* reçues en Build-time Arguments et les écrit dans
#                    le JavaScript. Le plugin SEO (seo-plugin.mjs) interroge
#                    le Supabase de préproduction à ce moment-là pour écrire
#                    les pages publiques, le sitemap et llms.txt : le build a
#                    besoin d'un accès réseau sortant. Le script contrôle
#                    enfin le contenu de dist/.
#   2. « runtime » : Nginx sans privilèges sert le contenu de dist/.
#                    Aucune trace de Node, du code source ni du .env dans
#                    l'image finale.
#
# Contexte de build attendu : la RACINE du dépôt, pas le dossier docker/.
#   docker build -f docker/Dockerfile --build-arg VITE_SUPABASE_ANON_KEY=… .
#
# Depuis le 15/09/2026, le code lit Supabase et n8n dans des variables
# VITE_* sans valeur de repli (supabaseClient.ts, n8nConfig.ts) : sans elles,
# le site construit afficherait une page blanche. La production
# (piloterra.fr) n'est pas construite depuis ce dépôt.

# ------------------------------------------------------------------
# Étage 1 — build de la SPA et des pages SEO
# ------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Dépendances d'abord : cette couche reste en cache tant que
# package.json et package-lock.json ne changent pas.
#
# Le package-lock.json généré par AI Studio est incomplet (binaires
# esbuild / rollup par plateforme absents) : `npm ci` le refuse. On tente
# `npm ci` en premier, pour profiter d'un lockfile réparé un jour, puis on
# retombe sur `npm install`, qui garde les versions verrouillées et ne
# complète que les entrées manquantes.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund \
 || { echo "npm ci refusé (lockfile incomplet) : repli sur npm install" >&2; \
      npm install --no-audit --no-fund; }

COPY . .

# Aucun .env ne sert à la préproduction : par précaution, on retire tout
# fichier d'environnement local, que le .dockerignore ait été lu ou non.
# Les variables utiles arrivent uniquement par les arguments ci-dessous.
RUN rm -f .env .env.*

# --- Paramètres de la préproduction (Build-time Arguments Dokploy) ---
# Déclarés en ARG, ils sont visibles comme variables d'environnement par
# les RUN qui suivent : c'est ainsi que Vite les lit pendant `npm run build`.
# Saisis dans « Environment Settings » au lieu de « Build-time Arguments »,
# ils arriveraient trop tard.

# Supabase auto-hébergé de préproduction
ARG VITE_SUPABASE_URL=https://supabase.piloterra.me
# Clé anon de ce Supabase. OBLIGATOIRE : le build échoue si elle manque.
# Publique par nature (elle finit dans le JavaScript servi), protégée par
# la RLS. Le build refuse une clé service_role ou une clé de production.
ARG VITE_SUPABASE_ANON_KEY=""
# Workflows n8n : « dev » = copies préfixées « dev- », branchées sur le
# Supabase de préproduction. Toute autre valeur fait échouer le build : les
# workflows de prod écrivent dans la base de production.
ARG VITE_N8N_ENVIRONNEMENT=dev
# Domaine public : canoniques, sitemap, llms.txt, liens absolus
ARG SITE_URL=https://piloterra.me
# prod    = images et PDF publics lus sur le stockage de production
#           (lecture seule, rien à recopier)
# preprod = tout est lu sur le Supabase de préproduction (bucket PiloTerra
#           à recopier au préalable)
ARG STOCKAGE_SUPABASE=prod
# 1 = conserver Google Analytics. Par défaut neutralisé, pour ne pas
# mêler les visites de test aux statistiques de production.
ARG ANALYTICS=0
# 1 = échec du build si les pages SEO ne sont pas générées (vue
# v_seo_pages absente ou vide sur le Supabase de préproduction). Laissé à 0
# tant que la base de préproduction n'est pas alimentée.
ARG EXIGER_SEO=0

RUN sh docker/scripts/adapter-preprod.sh sources

RUN npm run build \
 && if [ ! -f dist/sitemap.xml ]; then \
      if [ "$EXIGER_SEO" = "1" ]; then \
        echo "ERREUR : dist/sitemap.xml absent, pages SEO non générées (EXIGER_SEO=1)." >&2; \
        exit 1; \
      else \
        echo "ATTENTION : pages SEO non générées (v_seo_pages absente ou vide sur $VITE_SUPABASE_URL ?)." >&2; \
      fi; \
    fi

# Dernier filet : aucune clé ni API de production dans ce qui sera servi,
# et le bundle pointe bien sur la préproduction
RUN sh docker/scripts/adapter-preprod.sh dist

# ------------------------------------------------------------------
# Étage 2 — service statique
# ------------------------------------------------------------------
# Variante « unprivileged » de l'image officielle : Nginx tourne sous
# l'utilisateur nginx (uid 101) et écoute sur 8080 au lieu de 80.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

# En-tête X-Robots-Tag, lu au démarrage du conteneur (pas au build).
# Préproduction : jamais indexée. Une valeur vide supprime l'en-tête.
ENV X_ROBOTS_TAG="noindex, nofollow"

# Le point d'entrée de l'image passe les fichiers de /etc/nginx/templates
# dans envsubst et écrit le résultat dans /etc/nginx/conf.d/ au démarrage.
# On supprime la configuration par défaut pour éviter tout doublon.
USER root
RUN rm -f /etc/nginx/conf.d/default.conf
COPY docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html
USER nginx

EXPOSE 8080

# Utilisé par Docker / Swarm (donc par Dokploy) pour savoir si le conteneur
# est prêt : une mise à jour dont la sonde échoue n'est pas basculée.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/healthz || exit 1
