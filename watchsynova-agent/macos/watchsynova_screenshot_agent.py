#!/usr/bin/env python3
"""Consent-gated screenshot uploader for WatchSynova on macOS."""

import json
import platform
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

CONFIG = Path.home() / "Library/Application Support/WatchSynova/screenshot-agent.json"
QUEUE = Path.home() / "Library/Application Support/WatchSynova/screenshot-queue"
SYNC_STATE = Path.home() / "Library/Application Support/WatchSynova/sync-state.json"


def active_window() -> tuple[str, str]:
    try:
        with urllib.request.urlopen("http://127.0.0.1:5600/api/0/buckets/", timeout=3) as response:
            buckets = json.load(response)
        bucket = next(key for key in buckets if key.startswith("aw-watcher-window_"))
        url = f"http://127.0.0.1:5600/api/0/buckets/{bucket}/events?limit=1"
        with urllib.request.urlopen(url, timeout=3) as response:
            events = json.load(response)
        data = events[0].get("data", {}) if events else {}
        return str(data.get("app", "")), str(data.get("title", ""))
    except Exception:
        return "", ""


def upload(path: Path, config: dict) -> bool:
    app, title = active_window()
    request = urllib.request.Request(
        config["server_url"].rstrip("/") + "/ingest/v1/screenshots",
        data=path.read_bytes(), method="POST",
        headers={
            "Authorization": f"Bearer {config['token']}",
            "Content-Type": "image/jpeg",
            "X-Device-Id": platform.node(),
            "X-Captured-At": datetime.now(timezone.utc).isoformat(),
            "X-Active-App": app,
            "X-Active-Title": title,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status == 201
    except (OSError, urllib.error.URLError):
        return False


def authenticated_json(url: str, token: str, payload: dict) -> bool:
    request = urllib.request.Request(
        url, data=json.dumps(payload).encode(), method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status == 201
    except (OSError, urllib.error.URLError):
        return False


def sync_activity(config: dict) -> bool:
    try:
        state = json.loads(SYNC_STATE.read_text()) if SYNC_STATE.exists() else {}
        with urllib.request.urlopen("http://127.0.0.1:5600/api/0/buckets/", timeout=5) as response:
            buckets = json.load(response)
        all_synced = True
        for bucket_id, bucket in buckets.items():
            last_id = int(state.get(bucket_id, 0))
            url = f"http://127.0.0.1:5600/api/0/buckets/{urllib.parse.quote(bucket_id, safe='')}/events?limit=1000"
            with urllib.request.urlopen(url, timeout=10) as response:
                events = json.load(response)
            pending = [event for event in events if int(event.get("id", 0)) > last_id]
            if not pending:
                continue
            pending.reverse()
            if authenticated_json(
                config["server_url"].rstrip("/") + "/ingest/v1/activity-events",
                config["token"], {"bucket": bucket, "events": pending},
            ):
                state[bucket_id] = max(int(event.get("id", 0)) for event in pending)
                SYNC_STATE.write_text(json.dumps(state, indent=2))
                SYNC_STATE.chmod(0o600)
            else:
                all_synced = False
        return all_synced
    except Exception as error:
        print(f"Activity sync failed: {error}", file=sys.stderr)
        return False


def run_once(config: dict) -> bool:
    activity_synced = sync_activity(config)
    QUEUE.mkdir(parents=True, exist_ok=True)
    for pending in sorted(QUEUE.glob("*.jpg")):
        if upload(pending, config):
            pending.unlink()
    target = QUEUE / f"{int(time.time())}.jpg"
    result = subprocess.run(["/usr/sbin/screencapture", "-x", "-m", "-t", "jpg", str(target)])
    if result.returncode != 0 or not target.exists() or target.stat().st_size < 4:
        target.unlink(missing_ok=True)
        print("Screen capture failed. Grant Screen & System Audio Recording permission.", file=sys.stderr)
        return False
    if upload(target, config):
        target.unlink()
        return activity_synced
    return False


def main() -> None:
    config = json.loads(CONFIG.read_text())
    if config.get("consent") is not True:
        raise SystemExit("Screenshot capture is disabled until consent=true")
    interval = max(30, int(config.get("interval_seconds", 60)))
    if "--once" in sys.argv:
        raise SystemExit(0 if run_once(config) else 1)
    if "--sync-only" in sys.argv:
        raise SystemExit(0 if sync_activity(config) else 1)
    while True:
        run_once(config)
        time.sleep(interval)


if __name__ == "__main__":
    main()
