# TimeWatcher deployment

The AWS deployment runs the official ActivityWatch v0.13.2 Linux release as a
systemd service. The server binds only to `127.0.0.1:5600` because ActivityWatch
does not provide authentication for its API. Caddy publishes it over HTTPS with
Basic Authentication at:

<https://timewatcher.32-193-139-223.sslip.io>

Connect from macOS with an SSH tunnel:

```sh
ssh -N \
  -L 127.0.0.1:5600:127.0.0.1:5600 \
  -i /Users/juankleber/Documents/Codex/2026-07-18/ten/outputs/aws_recovery_ed25519 \
  ubuntu@32.193.139.223
```

While the tunnel is running, open <http://127.0.0.1:5600>. The tunnel remains a
fallback for administration; normal browser access uses the public HTTPS URL.

Operational commands on the server:

```sh
sudo systemctl status watchsynova
sudo journalctl -u watchsynova -f
```

Deploy completo e repetível, sem depender de IA:

```sh
./deploy/deploy-timewatcher.sh
```

Para outro host ou chave, defina `TIMEWATCHER_HOST` e
`TIMEWATCHER_SSH_KEY` antes de executar o script.

Persistent ActivityWatch data is owned by the dedicated `activitywatch` system
user under `/var/lib/activitywatch`. Application files live under
`/opt/watchsynova`.
## Deploy rápido

O deploy normal não reenvia os instaladores grandes:

```bash
./deploy/deploy-timewatcher.sh
```

Quando o agente mudar, gere e publique também os instaladores:

```bash
TIMEWATCHER_UPLOAD_INSTALLERS=1 ./deploy/deploy-timewatcher.sh
```

Para substituir o agente deste Mac pela versão atual:

```bash
./installers/macos/install-local.sh
```
