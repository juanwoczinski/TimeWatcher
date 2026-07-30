#!/usr/bin/env python3
"""Authenticated, write-only ingestion for TimeWatcher."""

import hashlib
import hmac
import json
import os
import re
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from zoneinfo import ZoneInfo

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
DATA_DIR = Path(os.environ.get("WATCHSYNOVA_DATA_DIR", "/var/lib/watchsynova-ingest"))
TOKEN = os.environ["WATCHSYNOVA_INGEST_TOKEN"]
AW_SERVER = os.environ.get("WATCHSYNOVA_AW_SERVER", "http://127.0.0.1:5600")
OWNER_NAME = os.environ.get("TIMEWATCHER_OWNER_NAME", "Juan Kleber")
TENANT_NAME = os.environ.get("TIMEWATCHER_TENANT_NAME", "Synova Tecnologia")
LOCAL_TIMEZONE = ZoneInfo(os.environ.get("TIMEWATCHER_TIMEZONE", "America/Sao_Paulo"))
PRODUCTIVE_APPS = {"chatgpt", "codex", "terminal", "visual studio code", "code", "xcode", "figma", "notion", "slack", "zoom", "meet"}
DISTRACTING_APPS = {"instagram", "facebook", "tiktok", "youtube", "netflix", "reddit", "twitter", "x"}


def aw_request(method: str, path: str, payload: object) -> None:
    body = json.dumps(payload).encode()
    request = urllib.request.Request(
        f"{AW_SERVER}{path}", data=body, method=method, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(request, timeout=10):
            pass
    except urllib.error.HTTPError as error:
        if not (method == "POST" and error.code in (304, 400, 409)):
            raise


def aw_get(path: str) -> object:
    with urllib.request.urlopen(f"{AW_SERVER}{path}", timeout=15) as response:
        return json.load(response)


def parse_timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def duration_label(seconds: float) -> str:
    total = max(0, int(round(seconds)))
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours}h {minutes:02d}m" if hours else f"{minutes}m {secs:02d}s"


def classify_app(name: str) -> str:
    normalized = name.strip().lower()
    if any(token in normalized for token in PRODUCTIVE_APPS):
        return "productive"
    if any(token in normalized for token in DISTRACTING_APPS):
        return "unproductive"
    return "neutral"


def period_start(period: str, now: datetime) -> datetime:
    local_now = now.astimezone(LOCAL_TIMEZONE)
    if period == "7d":
        return (local_now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=6)).astimezone(timezone.utc)
    if period == "30d":
        return (local_now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=29)).astimezone(timezone.utc)
    return local_now.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)


def dashboard_data(period: str) -> dict:
    now = datetime.now(timezone.utc)
    start = period_start(period, now)
    buckets = aw_get("/api/0/buckets/")
    window_buckets = [(key, value) for key, value in buckets.items() if value.get("type") == "currentwindow"]
    afk_buckets = [(key, value) for key, value in buckets.items() if value.get("type") == "afkstatus"]
    input_buckets = [(key, value) for key, value in buckets.items() if value.get("type") == "os.hid.input"]

    def events_for(bucket_id: str) -> list:
        query = urllib.parse.urlencode({"start": start.isoformat(), "end": now.isoformat(), "limit": 10000})
        return aw_get(f"/api/0/buckets/{urllib.parse.quote(bucket_id, safe='')}/events?{query}")

    windows = [event for bucket_id, _ in window_buckets for event in events_for(bucket_id)]
    afk_events = [event for bucket_id, _ in afk_buckets for event in events_for(bucket_id)]
    input_events = [event for bucket_id, _ in input_buckets for event in events_for(bucket_id)]

    app_seconds = defaultdict(float)
    hourly = defaultdict(float)
    recent = []
    tracked_seconds = 0.0
    for event in windows:
        duration = max(0.0, float(event.get("duration", 0)))
        app = str(event.get("data", {}).get("app", "Não identificado")) or "Não identificado"
        title = str(event.get("data", {}).get("title", ""))
        tracked_seconds += duration
        app_seconds[app] += duration
        try:
            hour = parse_timestamp(str(event["timestamp"])).astimezone(LOCAL_TIMEZONE).hour
            hourly[hour] += duration
        except (KeyError, ValueError):
            pass
        recent.append({"timestamp": event.get("timestamp"), "duration": duration, "app": app, "title": title})

    idle_seconds = sum(max(0.0, float(event.get("duration", 0))) for event in afk_events if event.get("data", {}).get("status") == "afk")
    active_seconds = max(0.0, tracked_seconds - min(idle_seconds, tracked_seconds))
    category_seconds = {"productive": 0.0, "neutral": 0.0, "unproductive": 0.0}
    apps = []
    for app, seconds in sorted(app_seconds.items(), key=lambda item: item[1], reverse=True):
        category = classify_app(app)
        category_seconds[category] += seconds
        apps.append({"name": app, "seconds": round(seconds, 3), "duration": duration_label(seconds), "classification": category, "share": round((seconds / tracked_seconds * 100) if tracked_seconds else 0, 1)})

    last_seen_values = []
    devices_by_host = {}
    for _, bucket in window_buckets + afk_buckets + input_buckets:
        hostname = bucket.get("hostname") or "Dispositivo desconhecido"
        last_value = bucket.get("last_updated") or bucket.get("created")
        if last_value:
            last_dt = parse_timestamp(last_value)
            last_seen_values.append(last_dt)
            current = devices_by_host.get(hostname)
            if not current or last_dt > current:
                devices_by_host[hostname] = last_dt
    devices = []
    for hostname, last_seen in sorted(devices_by_host.items()):
        age = (now - last_seen).total_seconds()
        devices.append({"id": hostname, "name": hostname.replace(".local", ""), "platform": "macOS" if "MacBook" in hostname or "Mac" in hostname else "Desktop", "lastSeen": last_seen.isoformat(), "status": "online" if age < 300 else "offline", "trackedSeconds": round(tracked_seconds, 3), "activeSeconds": round(active_seconds, 3), "presses": sum(int(e.get("data", {}).get("presses", 0)) for e in input_events), "clicks": sum(int(e.get("data", {}).get("clicks", 0)) for e in input_events)})

    screenshot_count = sum(1 for _ in (DATA_DIR / "screenshots").glob("*/*.jpg"))
    productive = category_seconds["productive"]
    focus_score = round((productive / tracked_seconds * 100) if tracked_seconds else 0)
    latest_seen = max(last_seen_values).isoformat() if last_seen_values else None
    timeline = [{"hour": hour, "label": f"{hour:02d}h", "seconds": round(hourly.get(hour, 0), 3)} for hour in range(24) if hourly.get(hour, 0) > 0]
    recent.sort(key=lambda item: item.get("timestamp") or "", reverse=True)
    return {
        "tenant": {"id": "synova", "name": TENANT_NAME},
        "period": period,
        "generatedAt": now.isoformat(),
        "person": {"id": "juan-kleber", "name": OWNER_NAME, "role": "Administrador", "deviceCount": len(devices), "status": "online" if devices and any(d["status"] == "online" for d in devices) else "offline", "trackedSeconds": round(tracked_seconds, 3), "activeSeconds": round(active_seconds, 3), "idleSeconds": round(idle_seconds, 3), "productiveSeconds": round(productive, 3), "focusScore": focus_score},
        "summary": {"trackedSeconds": round(tracked_seconds, 3), "activeSeconds": round(active_seconds, 3), "idleSeconds": round(idle_seconds, 3), "productiveSeconds": round(productive, 3), "neutralSeconds": round(category_seconds["neutral"], 3), "unproductiveSeconds": round(category_seconds["unproductive"], 3), "focusScore": focus_score, "deviceCount": len(devices), "onlineDeviceCount": sum(1 for d in devices if d["status"] == "online"), "screenshotCount": screenshot_count, "lastSeen": latest_seen},
        "devices": devices,
        "apps": apps[:30],
        "timeline": timeline,
        "recent": recent[:30],
        "input": {"presses": sum(int(e.get("data", {}).get("presses", 0)) for e in input_events), "clicks": sum(int(e.get("data", {}).get("clicks", 0)) for e in input_events)},
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "TimeWatcherIngest/1"

    def send_json(self, status: int, payload: object) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path == "/health":
            self.send_json(200, {"status": "ok"})
        elif parsed.path == "/dashboard/data":
            try:
                period = urllib.parse.parse_qs(parsed.query).get("period", ["today"])[0]
                if period not in ("today", "7d", "30d"):
                    period = "today"
                self.send_json(200, dashboard_data(period))
            except Exception as error:
                self.send_json(502, {"error": "dashboard_unavailable", "detail": str(error)[:200]})
        elif parsed.path == "/dashboard/screenshots":
            metadata = {}
            try:
                bucket_data = aw_get("/api/0/buckets/")
                for bucket_id, bucket in bucket_data.items():
                    if bucket.get("type") not in ("timewatcher.screenshot", "watchsynova.screenshot"):
                        continue
                    for event in aw_get(f"/api/0/buckets/{urllib.parse.quote(bucket_id, safe='')}/events?limit=500"):
                        shot_id = event.get("data", {}).get("screenshot_id")
                        if shot_id:
                            metadata[shot_id] = {"app": event.get("data", {}).get("app", ""), "title": event.get("data", {}).get("title", ""), "device": bucket.get("hostname", "")}
            except Exception:
                metadata = {}
            items = []
            for path in sorted((DATA_DIR / "screenshots").glob("*/*.jpg"), key=lambda p: p.stat().st_mtime, reverse=True)[:100]:
                stat = path.stat()
                items.append({"id": path.stem, "capturedAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
                              "size": stat.st_size, "url": f"/platform-api/dashboard/screenshots/{path.stem}", **metadata.get(path.stem, {})})
            self.send_json(200, {"items": items})
        elif parsed.path.startswith("/dashboard/screenshots/"):
            image_id = parsed.path.rsplit("/", 1)[-1]
            if not re.fullmatch(r"[0-9a-f-]{36}", image_id):
                self.send_json(400, {"error": "invalid_id"})
                return
            matches = list((DATA_DIR / "screenshots").glob(f"*/{image_id}.jpg"))
            if not matches:
                self.send_json(404, {"error": "not_found"})
                return
            image = matches[0].read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Cache-Control", "private, max-age=300")
            self.send_header("Content-Length", str(len(image)))
            self.end_headers()
            self.wfile.write(image)
        else:
            self.send_json(404, {"error": "not_found"})

    def do_POST(self) -> None:
        if self.path not in ("/v1/screenshots", "/v1/activity-events"):
            self.send_json(404, {"error": "not_found"})
            return
        supplied = self.headers.get("Authorization", "")
        if not supplied.startswith("Bearer ") or not hmac.compare_digest(supplied[7:], TOKEN):
            self.send_json(401, {"error": "unauthorized"})
            return
        if self.path == "/v1/activity-events":
            self.receive_activity_events()
            return
        if self.headers.get_content_type() != "image/jpeg":
            self.send_json(415, {"error": "jpeg_required"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if not 4 <= length <= MAX_UPLOAD_BYTES:
            self.send_json(413, {"error": "invalid_size"})
            return
        image = self.rfile.read(length)
        if len(image) != length or not image.startswith(b"\xff\xd8\xff"):
            self.send_json(400, {"error": "invalid_jpeg"})
            return

        device = self.headers.get("X-Device-Id", "unknown")[:120]
        captured_at = self.headers.get("X-Captured-At", datetime.now(timezone.utc).isoformat())[:80]
        app = self.headers.get("X-Active-App", "")[:300]
        title = self.headers.get("X-Active-Title", "")[:1000]
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        target_dir = DATA_DIR / "screenshots" / day
        target_dir.mkdir(parents=True, exist_ok=True)
        image_id = str(uuid.uuid4())
        target = target_dir / f"{image_id}.jpg"
        with tempfile.NamedTemporaryFile(dir=target_dir, delete=False) as temporary:
            temporary.write(image)
            temporary.flush()
            os.fsync(temporary.fileno())
            temporary_path = Path(temporary.name)
        temporary_path.chmod(0o600)
        temporary_path.replace(target)

        digest = hashlib.sha256(image).hexdigest()
        bucket_id = f"timewatcher-screenshot_{device}".replace("/", "_")
        try:
            aw_request("POST", f"/api/0/buckets/{urllib.parse.quote(bucket_id, safe='')}", {
                "id": bucket_id, "type": "timewatcher.screenshot", "client": "timewatcher-agent",
                "hostname": device, "data": {},
            })
            aw_request("POST", f"/api/0/buckets/{urllib.parse.quote(bucket_id, safe='')}/events", [{
                "timestamp": captured_at, "duration": 0,
                "data": {"screenshot_id": image_id, "path": str(target.relative_to(DATA_DIR)),
                         "sha256": digest, "app": app, "title": title},
            }])
        except Exception:
            target.unlink(missing_ok=True)
            self.send_json(502, {"error": "metadata_write_failed"})
            return
        self.send_json(201, {"id": image_id, "sha256": digest})

    def receive_activity_events(self) -> None:
        if self.headers.get_content_type() != "application/json":
            self.send_json(415, {"error": "json_required"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if not 2 <= length <= 5 * 1024 * 1024:
            self.send_json(413, {"error": "invalid_size"})
            return
        try:
            payload = json.loads(self.rfile.read(length))
            bucket = payload["bucket"]
            bucket_id = str(bucket["id"])[:300].replace("/", "_")
            events = payload["events"]
            if not isinstance(events, list) or len(events) > 1000:
                raise ValueError("invalid events")
            clean_events = []
            for event in events:
                clean_events.append({
                    "timestamp": str(event["timestamp"]),
                    "duration": float(event.get("duration", 0)),
                    "data": dict(event.get("data", {})),
                })
            aw_request("POST", f"/api/0/buckets/{urllib.parse.quote(bucket_id, safe='')}", {
                "id": bucket_id,
                "type": str(bucket.get("type", "unknown"))[:200],
                "client": str(bucket.get("client", "timewatcher"))[:200],
                "hostname": str(bucket.get("hostname", "unknown"))[:200],
                "data": dict(bucket.get("data", {})),
            })
            if clean_events:
                aw_request("POST", f"/api/0/buckets/{urllib.parse.quote(bucket_id, safe='')}/events", clean_events)
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            self.send_json(400, {"error": "invalid_payload"})
            return
        except Exception:
            self.send_json(502, {"error": "activity_write_failed"})
            return
        self.send_json(201, {"bucket": bucket_id, "accepted": len(clean_events)})

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"{self.address_string()} - {fmt % args}", flush=True)


if __name__ == "__main__":
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    ThreadingHTTPServer(("127.0.0.1", 5610), Handler).serve_forever()
