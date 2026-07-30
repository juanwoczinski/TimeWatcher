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

Persistent ActivityWatch data is owned by the dedicated `activitywatch` system
user under `/var/lib/activitywatch`. Application files live under
`/opt/watchsynova`.
