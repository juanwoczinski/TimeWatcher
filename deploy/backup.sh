#!/usr/bin/env bash
# TimeWatcher — daily backup of the platform state (config, session secret,
# accounts/invites, audit log, avatars). Screenshots and ActivityWatch
# telemetry are intentionally excluded (large; back them up separately).
# Install: sudo install -m0755 backup.sh /opt/teamwatcher-backup.sh
# Cron (root): 0 3 * * *  /opt/teamwatcher-backup.sh >> /var/log/teamwatcher-backup.log 2>&1
set -euo pipefail

DATA_DIR="${WATCHSYNOVA_DATA_DIR:-/var/lib/watchsynova-ingest}"
DEST="${TIMEWATCHER_BACKUP_DIR:-/var/backups/teamwatcher}"
KEEP="${TIMEWATCHER_BACKUP_KEEP:-14}"

install -d -m 0700 "$DEST"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
FILE="$DEST/teamwatcher-$STAMP.tar.gz"

tar czf "$FILE" -C "$DATA_DIR" --exclude=screenshots . 2>/dev/null || true
chmod 0600 "$FILE"

# keep only the newest $KEEP archives
ls -1t "$DEST"/teamwatcher-*.tar.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f

echo "$(date -u +%FT%TZ) backup ok: $FILE ($(du -h "$FILE" | cut -f1))"
