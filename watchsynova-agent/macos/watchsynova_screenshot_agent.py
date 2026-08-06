#!/usr/bin/env python3
"""Consent-gated screenshot uploader for WatchSynova on macOS."""

import json
import hashlib
import hmac
import os
import platform
import getpass
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

CONFIG = Path.home() / "Library/Application Support/WatchSynova/screenshot-agent.json"
QUEUE = Path.home() / "Library/Application Support/WatchSynova/screenshot-queue"
SYNC_STATE = Path.home() / "Library/Application Support/WatchSynova/sync-state.json"
UPDATE_STATE = Path.home() / "Library/Application Support/WatchSynova/update-state.json"
AGENT_VERSION = "0.4.0"
MAX_UPDATE_BYTES = 300 * 1024 * 1024


def read_update_state() -> dict:
    try:
        return json.loads(UPDATE_STATE.read_text()) if UPDATE_STATE.exists() else {}
    except (OSError, json.JSONDecodeError):
        return {}


def write_update_state(state: dict) -> None:
    UPDATE_STATE.parent.mkdir(parents=True, exist_ok=True)
    UPDATE_STATE.write_text(json.dumps(state, indent=2))
    UPDATE_STATE.chmod(0o600)


def check_for_update(config: dict) -> None:
    state = read_update_state(); now = datetime.now(timezone.utc)
    try:
        last = datetime.fromisoformat(str(state.get("checkedAt", "")).replace("Z", "+00:00"))
        if (now - last).total_seconds() < max(900, int(state.get("checkIntervalMinutes", 15)) * 60):
            return
    except (TypeError, ValueError):
        pass
    state.update({"status": "checking", "checkedAt": now.isoformat(), "error": ""}); write_update_state(state)
    query = urllib.parse.urlencode({"host": platform.node(), "platform": "macos", "version": AGENT_VERSION})
    request = urllib.request.Request(config["server_url"].rstrip("/") + "/ingest/v1/agent-update?" + query, headers={"Authorization": f"Bearer {config['token']}"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            manifest = json.load(response)
        state["checkIntervalMinutes"] = int((manifest.get("policy") or {}).get("checkIntervalMinutes", 60))
        release = manifest.get("release") if manifest.get("updateAvailable") else None
        if not release:
            state.update({"status": "current", "targetVersion": manifest.get("currentVersion", AGENT_VERSION), "error": ""}); write_update_state(state); return
        target_version = str(release["version"]); expected = str(release["sha256"]).lower(); url = str(release["url"])
        if not url.startswith("https://") or len(expected) != 64:
            raise ValueError("manifesto de atualização inválido")
        state.update({"status": "downloading", "targetVersion": target_version}); write_update_state(state)
        stage = Path(tempfile.mkdtemp(prefix="timewatcher-update-", dir=str(UPDATE_STATE.parent)))
        archive = stage / "release.zip"; digest = hashlib.sha256(); total = 0
        with urllib.request.urlopen(url, timeout=90) as response, archive.open("wb") as output:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk: break
                total += len(chunk)
                if total > MAX_UPDATE_BYTES: raise ValueError("pacote excede o limite permitido")
                digest.update(chunk); output.write(chunk)
        if not hmac.compare_digest(digest.hexdigest(), expected):
            raise ValueError("checksum SHA-256 não confere")
        extracted = stage / "extracted"; extracted.mkdir()
        subprocess.run(["/usr/bin/ditto", "-x", "-k", str(archive), str(extracted)], check=True, timeout=120)
        source = next(extracted.rglob("TimeWatcher.app"), None)
        if not source or not (source / "Contents/MacOS/TimeWatcher").exists():
            raise ValueError("bundle TimeWatcher.app ausente no pacote")
        targets = [Path("/Applications/TimeWatcher.app"), Path.home() / "Applications/TimeWatcher.app"]
        target = next((item for item in targets if item.exists()), targets[0])
        if not os.access(target.parent, os.W_OK) or (target.exists() and not os.access(target, os.W_OK)):
            state.update({"status": "permission_required", "error": "A instalação atual exige MDM/Jamf ou privilégio administrativo para substituir o aplicativo."}); write_update_state(state); return
        updater = stage / "install_update.py"
        updater.write_text("""#!/usr/bin/python3
import json, shutil, subprocess, sys, time
from pathlib import Path
source, target, state_file, version = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]), sys.argv[4]
backup = target.with_name(target.name + '.previous')
def save(status, error=''):
    state_file.write_text(json.dumps({'status': status, 'targetVersion': version, 'checkedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'error': error}, indent=2))
time.sleep(4)
try:
    subprocess.run(['/usr/bin/pkill', '-x', 'TimeWatcher'], check=False)
    if backup.exists(): shutil.rmtree(backup)
    if target.exists(): shutil.move(str(target), str(backup))
    shutil.move(str(source), str(target))
    subprocess.run(['/usr/bin/open', str(target)], check=True)
    save('installed')
except Exception as error:
    try:
        if target.exists(): shutil.rmtree(target)
        if backup.exists(): shutil.move(str(backup), str(target)); subprocess.run(['/usr/bin/open', str(target)], check=False)
    finally: save('failed', str(error))
""")
        updater.chmod(0o700); state.update({"status": "installing", "targetVersion": target_version}); write_update_state(state)
        subprocess.Popen(["/usr/bin/python3", str(updater), str(source), str(target), str(UPDATE_STATE), target_version], start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception as error:
        state.update({"status": "failed", "checkedAt": now.isoformat(), "error": str(error)[:500]}); write_update_state(state)


def browser_url(app: str) -> str:
    scripts = {
        "Google Chrome": 'tell application "Google Chrome" to get URL of active tab of front window',
        "Google Chrome Canary": 'tell application "Google Chrome Canary" to get URL of active tab of front window',
        "Microsoft Edge": 'tell application "Microsoft Edge" to get URL of active tab of front window',
        "Brave Browser": 'tell application "Brave Browser" to get URL of active tab of front window',
        "Arc": 'tell application "Arc" to get URL of active tab of front window',
        "Vivaldi": 'tell application "Vivaldi" to get URL of active tab of front window',
        "Safari": 'tell application "Safari" to get URL of current tab of front window',
    }
    if app not in scripts:
        return ""
    try:
        result = subprocess.run(["/usr/bin/osascript", "-e", scripts[app]], capture_output=True, text=True, timeout=3)
        raw_url = result.stdout.strip() if result.returncode == 0 else ""
        if not raw_url:
            return ""
        parsed = urllib.parse.urlsplit(raw_url)
        # Query strings and fragments commonly contain tokens, search terms and
        # other private data. Productivity reporting only needs the origin/path.
        hostname = parsed.hostname or ""
        port = f":{parsed.port}" if parsed.port else ""
        safe_netloc = hostname + port
        return urllib.parse.urlunsplit((parsed.scheme, safe_netloc, parsed.path or "/", "", ""))
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return ""


def browser_title(app: str) -> str:
    scripts = {
        "Google Chrome": 'tell application "Google Chrome" to get title of active tab of front window',
        "Google Chrome Canary": 'tell application "Google Chrome Canary" to get title of active tab of front window',
        "Microsoft Edge": 'tell application "Microsoft Edge" to get title of active tab of front window',
        "Brave Browser": 'tell application "Brave Browser" to get title of active tab of front window',
        "Arc": 'tell application "Arc" to get title of active tab of front window',
        "Vivaldi": 'tell application "Vivaldi" to get title of active tab of front window',
        "Safari": 'tell application "Safari" to get name of current tab of front window',
    }
    if app not in scripts:
        return ""
    try:
        result = subprocess.run(["/usr/bin/osascript", "-e", scripts[app]], capture_output=True, text=True, timeout=3)
        return result.stdout.strip() if result.returncode == 0 else ""
    except (OSError, subprocess.TimeoutExpired):
        return ""


def active_window() -> tuple[str, str, str]:
    frontmost = ""
    data: dict = {}
    try:
        frontmost = subprocess.run(
            ["/usr/bin/osascript", "-e", 'tell application "System Events" to get name of first application process whose frontmost is true'],
            capture_output=True, text=True, timeout=3,
        ).stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        pass
    try:
        with urllib.request.urlopen("http://127.0.0.1:5600/api/0/buckets/", timeout=3) as response:
            buckets = json.load(response)
        bucket = next(key for key in buckets if key.startswith("aw-watcher-window_"))
        url = f"http://127.0.0.1:5600/api/0/buckets/{bucket}/events?limit=1"
        with urllib.request.urlopen(url, timeout=3) as response:
            events = json.load(response)
        data = events[0].get("data", {}) if events else {}
    except Exception:
        pass
    app = frontmost or str(data.get("app", ""))
    url = browser_url(app)
    return app, (browser_title(app) if url else str(data.get("title", ""))), url


def upload(path: Path, config: dict) -> bool:
    app, title, url = active_window()
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
            "X-Active-URL": url,
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


def sync_web_context(config: dict) -> bool:
    app, title, url = active_window()
    if not url:
        return True
    now = datetime.now(timezone.utc).isoformat()
    return authenticated_json(
        config["server_url"].rstrip("/") + "/ingest/v1/activity-events",
        config["token"],
        {"bucket": {"id": f"timewatcher-web_{platform.node()}", "type": "web.tab.current", "client": "timewatcher-agent", "hostname": platform.node(), "data": {}},
         "events": [{"timestamp": now, "duration": max(2, int(config.get("web_interval_seconds", 5))), "data": {"url": url, "title": title, "app": app}}]},
    )


def sync_heartbeat(config: dict) -> bool:
    """Report agent liveness independently from user activity."""
    hostname = platform.node()
    now = datetime.now(timezone.utc).isoformat()
    def read(command: list[str]) -> str:
        try:
            return subprocess.check_output(command, text=True, timeout=3).strip()
        except Exception:
            return ""
    local_ip = ""
    try:
        import socket
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); probe.connect(("1.1.1.1", 80)); local_ip = probe.getsockname()[0]; probe.close()
    except Exception:
        pass
    memory = read(["/usr/sbin/sysctl", "-n", "hw.memsize"])
    apps = sorted({item.stem for root in (Path("/Applications"), Path.home() / "Applications") if root.exists() for item in root.glob("*.app")})[:300]
    device = {"os": platform.system(), "osVersion": platform.mac_ver()[0] or platform.release(), "model": read(["/usr/sbin/sysctl", "-n", "hw.model"]), "architecture": platform.machine(), "memoryGB": str(round(int(memory) / (1024 ** 3), 1)) if memory.isdigit() else "", "localIp": local_ip, "sessionUser": getpass.getuser(), "sessionEmail": str(config.get("user_email", "")).strip().lower(), "installedSoftware": apps}
    update = read_update_state()
    return authenticated_json(
        config["server_url"].rstrip("/") + "/ingest/v1/activity-events",
        config["token"],
        {"bucket": {"id": f"timewatcher-heartbeat_{hostname}", "type": "timewatcher.heartbeat", "client": f"timewatcher-agent/{AGENT_VERSION}", "hostname": hostname, "data": {}},
         "events": [{"timestamp": now, "duration": 0, "data": {"version": AGENT_VERSION, "platform": "macOS", "device": device, "update": update}}]},
    )


def run_once(config: dict) -> bool:
    activity_synced = sync_activity(config)
    web_synced = sync_web_context(config)
    heartbeat_synced = sync_heartbeat(config)
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
        return activity_synced and web_synced and heartbeat_synced
    return False


def main() -> None:
    config = json.loads(CONFIG.read_text())
    if config.get("consent") is not True:
        raise SystemExit("Screenshot capture is disabled until consent=true")
    interval = max(30, int(config.get("interval_seconds", 60)))
    check_for_update(config)
    if "--once" in sys.argv:
        raise SystemExit(0 if run_once(config) else 1)
    if "--sync-only" in sys.argv:
        raise SystemExit(0 if sync_activity(config) and sync_web_context(config) and sync_heartbeat(config) else 1)
    if "--web-only" in sys.argv:
        raise SystemExit(0 if sync_web_context(config) else 1)
    while True:
        run_once(config)
        time.sleep(interval)


if __name__ == "__main__":
    main()
