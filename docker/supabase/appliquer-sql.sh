#!/bin/bash
# =====================================================================
#  PiloTerra — application des scripts sql/ sur la pile locale
#
#  Lancé par le service « migrations » de docker-compose.yml, une fois
#  la base, l'authentification et le stockage prêts (les scripts
#  touchent auth.users et storage.buckets).
#
#  Applique, dans l'ordre de sql/ordre.txt, les scripts pas encore
#  passés. Journal : table piloterra_local.scripts_sql (nom du fichier,
#  empreinte SHA-256). Un script déjà passé n'est jamais rejoué, même
#  modifié depuis : le script le signale. Pour tout rejouer :
#    docker compose down -v && docker compose up -d
# =====================================================================
set -euo pipefail

SQL_DIR=/sql
ORDRE="$SQL_DIR/ordre.txt"

export PGHOST=db PGPORT=5432 PGUSER=postgres PGDATABASE=postgres

psql_q() { psql -v ON_ERROR_STOP=1 -q -X "$@"; }

psql_q <<'SQL'
create schema if not exists piloterra_local;
create table if not exists piloterra_local.scripts_sql (
  fichier text primary key,
  empreinte text not null,
  applique_le timestamptz not null default now()
);
SQL

# Un script présent dans sql/ mais absent de l'ordre ne passerait jamais.
for chemin in "$SQL_DIR"/*.sql; do
  fichier=$(basename "$chemin")
  if ! grep -qxF "$fichier" "$ORDRE"; then
    echo "ATTENTION : $fichier n'est pas listé dans sql/ordre.txt, il n'est pas appliqué."
  fi
done

nb=0
while IFS= read -r fichier || [ -n "$fichier" ]; do
  fichier=${fichier%%#*}
  fichier=$(echo "$fichier" | tr -d '[:space:]')
  [ -z "$fichier" ] && continue

  if [ ! -f "$SQL_DIR/$fichier" ]; then
    echo "ERREUR : $fichier, listé dans sql/ordre.txt, est introuvable."
    exit 1
  fi

  empreinte=$(sha256sum "$SQL_DIR/$fichier" | cut -d' ' -f1)
  deja=$(psql -X -At -v fichier="$fichier" <<'SQL'
select empreinte from piloterra_local.scripts_sql where fichier = :'fichier';
SQL
)

  if [ -n "$deja" ]; then
    if [ "$deja" != "$empreinte" ]; then
      echo "ATTENTION : $fichier a changé depuis son application ; il n'est pas rejoué."
    fi
    continue
  fi

  echo "→ $fichier"
  psql_q -f "$SQL_DIR/$fichier"
  psql_q -v fichier="$fichier" -v empreinte="$empreinte" <<'SQL'
insert into piloterra_local.scripts_sql (fichier, empreinte) values (:'fichier', :'empreinte');
SQL
  nb=$((nb + 1))
done < "$ORDRE"

echo "Scripts SQL : $nb appliqué(s), base à jour."
