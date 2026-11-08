#!/usr/bin/env bash
# Save one rig page as a self-contained HTML file (ADR 0001, ADR 0003).
# Usage: scripts/save-preview.sh <out.html> [path]   (path defaults to /digest/2026-10-28)
# LANE_MARKER from the environment wins over .env; set it empty for the "no marker set" copy.
set -euo pipefail
out=${1:?usage: save-preview.sh <out.html> [path]}
path=${2:-/digest/2026-10-28}
port=${PREVIEW_PORT:-8799}

PORT=$port node_modules/.bin/tsx --env-file-if-exists=.env src/server.ts >/dev/null &
pid=$!
trap 'kill "$pid" 2>/dev/null || true' EXIT

for _ in $(seq 1 50); do
  curl -fsS "http://127.0.0.1:$port/health" >/dev/null 2>&1 && break
  sleep 0.2
done

mkdir -p "$(dirname "$out")"
curl -fsS "http://127.0.0.1:$port$path" -o "$out"
echo "saved $path -> $out"
