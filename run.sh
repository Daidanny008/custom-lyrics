#!/usr/bin/env bash
# validate -> build index -> serve -> open
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8080}"

if [ ! -e lyrics/README.md ] && [ -z "$(ls -A lyrics 2>/dev/null || true)" ]; then
  echo "lyrics/ is empty — the data submodule isn't checked out."
  echo "  git submodule update --init"
  exit 1
fi

python3 tools/validate.py || echo "  (continuing; broken songs will be skipped)"
python3 tools/build_index.py || true
python3 tools/stats.py >/dev/null || true

URL="http://localhost:${PORT}/displayer/"
command -v open >/dev/null && (sleep 1 && open "$URL" &) || true
exec python3 tools/serve.py --port "$PORT"
