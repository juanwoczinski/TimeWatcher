#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TARGET_DIR="$HOME/Applications"
TARGET_APP="$TARGET_DIR/TimeWatcher.app"
ARCHIVE="$PROJECT_DIR/timewatcher-platform/public/downloads/TimeWatcher-Agent-macOS.zip"
BACKUP_APP="$TARGET_DIR/TimeWatcher.app.backup-local-$(date +%Y%m%d%H%M%S)"
STAGE_DIR="$(mktemp -d)"

"$SCRIPT_DIR/build-pkg.sh" >/dev/null
mkdir -p "$TARGET_DIR"

# Stop every previous TimeWatcher/ActivityWatch collector so only the bundled
# components from the new app remain active.
pkill -f '/TimeWatcher.app/Contents/MacOS/TimeWatcher$' 2>/dev/null || true
pkill -x aw-watcher-window 2>/dev/null || true
pkill -x aw-watcher-input 2>/dev/null || true
pkill -x aw-watcher-afk 2>/dev/null || true
pkill -x aw-server 2>/dev/null || true
sleep 2

if [[ -d "$TARGET_APP" ]]; then
  mv "$TARGET_APP" "$BACKUP_APP"
fi

ditto -x -k "$ARCHIVE" "$STAGE_DIR"
ditto "$STAGE_DIR/TimeWatcher.app" "$TARGET_APP"
xattr -dr com.apple.quarantine "$TARGET_APP"
codesign --verify --deep --strict "$TARGET_APP"
open "$TARGET_APP"

for _ in {1..20}; do
  if pgrep -f "$TARGET_APP/Contents/MacOS/TimeWatcher" >/dev/null; then
    echo "TimeWatcher Agent instalado e iniciado: $TARGET_APP"
    exit 0
  fi
  sleep 1
done

echo "O TimeWatcher Agent foi instalado, mas não iniciou." >&2
exit 1
