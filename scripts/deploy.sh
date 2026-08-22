#!/usr/bin/env bash
# VPS'te /opt/apps/espcode içinden çalışır. git pull + imaj build + migration.
# Toolchain bootstrap (arduino-cli core install) ve cache ısıtma bunun DIŞINDA —
# bkz. docs/backend.plan.md §8 Adım 4-5, yalnızca ilk kurulumda/core güncellemesinde.
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE_FILE="docker-compose.prod.yml"
compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

git pull --ff-only

compose build
compose up -d

echo "== prisma migrate deploy =="
compose exec -T ide-api npx prisma migrate deploy

echo "== durum =="
compose ps
