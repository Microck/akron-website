#!/usr/bin/env bash
# Deploy/update the akron-status-api Cloudflare Worker.
# Requires CLOUDFLARE_API_TOKEN with Workers Scripts edit.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ACC="${CLOUDFLARE_ACCOUNT_ID:-3bf786cef8d90ef18cad43350a9ed35c}"
SCRIPT_NAME="${STATUS_API_WORKER_NAME:-akron-status-api}"
ORIGIN="${STATUS_ORIGIN:?Set STATUS_ORIGIN to the live Gatus public origin URL}"
TOKEN="${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN required}"
USER_AGENT="OpenAI File Downloader, XaiImageApiFetch/1.0"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cp "$ROOT/status-api-worker.js" "$TMP/worker.js"
python3 - "$TMP/metadata.json" "$ORIGIN" <<'PY'
import json
import sys
from pathlib import Path
meta = {
  "main_module": "worker.js",
  "bindings": [{
    "type": "plain_text",
    "name": "STATUS_ORIGIN",
    "text": sys.argv[2],
  }],
}
Path(sys.argv[1]).write_text(json.dumps(meta))
PY

curl -A "$USER_AGENT" -sS -m 60 -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/${ACC}/workers/scripts/${SCRIPT_NAME}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -F "metadata=@${TMP}/metadata.json;type=application/json" \
  -F "worker.js=@${TMP}/worker.js;type=application/javascript+module" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); assert d.get("success"), d; print("worker_deploy_ok", d["result"]["id"])'

curl -A "$USER_AGENT" -sS -m 30 -X POST \
  "https://api.cloudflare.com/client/v4/accounts/${ACC}/workers/scripts/${SCRIPT_NAME}/subdomain" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"enabled":true}' \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); assert d.get("success"), d; print("workers_dev_enabled")'

SUB="$(curl -A "$USER_AGENT" -sS -m 20 -H "Authorization: Bearer ${TOKEN}" \
  "https://api.cloudflare.com/client/v4/accounts/${ACC}/workers/subdomain" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["subdomain"])')"

echo "public=https://${SCRIPT_NAME}.${SUB}.workers.dev/api/v1/config"
curl -A "$USER_AGENT" --fail-with-body -sS -m 30 -o "$TMP/health.json" -w "health_http=%{http_code}\n" \
  "https://${SCRIPT_NAME}.${SUB}.workers.dev/api/v1/config"
head -c 200 "$TMP/health.json"; echo
