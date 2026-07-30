#!/usr/bin/env python3
"""Consent-gated screenshot uploader for WatchSynova on macOS."""

import json
import platform
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

CONFIG = Path.home() / "Library/Application Support/WatchSynova/screenshot-agent.json"
QUEUE = Path.home() / "Library/Application Support/WatchSynova/screenshot-queue"


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


def run_once(config: dict) -> bool:
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
        return True
    return False


def main() -> None:
    config = json.loads(CONFIG.read_text())
    if config.get("consent") is not True:
        raise SystemExit("Screenshot capture is disabled until consent=true")
    interval = max(30, int(config.get("interval_seconds", 60)))
    if "--once" in sys.argv:
        raise SystemExit(0 if run_once(config) else 1)
    while True:
        run_once(config)
        time.sleep(interval)


if __name__ == "__main__":
    main()
