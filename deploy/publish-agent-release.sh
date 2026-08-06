#!/usr/bin/env bash
set -euo pipefail

PLATFORM="${1:?platform required}"
VERSION="${2:?version required}"
URL="${3:?url required}"
SHA256="${4:?sha256 required}"

set -a
source /etc/watchsynova/ingest.env
set +a

curl --fail --silent --show-error -X POST http://127.0.0.1:5610/internal/agent-release \
  -H "Authorization: Bearer $WATCHSYNOVA_INGEST_TOKEN" \
  -H 'Content-Type: application/json' \
  --data "{\"platform\":\"$PLATFORM\",\"version\":\"$VERSION\",\"url\":\"$URL\",\"sha256\":\"$SHA256\"}" >/dev/null
