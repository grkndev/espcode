#!/usr/bin/env bash
# backend.plan.md §10 — build cache 8 GB'ı aşarsa en eski erişilmiş dosyaları sil.
set -euo pipefail
CACHE=/var/lib/docker/volumes/espcode_ide_buildcache/_data
LIMIT_MB=8192
while [ "$(du -sm "$CACHE" | cut -f1)" -gt "$LIMIT_MB" ]; do
  find "$CACHE" -type f -printf '%A@ %p\n' | sort -n | head -50 | cut -d' ' -f2- | xargs -r rm -f
done
