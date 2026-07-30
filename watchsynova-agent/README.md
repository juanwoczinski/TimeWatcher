# WatchSynova screenshot agent

This opt-in extension captures the main macOS display at a configurable interval
and uploads JPEG images to a write-only endpoint over HTTPS. It is designed to
run alongside ActivityWatch and records screenshot metadata in a
`watchsynova.screenshot` bucket.

## Privacy and consent

- Capture requires `consent: true` in the local configuration.
- macOS Screen & System Audio Recording permission is mandatory.
- The LaunchAgent is visible in `~/Library/LaunchAgents` and can be stopped at
  any time.
- The API token is stored outside the Git repository with mode `0600`.
- The public ingestion endpoint permits uploads only; dashboard reads remain
  protected separately.

## Components

- `macos/watchsynova_screenshot_agent.py`: capture, retry queue and upload.
- `macos/WatchSynovaCapture.swift`: native consent prompt and visible menu-bar app.
- `macos/com.watchsynova.screenshot-agent.plist`: per-user background service.
- `server/ingest_server.py`: authenticated, size-limited JPEG receiver.
- `server/watchsynova-ingest.service`: hardened systemd service.

Server images are stored with mode `0600` below
`/var/lib/watchsynova-ingest/screenshots/YYYY-MM-DD`. Screenshot metadata,
including the active application and window title when available, is written to
the ActivityWatch database. Images are deliberately not exposed by a public
download route in this first version.

## Local control

Stop the background agent:

```sh
launchctl bootout gui/$(id -u)/com.watchsynova.screenshot-agent
```

Start it again:

```sh
launchctl bootstrap gui/$(id -u) \
  "$HOME/Library/LaunchAgents/com.watchsynova.screenshot-agent.plist"
```
