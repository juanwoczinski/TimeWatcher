#!/usr/bin/env python3
"""Tenant-aware ingestion and operational API for TimeWatcher."""

import csv
import hashlib
import hmac
import io
import json
import os
import re
import secrets
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
CONFIG_FILE = DATA_DIR / "platform-config.json"
TOKEN = os.environ["WATCHSYNOVA_INGEST_TOKEN"]
AW_SERVER = os.environ.get("WATCHSYNOVA_AW_SERVER", "http://127.0.0.1:5600")
OWNER_NAME = os.environ.get("TIMEWATCHER_OWNER_NAME", "Juan Kleber")
TENANT_NAME = os.environ.get("TIMEWATCHER_TENANT_NAME", "Synova Tecnologia")
LOCAL_TIMEZONE = ZoneInfo(os.environ.get("TIMEWATCHER_TIMEZONE", "America/Sao_Paulo"))
PRODUCTIVE = {"chatgpt", "codex", "terminal", "visual studio code", "code", "xcode", "figma", "notion", "slack", "zoom", "meet", "docs", "drive", "github"}
UNPRODUCTIVE = {"instagram", "facebook", "tiktok", "youtube", "netflix", "reddit", "twitter", "x.com"}


def default_config() -> dict:
    return {
        "tenants": [{"id": "synova", "name": TENANT_NAME, "kind": "platform", "status": "active", "peopleCount": 1, "deviceCount": 1}],
        "users": {
            "timewatcher": {"name": "Synova Super Admin", "role": "super_admin", "tenantId": "synova"},
            "timewatcher2": {"name": "Administrador da organização", "role": "org_admin", "tenantId": "synova"},
        },
        "schedules": [{"id": "standard", "tenantId": "synova", "name": "Jornada padrão", "start": "09:00", "end": "18:00", "breakMinutes": 60, "weekdays": [1, 2, 3, 4, 5]}],
        "people": [{"id": "juan-kleber", "tenantId": "synova", "name": OWNER_NAME, "role": "Administrador", "scheduleId": "standard", "deviceIds": []}],
        "enrollments": [],
    }


def load_config() -> dict:
    if not CONFIG_FILE.exists():
        config = default_config()
        save_config(config)
        return config
    try:
        config = json.loads(CONFIG_FILE.read_text())
        baseline = default_config()
        for key, value in baseline.items():
            config.setdefault(key, value)
        return config
    except (OSError, json.JSONDecodeError):
        return default_config()


def save_config(config: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", dir=DATA_DIR, delete=False) as temporary:
        json.dump(config, temporary, ensure_ascii=False, indent=2)
        temporary.flush()
        os.fsync(temporary.fileno())
        temporary_path = Path(temporary.name)
    temporary_path.chmod(0o600)
    temporary_path.replace(CONFIG_FILE)


def aw_request(method: str, path: str, payload: object) -> None:
    request = urllib.request.Request(f"{AW_SERVER}{path}", data=json.dumps(payload).encode(), method=method, headers={"Content-Type": "application/json"})
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


def classify(value: str) -> str:
    normalized = value.strip().lower()
    if any(token in normalized for token in PRODUCTIVE):
        return "productive"
    if any(token in normalized for token in UNPRODUCTIVE):
        return "unproductive"
    return "neutral"


def viewer(headers) -> dict:
    username = headers.get("X-TimeWatcher-User", "timewatcher")
    found = load_config()["users"].get(username)
    return {"username": username, **(found or {"name": username, "role": "org_admin", "tenantId": "synova"})}


def ingest_tenant(supplied_token: str) -> str | None:
    if hmac.compare_digest(supplied_token, TOKEN):
        return "synova"
    digest = hashlib.sha256(supplied_token.encode()).hexdigest()
    now = datetime.now(timezone.utc)
    for enrollment in load_config()["enrollments"]:
        try:
            if hmac.compare_digest(digest, enrollment["tokenHash"]) and parse_timestamp(enrollment["expiresAt"]) > now:
                return enrollment["tenantId"]
        except (KeyError, ValueError):
            continue
    return None


def bounds(params: dict) -> tuple[datetime, datetime, str]:
    now = datetime.now(timezone.utc)
    period = params.get("period", ["today"])[0]
    if period == "custom":
        try:
            start = datetime.fromisoformat(params["start"][0]).replace(tzinfo=LOCAL_TIMEZONE).astimezone(timezone.utc)
            end = (datetime.fromisoformat(params["end"][0]).replace(tzinfo=LOCAL_TIMEZONE) + timedelta(days=1)).astimezone(timezone.utc)
            return start, min(end, now), period
        except (KeyError, ValueError):
            period = "today"
    local = now.astimezone(LOCAL_TIMEZONE).replace(hour=0, minute=0, second=0, microsecond=0)
    days = 6 if period == "7d" else 29 if period == "30d" else 0
    return (local - timedelta(days=days)).astimezone(timezone.utc), now, period


def dashboard_data(params: dict, current_viewer: dict) -> dict:
    start, end, period = bounds(params)
    config = load_config()
    tenant_id = params.get("tenant", [current_viewer["tenantId"]])[0] if current_viewer["role"] == "super_admin" else current_viewer["tenantId"]
    buckets = aw_get("/api/0/buckets/")
    def belongs(bucket_id: str) -> bool:
        return bucket_id.startswith(f"tw-{tenant_id}_") if tenant_id != "synova" else not bucket_id.startswith("tw-") or bucket_id.startswith("tw-synova_")
    buckets = {key: value for key, value in buckets.items() if belongs(key)}
    window_buckets = [(key, value) for key, value in buckets.items() if value.get("type") == "currentwindow"]
    afk_buckets = [(key, value) for key, value in buckets.items() if value.get("type") == "afkstatus"]
    input_buckets = [(key, value) for key, value in buckets.items() if value.get("type") == "os.hid.input"]
    web_buckets = [(key, value) for key, value in buckets.items() if value.get("type") in ("web.tab.current", "currentwebtab") or "web" in str(value.get("type", "")).lower()]

    def events_for(bucket_id: str) -> list:
        query = urllib.parse.urlencode({"start": start.isoformat(), "end": end.isoformat(), "limit": 10000})
        return aw_get(f"/api/0/buckets/{urllib.parse.quote(bucket_id, safe='')}/events?{query}")

    windows = [event for bucket_id, _ in window_buckets for event in events_for(bucket_id)]
    afk_events = [event for bucket_id, _ in afk_buckets for event in events_for(bucket_id)]
    input_events = [event for bucket_id, _ in input_buckets for event in events_for(bucket_id)]
    web_events = [event for bucket_id, _ in web_buckets for event in events_for(bucket_id)]
    app_seconds, domain_seconds, page_seconds, hourly = defaultdict(float), defaultdict(float), defaultdict(float), defaultdict(float)
    page_titles, recent = {}, []
    tracked_seconds = 0.0
    for event in windows:
        seconds = max(0.0, float(event.get("duration", 0)))
        data = event.get("data", {})
        app = str(data.get("app", "Não identificado")) or "Não identificado"
        title = str(data.get("title", ""))
        tracked_seconds += seconds
        app_seconds[app] += seconds
        try:
            hourly[parse_timestamp(str(event["timestamp"])).astimezone(LOCAL_TIMEZONE).hour] += seconds
        except (KeyError, ValueError):
            pass
        recent.append({"timestamp": event.get("timestamp"), "duration": seconds, "app": app, "title": title})
    for event in web_events:
        seconds = max(0.0, float(event.get("duration", 0)))
        data = event.get("data", {})
        url = str(data.get("url", ""))
        if not url:
            continue
        parsed = urllib.parse.urlsplit(url if "://" in url else "https://" + url)
        domain = parsed.hostname or "URL desconhecida"
        clean_url = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", ""))
        domain_seconds[domain] += seconds
        page_seconds[clean_url] += seconds
        page_titles[clean_url] = str(data.get("title", ""))

    idle_seconds = sum(max(0.0, float(e.get("duration", 0))) for e in afk_events if e.get("data", {}).get("status") == "afk")
    active_seconds = max(0.0, tracked_seconds - min(idle_seconds, tracked_seconds))
    category_seconds = {"productive": 0.0, "neutral": 0.0, "unproductive": 0.0}
    apps = []
    for name, seconds in sorted(app_seconds.items(), key=lambda item: item[1], reverse=True):
        category = classify(name)
        category_seconds[category] += seconds
        apps.append({"name": name, "seconds": round(seconds, 3), "duration": duration_label(seconds), "classification": category, "share": round(seconds / tracked_seconds * 100 if tracked_seconds else 0, 1)})
    urls = []
    web_total = sum(page_seconds.values())
    for url, seconds in sorted(page_seconds.items(), key=lambda item: item[1], reverse=True):
        domain = urllib.parse.urlsplit(url).hostname or url
        urls.append({"url": url, "domain": domain, "title": page_titles.get(url, ""), "seconds": round(seconds, 3), "duration": duration_label(seconds), "classification": classify(domain), "share": round(seconds / web_total * 100 if web_total else 0, 1)})

    all_buckets = window_buckets + afk_buckets + input_buckets + web_buckets
    last_seen_values, devices_by_host = [], {}
    for _, bucket in all_buckets:
        hostname = bucket.get("hostname") or "Dispositivo desconhecido"
        last_value = bucket.get("last_updated") or bucket.get("created")
        if last_value:
            last_dt = parse_timestamp(last_value)
            last_seen_values.append(last_dt)
            devices_by_host[hostname] = max(last_dt, devices_by_host.get(hostname, last_dt))
    presses = sum(int(e.get("data", {}).get("presses", 0)) for e in input_events)
    clicks = sum(int(e.get("data", {}).get("clicks", 0)) for e in input_events)
    devices = [{"id": host, "name": host.replace(".local", ""), "platform": "macOS" if "Mac" in host else "Desktop", "lastSeen": seen.isoformat(), "status": "online" if (end - seen).total_seconds() < 300 else "offline", "trackedSeconds": round(tracked_seconds, 3), "activeSeconds": round(active_seconds, 3), "presses": presses, "clicks": clicks} for host, seen in sorted(devices_by_host.items())]
    people = [person.copy() for person in config["people"] if person["tenantId"] == tenant_id]
    if people:
        people[0]["deviceIds"] = [d["id"] for d in devices]
    productive = category_seconds["productive"]
    score = round(productive / tracked_seconds * 100 if tracked_seconds else 0)
    screenshot_count = sum(1 for _ in (DATA_DIR / "screenshots").rglob("*.jpg"))
    person = people[0] if people else {"id": "unassigned", "name": "Sem colaborador", "role": "Colaborador", "scheduleId": None, "deviceIds": []}
    person.update({"deviceCount": len(devices), "status": "online" if any(d["status"] == "online" for d in devices) else "offline", "trackedSeconds": round(tracked_seconds, 3), "activeSeconds": round(active_seconds, 3), "idleSeconds": round(idle_seconds, 3), "productiveSeconds": round(productive, 3), "focusScore": score})
    schedule = next((s for s in config["schedules"] if s["id"] == person.get("scheduleId")), None)
    tenant = next((t for t in config["tenants"] if t["id"] == tenant_id), {"id": tenant_id, "name": tenant_id})
    recent.sort(key=lambda item: item.get("timestamp") or "", reverse=True)
    return {
        "viewer": current_viewer, "tenant": tenant, "tenants": config["tenants"] if current_viewer["role"] == "super_admin" else [tenant],
        "period": period, "range": {"start": start.isoformat(), "end": end.isoformat()}, "generatedAt": datetime.now(timezone.utc).isoformat(),
        "person": person, "people": people, "schedules": [s for s in config["schedules"] if s["tenantId"] == tenant_id], "schedule": schedule,
        "summary": {"trackedSeconds": round(tracked_seconds, 3), "activeSeconds": round(active_seconds, 3), "idleSeconds": round(idle_seconds, 3), "productiveSeconds": round(productive, 3), "neutralSeconds": round(category_seconds["neutral"], 3), "unproductiveSeconds": round(category_seconds["unproductive"], 3), "focusScore": score, "deviceCount": len(devices), "onlineDeviceCount": sum(d["status"] == "online" for d in devices), "screenshotCount": screenshot_count, "urlCount": len(urls), "webSeconds": round(web_total, 3), "lastSeen": max(last_seen_values).isoformat() if last_seen_values else None},
        "devices": devices, "apps": apps[:100], "urls": urls[:200], "domains": [{"domain": d, "seconds": round(s, 3), "duration": duration_label(s), "classification": classify(d)} for d, s in sorted(domain_seconds.items(), key=lambda item: item[1], reverse=True)],
        "timeline": [{"hour": h, "label": f"{h:02d}h", "seconds": round(hourly[h], 3)} for h in range(24) if hourly[h] > 0], "recent": recent[:100], "input": {"presses": presses, "clicks": clicks},
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "TimeWatcher/2"

    def send_json(self, status: int, payload: object) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status); self.send_header("Content-Type", "application/json; charset=utf-8"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0")); return json.loads(self.rfile.read(length)) if 0 < length <= 1024 * 1024 else {}

    def authorized_admin(self, current: dict) -> bool:
        return current["role"] in ("super_admin", "org_admin")

    def do_GET(self) -> None:
        parsed = urllib.parse.urlsplit(self.path); params = urllib.parse.parse_qs(parsed.query); current = viewer(self.headers)
        if parsed.path == "/health": return self.send_json(200, {"status": "ok", "version": 2})
        if parsed.path == "/dashboard/data":
            try: return self.send_json(200, dashboard_data(params, current))
            except Exception as error: return self.send_json(502, {"error": "dashboard_unavailable", "detail": str(error)[:240]})
        if parsed.path in ("/dashboard/export.csv", "/dashboard/export.json"):
            try: data = dashboard_data(params, current)
            except Exception as error: return self.send_json(502, {"error": "export_unavailable", "detail": str(error)[:240]})
            if parsed.path.endswith(".json"):
                return self.send_json(200, data)
            output = io.StringIO(); writer = csv.writer(output); writer.writerow(["tipo", "item", "titulo", "classificacao", "segundos", "duracao", "participacao_percentual"])
            for app in data["apps"]: writer.writerow(["aplicativo", app["name"], "", app["classification"], app["seconds"], app["duration"], app["share"]])
            for item in data["urls"]: writer.writerow(["url", item["url"], item["title"], item["classification"], item["seconds"], item["duration"], item["share"]])
            body = ("\ufeff" + output.getvalue()).encode("utf-8"); self.send_response(200); self.send_header("Content-Type", "text/csv; charset=utf-8"); self.send_header("Content-Disposition", f'attachment; filename="timewatcher-{data["tenant"]["id"]}-{data["period"]}.csv"'); self.send_header("Content-Length", str(len(body))); self.end_headers(); return self.wfile.write(body)
        if parsed.path == "/dashboard/screenshots":
            tenant_id = params.get("tenant", [current["tenantId"]])[0] if current["role"] == "super_admin" else current["tenantId"]
            return self.list_screenshots(current, tenant_id)
        if parsed.path.startswith("/dashboard/screenshots/"): return self.serve_screenshot(parsed.path.rsplit("/", 1)[-1])
        return self.send_json(404, {"error": "not_found"})

    def do_POST(self) -> None:
        parsed = urllib.parse.urlsplit(self.path); current = viewer(self.headers)
        if parsed.path.startswith("/dashboard/"):
            if not self.authorized_admin(current): return self.send_json(403, {"error": "forbidden"})
            try: payload = self.read_json(); config = load_config()
            except Exception: return self.send_json(400, {"error": "invalid_json"})
            if parsed.path == "/dashboard/schedules":
                schedule = {"id": payload.get("id") or str(uuid.uuid4()), "tenantId": current["tenantId"], "name": str(payload.get("name", "Jornada"))[:80], "start": str(payload.get("start", "09:00"))[:5], "end": str(payload.get("end", "18:00"))[:5], "breakMinutes": max(0, int(payload.get("breakMinutes", 60))), "weekdays": payload.get("weekdays", [1,2,3,4,5])}
                config["schedules"] = [s for s in config["schedules"] if s["id"] != schedule["id"]] + [schedule]; save_config(config); return self.send_json(201, schedule)
            if parsed.path == "/dashboard/people/schedule":
                ids = payload.get("personIds", []); schedule_id = payload.get("scheduleId")
                for person in config["people"]:
                    if person["id"] in ids and (current["role"] == "super_admin" or person["tenantId"] == current["tenantId"]): person["scheduleId"] = schedule_id
                save_config(config); return self.send_json(200, {"updated": len(ids)})
            if parsed.path == "/dashboard/tenants":
                if current["role"] != "super_admin": return self.send_json(403, {"error": "super_admin_required"})
                tenant = {"id": re.sub(r"[^a-z0-9-]", "-", str(payload.get("id") or payload.get("name", "empresa")).lower()).strip("-"), "name": str(payload.get("name", "Empresa"))[:100], "kind": "customer", "status": "active", "peopleCount": 0, "deviceCount": 0}; config["tenants"].append(tenant); save_config(config); return self.send_json(201, tenant)
            if parsed.path == "/dashboard/enrollments":
                tenant_id = payload.get("tenantId", current["tenantId"]); token = secrets.token_urlsafe(32); enrollment = {"id": str(uuid.uuid4()), "tenantId": tenant_id, "tokenHash": hashlib.sha256(token.encode()).hexdigest(), "createdAt": datetime.now(timezone.utc).isoformat(), "expiresAt": (datetime.now(timezone.utc)+timedelta(days=7)).isoformat()}; config["enrollments"].append(enrollment); save_config(config); return self.send_json(201, {"token": token, "tenantId": tenant_id, "serverUrl": "https://timewatcher.32-193-139-223.sslip.io"})
            return self.send_json(404, {"error": "not_found"})
        if parsed.path not in ("/v1/screenshots", "/v1/activity-events"): return self.send_json(404, {"error": "not_found"})
        supplied = self.headers.get("Authorization", "")
        tenant_id = ingest_tenant(supplied[7:]) if supplied.startswith("Bearer ") else None
        if not tenant_id: return self.send_json(401, {"error": "unauthorized"})
        self.ingest_tenant = tenant_id
        if parsed.path == "/v1/activity-events": return self.receive_activity_events()
        return self.receive_screenshot()

    def list_screenshots(self, current: dict, tenant_id: str) -> None:
        metadata = {}
        try:
            for bucket_id, bucket in aw_get("/api/0/buckets/").items():
                if tenant_id != "synova" and not bucket_id.startswith(f"tw-{tenant_id}_"): continue
                if tenant_id == "synova" and bucket_id.startswith("tw-") and not bucket_id.startswith("tw-synova_"): continue
                if bucket.get("type") not in ("timewatcher.screenshot", "watchsynova.screenshot"): continue
                for event in aw_get(f"/api/0/buckets/{urllib.parse.quote(bucket_id, safe='')}/events?limit=500"):
                    shot_id = event.get("data", {}).get("screenshot_id")
                    if shot_id: metadata[shot_id] = {"app": event.get("data", {}).get("app", ""), "title": event.get("data", {}).get("title", ""), "device": bucket.get("hostname", "")}
        except Exception: pass
        items = []
        candidates = list((DATA_DIR / "screenshots" / tenant_id).rglob("*.jpg"))
        if tenant_id == "synova": candidates += list((DATA_DIR / "screenshots").glob("*/*.jpg"))
        for path in sorted(candidates, key=lambda p: p.stat().st_mtime, reverse=True)[:100]:
            stat = path.stat(); items.append({"id": path.stem, "capturedAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(), "size": stat.st_size, "url": f"/platform-api/dashboard/screenshots/{path.stem}", "personId": "juan-kleber", "personName": OWNER_NAME, **metadata.get(path.stem, {})})
        self.send_json(200, {"items": items})

    def serve_screenshot(self, image_id: str) -> None:
        if not re.fullmatch(r"[0-9a-f-]{36}", image_id): return self.send_json(400, {"error": "invalid_id"})
        matches = list((DATA_DIR / "screenshots").rglob(f"{image_id}.jpg"))
        if not matches: return self.send_json(404, {"error": "not_found"})
        image = matches[0].read_bytes(); self.send_response(200); self.send_header("Content-Type", "image/jpeg"); self.send_header("Cache-Control", "private, max-age=300"); self.send_header("Content-Length", str(len(image))); self.end_headers(); self.wfile.write(image)

    def receive_screenshot(self) -> None:
        if self.headers.get_content_type() != "image/jpeg": return self.send_json(415, {"error": "jpeg_required"})
        try: length = int(self.headers.get("Content-Length", "0"))
        except ValueError: length = 0
        if not 4 <= length <= MAX_UPLOAD_BYTES: return self.send_json(413, {"error": "invalid_size"})
        image = self.rfile.read(length)
        if len(image) != length or not image.startswith(b"\xff\xd8\xff"): return self.send_json(400, {"error": "invalid_jpeg"})
        device = self.headers.get("X-Device-Id", "unknown")[:120]; captured_at = self.headers.get("X-Captured-At", datetime.now(timezone.utc).isoformat())[:80]; app = self.headers.get("X-Active-App", "")[:300]; title = self.headers.get("X-Active-Title", "")[:1000]
        target_dir = DATA_DIR / "screenshots" / getattr(self, "ingest_tenant", "synova") / datetime.now(timezone.utc).strftime("%Y-%m-%d"); target_dir.mkdir(parents=True, exist_ok=True); image_id = str(uuid.uuid4()); target = target_dir / f"{image_id}.jpg"
        with tempfile.NamedTemporaryFile(dir=target_dir, delete=False) as temporary: temporary.write(image); temporary.flush(); os.fsync(temporary.fileno()); temporary_path = Path(temporary.name)
        temporary_path.chmod(0o600); temporary_path.replace(target); digest = hashlib.sha256(image).hexdigest(); bucket_id = f"timewatcher-screenshot_{device}".replace("/", "_")
        try:
            aw_request("POST", f"/api/0/buckets/{urllib.parse.quote(bucket_id, safe='')}", {"id": bucket_id, "type": "timewatcher.screenshot", "client": "timewatcher-agent", "hostname": device, "data": {}})
            aw_request("POST", f"/api/0/buckets/{urllib.parse.quote(bucket_id, safe='')}/events", [{"timestamp": captured_at, "duration": 0, "data": {"screenshot_id": image_id, "path": str(target.relative_to(DATA_DIR)), "sha256": digest, "app": app, "title": title}}])
        except Exception: target.unlink(missing_ok=True); return self.send_json(502, {"error": "metadata_write_failed"})
        self.send_json(201, {"id": image_id, "sha256": digest})

    def receive_activity_events(self) -> None:
        if self.headers.get_content_type() != "application/json": return self.send_json(415, {"error": "json_required"})
        try:
            payload = self.read_json(); bucket = payload["bucket"]; raw_bucket_id = str(bucket["id"])[:250].replace("/", "_"); tenant_id = getattr(self, "ingest_tenant", "synova"); bucket_id = raw_bucket_id if tenant_id == "synova" else f"tw-{tenant_id}_{raw_bucket_id}"; events = payload["events"]
            if not isinstance(events, list) or len(events) > 1000: raise ValueError()
            clean = [{"timestamp": str(e["timestamp"]), "duration": float(e.get("duration", 0)), "data": dict(e.get("data", {}))} for e in events]
            aw_request("POST", f"/api/0/buckets/{urllib.parse.quote(bucket_id, safe='')}", {"id": bucket_id, "type": str(bucket.get("type", "unknown"))[:200], "client": str(bucket.get("client", "timewatcher"))[:200], "hostname": str(bucket.get("hostname", "unknown"))[:200], "data": dict(bucket.get("data", {}))})
            if clean: aw_request("POST", f"/api/0/buckets/{urllib.parse.quote(bucket_id, safe='')}/events", clean)
        except (KeyError, TypeError, ValueError, json.JSONDecodeError): return self.send_json(400, {"error": "invalid_payload"})
        except Exception: return self.send_json(502, {"error": "activity_write_failed"})
        self.send_json(201, {"bucket": bucket_id, "accepted": len(clean)})

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"{self.address_string()} - {fmt % args}", flush=True)


if __name__ == "__main__":
    DATA_DIR.mkdir(parents=True, exist_ok=True); load_config(); ThreadingHTTPServer(("127.0.0.1", 5610), Handler).serve_forever()
