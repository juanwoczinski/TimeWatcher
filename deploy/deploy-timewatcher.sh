#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REMOTE_HOST="${TIMEWATCHER_HOST:-ubuntu@32.193.139.223}"
SSH_KEY="${TIMEWATCHER_SSH_KEY:-/Users/juankleber/Documents/Codex/2026-07-18/ten/outputs/aws_recovery_ed25519}"
RELEASE_ID="$(date -u +%Y%m%d%H%M%S)"
REMOTE_STAGE="/tmp/timewatcher-release-$RELEASE_ID"

if [[ ! -f "$SSH_KEY" ]]; then
  echo "Chave SSH não encontrada: $SSH_KEY" >&2
  exit 1
fi

SSH=(ssh -i "$SSH_KEY" -o BatchMode=yes)
RSYNC_SSH="ssh -i $SSH_KEY -o BatchMode=yes"

echo "[1/5] Enviando a versão para $REMOTE_HOST"
"${SSH[@]}" "$REMOTE_HOST" "mkdir -p '$REMOTE_STAGE/platform' '$REMOTE_STAGE/config'"
rsync -az --delete \
  --exclude '.git' --exclude 'node_modules' --exclude 'dist' --exclude '.wrangler' \
  -e "$RSYNC_SSH" "$PROJECT_DIR/timewatcher-platform/" "$REMOTE_HOST:$REMOTE_STAGE/platform/"
scp -i "$SSH_KEY" \
  "$PROJECT_DIR/watchsynova-agent/server/ingest_server.py" \
  "$PROJECT_DIR/watchsynova-agent/server/watchsynova-ingest.service" \
  "$PROJECT_DIR/deploy/timewatcher-platform.service" \
  "$PROJECT_DIR/deploy/watchsynova.caddy" \
  "$REMOTE_HOST:$REMOTE_STAGE/config/"

echo "[2/5] Instalando dependências e construindo o dashboard"
"${SSH[@]}" "$REMOTE_HOST" "bash -s" <<REMOTE
set -euo pipefail
sudo install -d -o timewatcher-platform -g timewatcher-platform /opt/timewatcher-platform /var/lib/timewatcher-platform
sudo rsync -a --delete --exclude node_modules '$REMOTE_STAGE/platform/' /opt/timewatcher-platform/
sudo chown -R timewatcher-platform:timewatcher-platform /opt/timewatcher-platform
cd /opt/timewatcher-platform
sudo -u timewatcher-platform npm install
sudo -u timewatcher-platform npm run build
sudo install -d -o timewatcher-platform -g timewatcher-platform /opt/timewatcher-platform/public/downloads

echo "[3/5] Atualizando API e serviços"
sudo install -m 0755 '$REMOTE_STAGE/config/ingest_server.py' /opt/watchsynova-agent/ingest_server.py
sudo install -m 0644 '$REMOTE_STAGE/config/watchsynova-ingest.service' /etc/systemd/system/watchsynova-ingest.service
sudo install -m 0644 '$REMOTE_STAGE/config/timewatcher-platform.service' /etc/systemd/system/timewatcher-platform.service
sudo caddy validate --config '$REMOTE_STAGE/config/watchsynova.caddy' --adapter caddyfile
sudo install -m 0644 '$REMOTE_STAGE/config/watchsynova.caddy' /etc/caddy/Caddyfile
sudo systemctl daemon-reload
sudo systemctl enable watchsynova-ingest timewatcher-platform caddy >/dev/null
sudo systemctl restart watchsynova-ingest timewatcher-platform caddy

echo "[4/5] Validando saúde dos serviços"
for service in watchsynova watchsynova-ingest timewatcher-platform caddy; do
  sudo systemctl is-active --quiet "\$service"
done
wait_url() {
  local url="\$1"
  for _ in {1..30}; do
    if curl --fail --silent "\$url" >/dev/null; then return 0; fi
    sleep 1
  done
  echo "Falha na verificação: \$url" >&2
  return 1
}
wait_url http://127.0.0.1:5610/health
# The dashboard API now requires an authenticated session; a healthy server
# rejects anonymous access with 401 instead of serving data.
test "\$(curl -s -o /dev/null -w '%{http_code}' 'http://127.0.0.1:5610/dashboard/data?period=today')" = "401"
wait_url http://127.0.0.1:3110/
rm -rf '$REMOTE_STAGE'
REMOTE

echo "[5/5] Deploy concluído: https://timewatcher.32-193-139-223.sslip.io"
