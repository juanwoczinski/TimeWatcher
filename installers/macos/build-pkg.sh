#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="${1:-$PROJECT_DIR/timewatcher-platform/public/downloads}"
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT

mkdir -p "$BUILD_DIR/root/Applications/TimeWatcher.app/Contents/MacOS" \
  "$BUILD_DIR/root/Applications/TimeWatcher.app/Contents/Resources" \
  "$BUILD_DIR/scripts" "$OUTPUT_DIR"

swiftc "$PROJECT_DIR/watchsynova-agent/macos/WatchSynovaCapture.swift" \
  -framework AppKit -framework ApplicationServices -framework CoreGraphics \
  -o "$BUILD_DIR/root/Applications/TimeWatcher.app/Contents/MacOS/TimeWatcher"
cp "$PROJECT_DIR/watchsynova-agent/macos/TimeWatcher-Info.plist" "$BUILD_DIR/root/Applications/TimeWatcher.app/Contents/Info.plist"
cp "$PROJECT_DIR/watchsynova-agent/assets/TimeWatcher.icns" "$BUILD_DIR/root/Applications/TimeWatcher.app/Contents/Resources/TimeWatcher.icns"
cp -R /Users/juankleber/Applications/ActivityWatch.app "$BUILD_DIR/root/Applications/TimeWatcher.app/Contents/Resources/ActivityWatch.app"
cp "$PROJECT_DIR/watchsynova-agent/macos/watchsynova_screenshot_agent.py" "$BUILD_DIR/root/Applications/TimeWatcher.app/Contents/Resources/timewatcher_agent.py"
chmod 755 "$BUILD_DIR/root/Applications/TimeWatcher.app/Contents/Resources/timewatcher_agent.py"

cp "$SCRIPT_DIR/postinstall" "$BUILD_DIR/scripts/postinstall"
chmod 755 "$BUILD_DIR/scripts/postinstall"
codesign --force --deep --sign - "$BUILD_DIR/root/Applications/TimeWatcher.app"
rm -f "$OUTPUT_DIR/TimeWatcher-Agent-macOS.zip"
ditto -c -k --sequesterRsrc --keepParent "$BUILD_DIR/root/Applications/TimeWatcher.app" "$OUTPUT_DIR/TimeWatcher-Agent-macOS.zip"
pkgbuild --root "$BUILD_DIR/root" --scripts "$BUILD_DIR/scripts" \
  --identifier com.timewatcher.agent --version 0.4.0 \
  "$OUTPUT_DIR/TimeWatcher-macOS.pkg"
shasum -a 256 "$OUTPUT_DIR/TimeWatcher-macOS.pkg" > "$OUTPUT_DIR/TimeWatcher-macOS.pkg.sha256"
shasum -a 256 "$OUTPUT_DIR/TimeWatcher-Agent-macOS.zip" > "$OUTPUT_DIR/TimeWatcher-Agent-macOS.zip.sha256"
echo "$OUTPUT_DIR/TimeWatcher-macOS.pkg"
