#!/usr/bin/env bash
# backend.plan.md §8 Adım 5 + §10 — build cache'i sıfırla, desteklenen her FQBN
# için bir kez derleyip core.a önbelleğini yeniden doldur. Soğuk derleme bu
# CPU'da 4-8 dk sürüyor; bunu bir kullanıcı isteği tetiklememeli.
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose stop ide-builder
docker compose run --rm --entrypoint sh ide-builder -c 'rm -rf /var/cache/arduino/*'
docker compose up -d ide-builder

FQBNS=(esp32:esp32:esp32 esp32:esp32:esp32c3 esp32:esp32:esp32s3 esp32:esp32:esp32c6)
for FQBN in "${FQBNS[@]}"; do
  echo "== ısıtılıyor: $FQBN =="
  docker compose run --rm --entrypoint arduino-cli ide-builder \
    compile --fqbn "$FQBN" --jobs 2 /app/warmup/Blink
done
