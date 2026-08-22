#!/usr/bin/env bash
# backend.plan.md §8 Adım 5 + §10 — build cache'i sıfırla, desteklenen her FQBN
# için bir kez derleyip core.a önbelleğini yeniden doldur. Soğuk derleme bu
# CPU'da 4-8 dk sürüyor; bunu bir kullanıcı isteği tetiklememeli.
set -euo pipefail
cd "$(dirname "$0")/.."

# Prod'da COMPOSE_FILE=docker-compose.prod.yml ile çağrılır.
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

compose stop ide-builder
compose run --rm --entrypoint sh ide-builder -c 'rm -rf /var/cache/arduino/*'
compose up -d ide-builder

FQBNS=(esp32:esp32:esp32 esp32:esp32:esp32c3 esp32:esp32:esp32s3 esp32:esp32:esp32c6)
for FQBN in "${FQBNS[@]}"; do
  echo "== ısıtılıyor: $FQBN =="
  compose run --rm --entrypoint arduino-cli ide-builder \
    compile --fqbn "$FQBN" --jobs 2 /app/warmup/Blink
done
