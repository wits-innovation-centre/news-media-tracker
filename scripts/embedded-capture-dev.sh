#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

: "${ATOM_STACK_COMPOSE_FILE:=$ROOT_DIR/docker-compose.yml}"
: "${ATOM_STACK_SERVICE:=atom}"
: "${ATOM_ADMIN_PASSWORD:=Admin123!}"
: "${ATOM_BOOTSTRAP_PASSWORD:=$ATOM_ADMIN_PASSWORD}"
: "${ATOM_SITE_BASE_URL:=http://atom.local}"

if [[ "${SKIP_ATOM_BOOTSTRAP:-0}" != "1" ]]; then
  echo "[embedded] Starting AtoM stack..."
  npm run workspace.service.stack.up

  table_present="$({
    docker compose --profile atom-stack exec -T atom-db sh -lc \
      'mariadb -N -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" -D"$MARIADB_DATABASE" -e "SHOW TABLES LIKE \"object\";"' \
      2>/dev/null || true
  } | tr -d '\r' | tr -d '\n')"

  if [[ "$table_present" != "object" ]]; then
    echo "[embedded] Database schema missing (atom.object not found). Running forced bootstrap..."
    ATOM_STACK_COMPOSE_FILE="$ATOM_STACK_COMPOSE_FILE" \
    ATOM_STACK_SERVICE="$ATOM_STACK_SERVICE" \
    ATOM_ADMIN_PASSWORD="$ATOM_ADMIN_PASSWORD" \
    ATOM_BOOTSTRAP_PASSWORD="$ATOM_BOOTSTRAP_PASSWORD" \
    ATOM_SITE_BASE_URL="$ATOM_SITE_BASE_URL" \
    npm run workspace.service.bootstrap.force
  else
    echo "[embedded] Database schema present. Running idempotent bootstrap..."
    ATOM_STACK_COMPOSE_FILE="$ATOM_STACK_COMPOSE_FILE" \
    ATOM_STACK_SERVICE="$ATOM_STACK_SERVICE" \
    ATOM_ADMIN_PASSWORD="$ATOM_ADMIN_PASSWORD" \
    ATOM_BOOTSTRAP_PASSWORD="$ATOM_BOOTSTRAP_PASSWORD" \
    ATOM_SITE_BASE_URL="$ATOM_SITE_BASE_URL" \
    npm run workspace.service.bootstrap
  fi
else
  echo "[embedded] SKIP_ATOM_BOOTSTRAP=1, skipping stack/bootstrap steps."
fi

echo "[embedded] Starting app runtime in hosted-atom mode..."
npm run workspace.app.dev
