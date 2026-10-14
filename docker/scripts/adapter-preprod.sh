#!/bin/sh
#
# PiloTerra — contrôles et adaptation de la préproduction
# -------------------------------------------------------
# Exécuté DANS l'étage de build du Dockerfile, sur la copie des sources de
# l'image. Le dépôt lui-même n'est jamais modifié.
#
# Supabase et n8n ne sont plus remplacés ici : depuis le 15/09/2026, le code
# les lit dans des variables VITE_* (supabaseClient.ts, n8nConfig.ts), que
# Vite écrit dans le JavaScript au build. Ce script :
#   - contrôle ces variables avant le build ;
#   - adapte ce qui reste écrit en dur : domaine public, robots.txt, Google
#     Analytics et, au besoin, l'origine des images et PDF publics ;
#   - vérifie après le build qu'aucune clé ni API Supabase de production
#     n'est servie, et que le bundle vise bien la préproduction.
#
#   sh docker/scripts/adapter-preprod.sh sources   # avant `vite build`
#   sh docker/scripts/adapter-preprod.sh dist      # après `vite build`
#
# Variables lues (arguments de build du Dockerfile) :
#   VITE_SUPABASE_URL       URL du Supabase de préproduction           (obligatoire)
#   VITE_SUPABASE_ANON_KEY  clé anon de ce Supabase                     (obligatoire)
#   VITE_N8N_ENVIRONNEMENT  doit valoir dev                             (obligatoire)
#   SITE_URL                domaine public de la préproduction          (obligatoire)
#   STOCKAGE_SUPABASE       prod | preprod — origine des images et PDF  (défaut prod)
#   ANALYTICS               1 = garder Google Analytics                 (défaut 0)
#
# Principe de sûreté : une préproduction branchée par erreur sur la
# production ne doit jamais partir en ligne. Tout doute fait ÉCHOUER le build.

set -eu

PHASE="${1:-}"

# Valeurs de production connues
SITE_PROD='https://piloterra.fr'
SUPABASE_PROD='https://dgtctavkmcyhqopngcxk.supabase.co'
REF_PROD='dgtctavkmcyhqopngcxk'

echec()  { echo "ERREUR [préprod] : $*" >&2; exit 1; }
alerte() { echo "ATTENTION [préprod] : $*" >&2; }
info()   { echo "[préprod] $*"; }

# Échappe une chaîne pour un motif ERE (sed -E délimité par #, grep -E).
# Le « / » n'est pas échappé : inutile avec le délimiteur #, et GNU grep
# signale un « \/ » superflu.
motif() { printf '%s' "$1" | sed 's/[][\\.*^$+?(){}|]/\\&/g'; }
# Échappe une chaîne pour la partie « remplacement » d'un sed délimité par #
rempl() { printf '%s' "$1" | sed 's/[\\&#]/\\&/g'; }

# Contenu décodé d'un JWT (sa partie centrale). Vide si illisible.
contenu_jwt() {
  _p="$(printf '%s' "$1" | cut -d. -f2 | tr '_-' '/+')"
  case $(( ${#_p} % 4 )) in
    2) _p="${_p}==" ;;
    3) _p="${_p}=" ;;
  esac
  printf '%s' "$_p" | base64 -d 2>/dev/null || true
}

# Fichiers sources susceptibles de contenir une valeur en dur
lister_sources() {
  find . \( -path ./node_modules -o -path ./dist -o -path ./docker \
            -o -path ./.git -o -path ./sql \) -prune \
    -o -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.mjs' \
                  -o -name '*.js' -o -name '*.html' -o -name '*.txt' \) -print
}

# Remplace $1 (texte littéral) par $2 dans tous les fichiers sources qui le
# contiennent
remplacer_partout() {
  _de="$(motif "$1")"
  _vers="$(rempl "$2")"
  lister_sources | while IFS= read -r _f; do
    if grep -qF "$1" "$_f"; then
      sed -i -E "s#${_de}#${_vers}#g" "$_f"
    fi
  done
}

# ---------------------------------------------------------------------
# Phase 1 — sources
# ---------------------------------------------------------------------
phase_sources() {
  VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-}"; VITE_SUPABASE_URL="${VITE_SUPABASE_URL%/}"
  VITE_SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY:-}"
  VITE_N8N_ENVIRONNEMENT="${VITE_N8N_ENVIRONNEMENT:-}"
  SITE_URL="${SITE_URL:-}"; SITE_URL="${SITE_URL%/}"
  STOCKAGE_SUPABASE="${STOCKAGE_SUPABASE:-prod}"
  ANALYTICS="${ANALYTICS:-0}"

  # --- Contrôle des paramètres ---------------------------------------
  [ -n "$VITE_SUPABASE_ANON_KEY" ] || echec "VITE_SUPABASE_ANON_KEY est vide. Renseigner la clé anon du Supabase de préproduction dans les Build-time Arguments de Dokploy."
  case "$VITE_SUPABASE_URL" in https://?*) ;; *) echec "VITE_SUPABASE_URL doit commencer par https:// (reçu : '$VITE_SUPABASE_URL')." ;; esac
  [ "$VITE_SUPABASE_URL" != "$SUPABASE_PROD" ] || echec "VITE_SUPABASE_URL pointe sur le Supabase de production."
  case "$SITE_URL" in https://?*) ;; *) echec "SITE_URL doit commencer par https:// (reçu : '$SITE_URL')." ;; esac
  [ "$SITE_URL" != "$SITE_PROD" ] || echec "SITE_URL pointe sur le domaine de production."
  case "$STOCKAGE_SUPABASE" in prod|preprod) ;; *) echec "STOCKAGE_SUPABASE doit valoir prod ou preprod (reçu : '$STOCKAGE_SUPABASE')." ;; esac
  [ "$VITE_N8N_ENVIRONNEMENT" = "dev" ] || echec "VITE_N8N_ENVIRONNEMENT doit valoir dev en préproduction (reçu : '$VITE_N8N_ENVIRONNEMENT') : les workflows de prod écrivent dans la base de production."

  # Clé : jamais une clé secrète, jamais celle du projet de production
  case "$VITE_SUPABASE_ANON_KEY" in
    sb_secret_*)
      echec "VITE_SUPABASE_ANON_KEY est une clé secrète : prendre la clé anon, publique."
      ;;
    sb_publishable_*)
      alerte "clé au format sb_publishable_ : son projet ne peut pas être vérifié. S'assurer qu'elle vient de $VITE_SUPABASE_URL."
      ;;
    *)
      _contenu="$(contenu_jwt "$VITE_SUPABASE_ANON_KEY")"
      [ -n "$_contenu" ] || echec "VITE_SUPABASE_ANON_KEY n'est pas une clé Supabase lisible."
      printf '%s' "$_contenu" | grep -qE '"role" *: *"anon"' \
        || echec "VITE_SUPABASE_ANON_KEY n'est pas une clé anon. Jamais la service_role : elle serait lisible par tout visiteur."
      if printf '%s' "$_contenu" | grep -qE "\"ref\" *: *\"$REF_PROD\""; then
        echec "VITE_SUPABASE_ANON_KEY est la clé du Supabase de production."
      fi
      ;;
  esac

  # --- Structure attendue des sources ----------------------------------
  grep -qF 'import.meta.env.VITE_SUPABASE_URL' supabaseClient.ts 2>/dev/null \
    || echec "supabaseClient.ts ne lit plus VITE_SUPABASE_URL : la structure des sources a changé."
  grep -qF 'VITE_N8N_ENVIRONNEMENT' n8nConfig.ts 2>/dev/null \
    || echec "n8nConfig.ts ne lit plus VITE_N8N_ENVIRONNEMENT : la structure des sources a changé."

  info "Supabase : $VITE_SUPABASE_URL (lu par Vite)"
  info "n8n : copies « dev- » des workflows (VITE_N8N_ENVIRONNEMENT=dev)"

  # --- 1. Images et PDF publics -----------------------------------------
  if [ "$STOCKAGE_SUPABASE" = "preprod" ]; then
    remplacer_partout "$SUPABASE_PROD/storage/" "$VITE_SUPABASE_URL/storage/"
    info "Stockage : images et PDF publics lus sur le Supabase de préproduction (bucket PiloTerra à recopier)"
  else
    info "Stockage : images et PDF publics lus sur le Supabase de production, en lecture seule"
  fi

  # --- 2. Domaine public ----------------------------------------------
  # Canoniques, sitemap, llms.txt, liens absolus du footer
  remplacer_partout "$SITE_PROD" "$SITE_URL"
  info "Domaine : $SITE_PROD → $SITE_URL"

  # --- 3. robots.txt --------------------------------------------------
  # Complète l'en-tête X-Robots-Tag posé par Nginx
  printf '%s\n' \
    '# Préproduction PiloTerra : exploration interdite' \
    'User-agent: *' \
    'Disallow: /' > public/robots.txt
  info "robots.txt : exploration interdite"

  # --- 4. Google Analytics --------------------------------------------
  if [ "$ANALYTICS" != "1" ]; then
    # La balise gtag est remplacée par une fonction vide, pas supprimée :
    # analytics.ts ne fait rien si window.gtag est absent, y compris le
    # relevé d'impact carbone qu'on veut pouvoir tester en préproduction.
    node -e '
      const fs = require("fs");
      const html = fs.readFileSync("index.html", "utf8");
      const balise = /(?:<!--\s*Google tag \(gtag\.js\)\s*-->\s*)?<script[^>]*googletagmanager\.com\/gtag\/js[^>]*><\/script>\s*<script>[\s\S]*?<\/script>/;
      if (!balise.test(html)) {
        if (html.includes("googletagmanager")) {
          console.error("ERREUR [préprod] : balise Google Analytics présente mais de forme inattendue dans index.html.");
          process.exit(1);
        }
        process.exit(0);
      }
      fs.writeFileSync("index.html", html.replace(balise,
        "<!-- Google Analytics neutralisé en préproduction (docker/scripts/adapter-preprod.sh) -->\n" +
        "    <script>window.dataLayer = window.dataLayer || []; function gtag() {}</script>"));
    '
    info "Google Analytics : neutralisé"
  else
    alerte "ANALYTICS=1 : les visites de préproduction seront comptées dans Google Analytics."
  fi
}

# ---------------------------------------------------------------------
# Phase 2 — dist
# ---------------------------------------------------------------------
phase_dist() {
  VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-}"; VITE_SUPABASE_URL="${VITE_SUPABASE_URL%/}"
  STOCKAGE_SUPABASE="${STOCKAGE_SUPABASE:-prod}"
  ANALYTICS="${ANALYTICS:-0}"

  [ -d dist ] || echec "dist/ absent : le build a échoué."
  [ -n "$VITE_SUPABASE_URL" ] || echec "VITE_SUPABASE_URL vide en phase dist."

  # 1. Aucune clé du projet de production, ni aucune clé service_role
  for _jeton in $(grep -rhoE 'eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+' dist | sort -u); do
    _contenu="$(contenu_jwt "$_jeton")"
    if printf '%s' "$_contenu" | grep -qE "\"ref\" *: *\"$REF_PROD\""; then
      echec "une clé du Supabase de production est présente dans dist/."
    fi
    if printf '%s' "$_contenu" | grep -qE '"role" *: *"service_role"'; then
      echec "une clé service_role est présente dans dist/."
    fi
  done

  # 2. Aucun appel d'API vers le Supabase de production. Seules les URL de
  #    stockage public sont tolérées, et seulement si STOCKAGE_SUPABASE=prod.
  _restes="$(grep -rhoE "$(motif "$SUPABASE_PROD")[^\"'\` )]{0,12}" dist || true)"
  if [ "$STOCKAGE_SUPABASE" = "prod" ]; then
    _restes="$(printf '%s\n' "$_restes" | grep -vF "$SUPABASE_PROD/storage/" || true)"
  fi
  if [ -n "$(printf '%s' "$_restes" | tr -d '[:space:]')" ]; then
    printf '%s\n' "$_restes" | sort -u >&2
    echec "des références au Supabase de production subsistent dans dist/ (ci-dessus)."
  fi

  # 3. L'application pointe bien sur la préproduction : sinon, les
  #    variables VITE_* ne sont pas arrivées jusqu'à Vite (page blanche)
  grep -rqF "$VITE_SUPABASE_URL" dist/assets \
    || echec "le bundle JavaScript ne contient pas $VITE_SUPABASE_URL : les variables VITE_* n'ont pas été transmises à Vite (Build-time Arguments ?)."

  # 4. Analytics
  # (find plutôt que grep --include, absent du grep BusyBox d'Alpine)
  if [ "$ANALYTICS" != "1" ] \
     && [ -n "$(find dist -name '*.html' -exec grep -lF 'googletagmanager.com/gtag' {} + || true)" ]; then
    echec "Google Analytics est encore chargé par une page de dist/."
  fi

  # 5. Domaine de production : simple avertissement, le texte des contenus
  #    venus de la base peut le citer légitimement
  _nb="$(grep -roF "$SITE_PROD" dist | wc -l | tr -d ' ')"
  [ "$_nb" = "0" ] || alerte "$_nb mention(s) de $SITE_PROD restent dans dist/ (probablement dans le texte des contenus)."

  info "Contrôles de dist/ passés : aucune clé ni API Supabase de production, bundle branché sur $VITE_SUPABASE_URL."
}

case "$PHASE" in
  sources) phase_sources ;;
  dist)    phase_dist ;;
  *)       echec "usage : $0 sources|dist" ;;
esac
