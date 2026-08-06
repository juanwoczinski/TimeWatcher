#!/usr/bin/env python3
"""Tenant-aware ingestion and operational API for TimeWatcher."""

import base64
import csv
import hashlib
import hmac
import io
import json
import os
import re
import secrets
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from zoneinfo import ZoneInfo

import mailer
import store

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_AVATAR_BYTES = 3 * 1024 * 1024
DATA_DIR = Path(os.environ.get("WATCHSYNOVA_DATA_DIR", "/var/lib/watchsynova-ingest"))
CONFIG_FILE = DATA_DIR / "platform-config.json"
AVATAR_DIR = DATA_DIR / "avatars"
TOKEN = os.environ["WATCHSYNOVA_INGEST_TOKEN"]
AW_SERVER = os.environ.get("WATCHSYNOVA_AW_SERVER", "http://127.0.0.1:5600")
OWNER_NAME = os.environ.get("TIMEWATCHER_OWNER_NAME", "Juan Kleber")
TENANT_NAME = os.environ.get("TIMEWATCHER_TENANT_NAME", "Synova Tecnologia")
LOCAL_TIMEZONE = ZoneInfo(os.environ.get("TIMEWATCHER_TIMEZONE", "America/Sao_Paulo"))
SESSION_TTL_DAYS = 14
SESSION_SECRET_ENV = os.environ.get("TIMEWATCHER_SESSION_SECRET", "")
BOOTSTRAP_ADMIN = os.environ.get("TIMEWATCHER_BOOTSTRAP_ADMIN", "")
PUBLIC_URL = os.environ.get("TIMEWATCHER_PUBLIC_URL", "https://timewatcher.32-193-139-223.sslip.io")
AUDIT_FILE = DATA_DIR / "audit.log"
RETENTION_DAYS = int(os.environ.get("TIMEWATCHER_RETENTION_DAYS", "180") or "0")
LOGIN_MAX_ATTEMPTS = 8
LOGIN_WINDOW_SECONDS = 300
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
        "accounts": {},
        "invites": [],
        "teams": [],
        "classification": {},
        "policies": {},
        "billing": {},
        "pricing": {},
        "blockedHosts": {},
        "removedHosts": {},
        "devices": {},
        "onboarding": {},
        "journeyAdjustments": [],
        "reportSchedules": [],
        "integrations": {},
        "scimTokens": [],
        "agentReleases": {},
        "agentUpdatePolicies": {},
        "monthlyClosings": [],
    }


def _read_config_file() -> dict | None:
    if not CONFIG_FILE.exists():
        return None
    try:
        return json.loads(CONFIG_FILE.read_text())
    except (OSError, json.JSONDecodeError):
        return None


def _with_baseline(config: dict) -> dict:
    baseline = default_config()
    for key, value in baseline.items():
        config.setdefault(key, value)
    return config


def _save_config_file(config: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", dir=DATA_DIR, delete=False) as temporary:
        json.dump(config, temporary, ensure_ascii=False, indent=2)
        temporary.flush()
        os.fsync(temporary.fileno())
        temporary_path = Path(temporary.name)
    temporary_path.chmod(0o600)
    temporary_path.replace(CONFIG_FILE)


def load_config() -> dict:
    if store.db_enabled():
        config = store.db_load()
        if config is None:  # first boot on the DB: seed from the existing file
            config = _with_baseline(_read_config_file() or default_config())
            store.db_save(config)
            return config
        return _with_baseline(config)
    config = _read_config_file()
    if config is None:
        config = default_config()
        save_config(config)
        return config
    return _with_baseline(config)


def save_config(config: dict) -> None:
    if store.db_enabled():
        store.db_save(config)
        return
    _save_config_file(config)


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


def classify(value: str, rules: dict | None = None) -> str:
    normalized = value.strip().lower()
    if rules:
        for token in rules.get("unproductive", []):
            if token and token in normalized:
                return "unproductive"
        for token in rules.get("productive", []):
            if token and token in normalized:
                return "productive"
        for token in rules.get("neutral", []):
            if token and token in normalized:
                return "neutral"
    if any(token in normalized for token in PRODUCTIVE):
        return "productive"
    if any(token in normalized for token in UNPRODUCTIVE):
        return "unproductive"
    return "neutral"


def classification_rules(config: dict, tenant_id: str) -> dict:
    """Per-tenant classification overrides (app/domain substrings)."""
    raw = (config.get("classification") or {}).get(tenant_id) or {}
    return {cat: [str(t).strip().lower() for t in (raw.get(cat) or []) if str(t).strip()] for cat in ("productive", "unproductive", "neutral")}


DEFAULT_PRICES = {"essential": 38.90, "intelligence": 50.90}


def billing_summary(config: dict, tenant_id: str) -> dict:
    """License-pool billing for a tenant. Super admin sets the pool (N Essential +
    M Intelligence); admins assign a license per person. Payment gateway stubbed."""
    billing = (config.get("billing") or {}).get(tenant_id) or {}
    pricing = config.get("pricing") or {}
    prices = {k: float(pricing.get(k, DEFAULT_PRICES[k])) for k in DEFAULT_PRICES}
    pool = billing.get("pool")
    if not pool:  # migrate legacy {plan, seats}
        seats = int(billing.get("seats", 0) or 0); legacy_plan = billing.get("plan", "essential")
        pool = {"essential": seats if legacy_plan != "intelligence" else 0, "intelligence": seats if legacy_plan == "intelligence" else 0}
    pool = {"essential": int(pool.get("essential", 0) or 0), "intelligence": int(pool.get("intelligence", 0) or 0)}
    people = [p for p in config.get("people", []) if p.get("tenantId") == tenant_id]
    used = {"essential": sum(1 for p in people if p.get("licenseType") == "essential"),
            "intelligence": sum(1 for p in people if p.get("licenseType") == "intelligence")}
    monthly = round(pool["essential"] * prices["essential"] + pool["intelligence"] * prices["intelligence"], 2)
    limits = billing.get("limits") or {"people": pool["essential"] + pool["intelligence"], "devices": 0, "retentionDays": retention_days()}
    return {
        "pool": pool, "used": used, "prices": prices, "status": billing.get("status", "trial"),
        "cycleStart": billing.get("cycleStart"), "monthlyTotal": monthly,
        "features": {"intelligence": pool["intelligence"] > 0}, "limits": {"people": int(limits.get("people", 0) or 0), "devices": int(limits.get("devices", 0) or 0), "retentionDays": int(limits.get("retentionDays", 0) or 0)},
        "plans": [
            {"id": "essential", "name": "Essential", "price": prices["essential"], "features": ["Monitoramento e capturas", "Pessoas, OUs e gestor", "Relatórios e exportações", "Alertas em tempo real"]},
            {"id": "intelligence", "name": "Intelligence", "price": prices["intelligence"], "features": ["Tudo do Essential", "Entra na análise de IA", "Perguntas em linguagem natural", "Resumos e recomendações"]},
        ],
    }


def device_allowed(config: dict, tenant_id: str, hostname: str) -> bool:
    """Enforce a tenant device limit at ingestion time, not only in the UI."""
    hostname = canonical_host(hostname)
    known = {key.split(":", 1)[1] for key in (config.get("devices") or {}) if key.startswith(f"{tenant_id}:")}
    if hostname in known:
        return True
    limit = int((billing_summary(config, tenant_id).get("limits") or {}).get("devices", 0) or 0)
    return limit == 0 or len(known) < limit


def canonical_host(value: str) -> str:
    return str(value or "unknown").strip().casefold()[:200]


def auto_link_device_identity(config: dict, tenant_id: str, hostname: str, inventory: dict) -> dict | None:
    """Link telemetry to exactly one roster person; never guess ambiguous identities."""
    host = canonical_host(hostname)
    email = str(inventory.get("sessionEmail", "")).strip().lower()
    user = re.sub(r"[^a-z0-9]", "", str(inventory.get("sessionUser", "")).lower())
    people = [p for p in config.get("people", []) if p.get("tenantId") == tenant_id]
    candidates = [p for p in people if email and (p.get("email") or "").lower() == email]
    if not candidates and user:
        candidates = [p for p in people if user in {
            re.sub(r"[^a-z0-9]", "", (p.get("email") or "").split("@", 1)[0].lower()),
            re.sub(r"[^a-z0-9]", "", str(p.get("name", "")).lower()),
        }]
    if len(candidates) > 1:
        return None
    if not candidates:
        if not user:
            return None
        person = {"id": f"agent-{host}", "tenantId": tenant_id, "name": str(inventory.get("sessionUser"))[:120], "title": "Colaborador (confirmar identidade)", "identityPending": True, "host": host, "deviceIds": [host]}
        config.setdefault("people", []).append(person)
    else:
        person = candidates[0]
    existing = canonical_host(person.get("host", "")) if person.get("host") else ""
    if existing and existing != host:
        return None
    person["host"] = host
    if email and not person.get("email"):
        person["email"] = email
    config.setdefault("devices", {}).setdefault(f"{tenant_id}:{host}", {})["personId"] = person["id"]
    return person


def register_device_signal(config: dict, tenant_id: str, hostname: str, client: str = "", version: str = "", inventory: dict | None = None, observed_ip: str = "") -> None:
    """Persist inventory at the first authenticated signal from an agent."""
    hostname = canonical_host(hostname)
    entry = config.setdefault("devices", {}).setdefault(f"{tenant_id}:{hostname}", {})
    entry["lastSignalAt"] = datetime.now(timezone.utc).isoformat()
    if client:
        entry["client"] = client[:200]
    if version:
        entry["version"] = version[:80]
    if isinstance(inventory, dict):
        entry["inventory"] = {key: str(value)[:160] for key, value in inventory.items() if key in ("os", "osVersion", "model", "architecture", "memoryGB", "localIp", "sessionUser", "sessionEmail") and value not in (None, "")}
        if isinstance(inventory.get("installedSoftware"), list):
            entry["software"] = sorted({str(item)[:120] for item in inventory["installedSoftware"] if str(item).strip()})[:300]
    if observed_ip and observed_ip not in ("local", "unknown"):
        entry["observedIp"] = observed_ip[:80]


def version_key(value: str) -> tuple[int, ...]:
    """Compare normal dotted releases without trusting package-provided code."""
    parts = re.findall(r"\d+", str(value or ""))[:4]
    return tuple(int(part) for part in parts) if parts else (0,)


def agent_platform(value: str) -> str:
    raw = str(value or "").strip().lower()
    return "macos" if raw in ("mac", "macos", "darwin") else "windows" if raw.startswith("win") else raw


def tenant_update_policy(config: dict, tenant_id: str) -> dict:
    configured = (config.get("agentUpdatePolicies") or {}).get(tenant_id) or {}
    return {
        "enabled": bool(configured.get("enabled", True)),
        "rolloutPercent": max(0, min(100, int(configured.get("rolloutPercent", 100) or 0))),
        "checkIntervalMinutes": max(15, min(1440, int(configured.get("checkIntervalMinutes", 60) or 60))),
        "channel": "stable",
    }


def rollout_selected(tenant_id: str, hostname: str, percent: int) -> bool:
    cohort = int(hashlib.sha256(f"{tenant_id}:{canonical_host(hostname)}".encode()).hexdigest()[:8], 16) % 100
    return cohort < percent


def agent_update_manifest(config: dict, tenant_id: str, hostname: str, platform_name: str, current_version: str) -> dict:
    platform_name = agent_platform(platform_name)
    release = (config.get("agentReleases") or {}).get(platform_name) or {}
    policy = tenant_update_policy(config, tenant_id)
    entry = config.setdefault("devices", {}).setdefault(f"{tenant_id}:{canonical_host(hostname)}", {})
    target = str(release.get("version", ""))
    requested = bool(entry.get("updateRequested"))
    eligible = requested or (policy["enabled"] and rollout_selected(tenant_id, hostname, policy["rolloutPercent"]))
    available = bool(target and release.get("url") and release.get("sha256") and version_key(target) > version_key(current_version))
    entry["lastUpdateCheckAt"] = datetime.now(timezone.utc).isoformat()
    entry["targetVersion"] = target or None
    if requested and not release:
        entry["updateStatus"] = "release_unavailable"
    elif available and eligible:
        entry["updateStatus"] = "offered"
    elif target and version_key(current_version) >= version_key(target):
        entry["updateStatus"] = "current"
        entry["updateRequested"] = False
    return {
        "updateAvailable": available and eligible,
        "requested": requested,
        "currentVersion": current_version,
        "release": release if available and eligible else None,
        "policy": policy,
    }


def agent_fleet_summary(config: dict, tenant_id: str) -> dict:
    releases = config.get("agentReleases") or {}
    distribution: dict[str, int] = defaultdict(int)
    statuses: dict[str, int] = defaultdict(int)
    rows = []
    for key, entry in (config.get("devices") or {}).items():
        if not key.startswith(f"{tenant_id}:"):
            continue
        host = key.split(":", 1)[1]
        inventory = entry.get("inventory") or {}
        platform_name = agent_platform(inventory.get("os") or ("macos" if "mac" in host.lower() else "windows"))
        version = str(entry.get("version") or "desconhecida")
        target = str((releases.get(platform_name) or {}).get("version") or "")
        status = str(entry.get("updateStatus") or "")
        if target and version_key(version) >= version_key(target): status = "current"
        elif target and status not in ("requested", "offered", "downloading", "installing", "failed", "permission_required"): status = "outdated"
        elif not target: status = "unmanaged"
        distribution[version] += 1; statuses[status] += 1
        rows.append({"host": host, "platform": platform_name, "version": version, "targetVersion": target or None, "status": status, "lastCheckAt": entry.get("lastUpdateCheckAt"), "lastUpdatedAt": entry.get("lastUpdatedAt"), "error": entry.get("updateError")})
    return {"policy": tenant_update_policy(config, tenant_id), "releases": releases, "total": len(rows), "distribution": dict(distribution), "statuses": dict(statuses), "devices": rows}


def readiness_snapshot(config: dict, tenant_id: str) -> dict:
    """Operational readiness based on persisted evidence, never static mock data."""
    people = [p for p in config.get("people", []) if p.get("tenantId") == tenant_id]
    accounts = [a for a in config.get("accounts", {}).values() if a.get("tenantId") == tenant_id and a.get("status") == "active"]
    linked = sum(1 for p in people if p.get("host") and p.get("email") and any((p.get("email") or "").lower() == e.lower() for e, a in config.get("accounts", {}).items() if a.get("status") == "active"))
    devices = [v for key, v in (config.get("devices") or {}).items() if key.startswith(f"{tenant_id}:")]
    release = (config.get("agentReleases") or {}).get("macos") or {}
    return {"checks": [
        {"id": "identity", "label": "Conta, colaborador e host vinculados", "ok": bool(linked), "detail": f"{linked} vínculo(s) completo(s) de {len(people)} pessoa(s)"},
        {"id": "agent", "label": "Agentes com heartbeat", "ok": bool(devices), "detail": f"{len(devices)} dispositivo(s) conhecido(s)"},
        {"id": "release", "label": "Release do agente publicada", "ok": bool(release.get("version") and release.get("url")), "detail": release.get("version") or "Nenhuma release cadastrada"},
        {"id": "access", "label": "Contas ativas", "ok": bool(accounts), "detail": f"{len(accounts)} conta(s) ativa(s)"},
    ], "linkedPeople": linked, "people": len(people), "devices": len(devices)}


_CONFIG_LOCK = threading.Lock()
_SESSION_SECRET_CACHE: bytes | None = None
SECRET_FILE = DATA_DIR / "session-secret"


def session_secret() -> bytes:
    # The signing secret lives in its own file (not the shared, concurrently
    # written config) and is cached per process, so it never changes at runtime
    # and never gets dropped by a racing config write — which would silently
    # invalidate every active session.
    global _SESSION_SECRET_CACHE
    if SESSION_SECRET_ENV:
        return SESSION_SECRET_ENV.encode()
    if _SESSION_SECRET_CACHE is not None:
        return _SESSION_SECRET_CACHE
    with _CONFIG_LOCK:
        if _SESSION_SECRET_CACHE is not None:
            return _SESSION_SECRET_CACHE
        try:
            secret = SECRET_FILE.read_text().strip()
        except OSError:
            secret = ""
        if not secret:
            # Migrate an existing config secret to the file so sessions signed
            # before this change stay valid; otherwise generate a fresh one.
            try:
                secret = str(load_config().get("secret") or "").strip()
            except (OSError, json.JSONDecodeError):
                secret = ""
            if not secret:
                secret = secrets.token_hex(32)
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            temporary = SECRET_FILE.with_name("session-secret.tmp")
            temporary.write_text(secret)
            temporary.chmod(0o600)
            temporary.replace(SECRET_FILE)
        _SESSION_SECRET_CACHE = secret.encode()
        return _SESSION_SECRET_CACHE


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200000)
    return f"pbkdf2$200000${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _algo, iters, salt_hex, hash_hex = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iters))
        return hmac.compare_digest(dk.hex(), hash_hex)
    except (ValueError, AttributeError):
        return False


def _b64u(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _b64u_decode(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def make_session(email: str) -> str:
    exp = int((datetime.now(timezone.utc) + timedelta(days=SESSION_TTL_DAYS)).timestamp())
    payload = _b64u(json.dumps({"e": email, "exp": exp}).encode())
    sig = _b64u(hmac.new(session_secret(), payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{sig}"


def read_session(token: str) -> str | None:
    try:
        payload, sig = token.split(".", 1)
        expected = _b64u(hmac.new(session_secret(), payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return None
        data = json.loads(_b64u_decode(payload))
        if int(data["exp"]) < int(datetime.now(timezone.utc).timestamp()):
            return None
        return str(data["e"])
    except (ValueError, KeyError, json.JSONDecodeError):
        return None


def get_cookie(headers, name: str) -> str:
    for part in headers.get("Cookie", "").split(";"):
        key, _, value = part.strip().partition("=")
        if key == name:
            return value
    return ""


def viewer(headers) -> dict | None:
    email = read_session(get_cookie(headers, "tw_session"))
    if not email:
        return None
    account = load_config()["accounts"].get(email)
    if not account or account.get("status") != "active":
        return None
    return {"username": email, "email": email, "name": account.get("name", email), "role": account.get("role", "member"), "tenantId": account.get("tenantId", "synova"), "onboardingCompletedAt": account.get("onboardingCompletedAt")}


_LOGIN_ATTEMPTS: dict = {}
_ATTEMPT_LOCK = threading.Lock()
_AUDIT_LOCK = threading.Lock()


def client_ip(headers) -> str:
    forwarded = headers.get("X-Forwarded-For", "")
    return forwarded.split(",")[0].strip() if forwarded else "local"


def login_blocked(key: str) -> bool:
    now = time.time()
    with _ATTEMPT_LOCK:
        recent = [t for t in _LOGIN_ATTEMPTS.get(key, []) if now - t < LOGIN_WINDOW_SECONDS]
        _LOGIN_ATTEMPTS[key] = recent
        return len(recent) >= LOGIN_MAX_ATTEMPTS


def record_login_failure(key: str) -> None:
    with _ATTEMPT_LOCK:
        _LOGIN_ATTEMPTS.setdefault(key, []).append(time.time())


def clear_login_failures(key: str) -> None:
    with _ATTEMPT_LOCK:
        _LOGIN_ATTEMPTS.pop(key, None)


def audit(action: str, actor: str = "-", detail: object = None) -> None:
    entry = json.dumps({"ts": datetime.now(timezone.utc).isoformat(), "action": action, "actor": actor, "detail": detail}, ensure_ascii=False)
    try:
        with _AUDIT_LOCK, open(AUDIT_FILE, "a", encoding="utf-8") as handle:
            handle.write(entry + "\n")
    except OSError:
        pass


def report_schedule_worker() -> None:
    """Deliver due report notifications as secure dashboard links, never raw telemetry."""
    while True:
        try:
            now = datetime.now(LOCAL_TIMEZONE)
            with _CONFIG_LOCK:
                config = load_config(); changed = False
                for item in config.get("reportSchedules", []):
                    if not item.get("enabled") or not item.get("email"): continue
                    frequency = item.get("frequency", "weekly")
                    due = frequency == "daily" or (frequency == "weekly" and now.weekday() == 0) or (frequency == "monthly" and now.day == 1)
                    marker = f"{frequency}:{now.strftime('%Y-%m-%d')}"
                    if not due or item.get("lastSentMarker") == marker: continue
                    tenant = next((t for t in config.get("tenants", []) if t.get("id") == item.get("tenantId")), {"name": item.get("tenantId")})
                    report_url = f"{PUBLIC_URL}/?report=scheduled"
                    html = f"<p>Seu relatório {frequency} de <strong>{tenant.get('name')}</strong> está disponível.</p><p><a href=\"{report_url}\">Abrir relatório seguro</a></p>"
                    result = mailer.send(item["email"], f"TimeWatcher · relatório {frequency}", html, f"Relatório disponível: {report_url}")
                    if result.get("ok"):
                        item["lastSentAt"] = datetime.now(timezone.utc).isoformat(); item["lastSentMarker"] = marker; item["deliveryStatus"] = "sent"; changed = True
                        audit("report_schedule.sent", "system", {"id": item.get("id"), "email": item.get("email")})
                    else:
                        item["deliveryStatus"] = "waiting_mail_provider" if result.get("skipped") else "delivery_error"; changed = True
                if changed: save_config(config)
        except Exception as error:
            print(f"[reports] scheduler error: {error}", flush=True)
        time.sleep(60 * 30)


def retention_days() -> int:
    try:
        configured = int((load_config().get("policies") or {}).get("retentionDays"))
        if configured >= 0:
            return configured
    except (TypeError, ValueError):
        pass
    return RETENTION_DAYS


def purge_old_screenshots() -> int:
    days = retention_days()
    if days <= 0:
        return 0
    cutoff = time.time() - days * 86400
    removed = 0
    try:
        for path in (DATA_DIR / "screenshots").rglob("*.jpg"):
            try:
                if path.stat().st_mtime < cutoff:
                    path.unlink(missing_ok=True)
                    removed += 1
            except OSError:
                continue
    except OSError:
        pass
    return removed


def retention_worker() -> None:
    while True:
        try:
            removed = purge_old_screenshots()
            if removed:
                days = retention_days()
                audit("retention.purge", "system", {"removed": removed, "days": days})
                print(f"[retention] purged {removed} screenshots older than {days}d", flush=True)
        except Exception:
            pass
        time.sleep(86400)


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


def effective_segments(events: list, start: datetime, end: datetime) -> list[tuple[datetime, datetime, dict]]:
    """Turn heartbeat-like events into non-overlapping observed intervals.

    A newer observation closes the previous one. This prevents retries and the
    former 60-second web sampler from inflating tracked time.
    """
    parsed = []
    for event in events:
        try:
            event_start = max(start, parse_timestamp(str(event["timestamp"])))
            event_end = min(end, parse_timestamp(str(event["timestamp"])) + timedelta(seconds=max(0.0, float(event.get("duration", 0)))))
            if event_end > event_start:
                parsed.append((event_start, event_end, event.get("data", {})))
        except (KeyError, TypeError, ValueError):
            continue
    parsed.sort(key=lambda item: item[0])
    segments = []
    for index, (event_start, event_end, data) in enumerate(parsed):
        if index + 1 < len(parsed):
            event_end = min(event_end, parsed[index + 1][0])
        if event_end > event_start:
            segments.append((event_start, event_end, data))
    return segments


def merge_intervals(segments: list[tuple[datetime, datetime, dict]]) -> list[tuple[datetime, datetime]]:
    merged: list[list[datetime]] = []
    for segment_start, segment_end, _ in sorted(segments, key=lambda item: item[0]):
        if not merged or segment_start > merged[-1][1]:
            merged.append([segment_start, segment_end])
        else:
            merged[-1][1] = max(merged[-1][1], segment_end)
    return [(item[0], item[1]) for item in merged]


def intervals_duration(intervals: list[tuple[datetime, datetime]]) -> float:
    return sum((interval_end - interval_start).total_seconds() for interval_start, interval_end in intervals)


def schedule_windows(schedule: dict | None, start: datetime, end: datetime) -> list[tuple[datetime, datetime]]:
    """Return the measured portion of a person's configured jornada.

    Windows are built in the product timezone and clipped to the requested
    range/current time, so activity outside the assigned shift never inflates
    the productivity denominator.
    """
    if not schedule:
        return []
    try: local_zone = ZoneInfo(str(schedule.get("timezone") or os.environ.get("TIMEWATCHER_TIMEZONE", "America/Sao_Paulo")))
    except Exception: local_zone = LOCAL_TIMEZONE
    weekdays = {int(day) for day in (schedule.get("weekdays") or [1, 2, 3, 4, 5])}
    holidays = {str(day)[:10] for day in (schedule.get("holidays") or [])}
    exceptions = schedule.get("exceptions") or {}
    local_start = start.astimezone(local_zone).date()
    local_end = end.astimezone(local_zone).date()
    windows = []
    cursor = local_start
    while cursor <= local_end:
        override = exceptions.get(cursor.isoformat()) if isinstance(exceptions, dict) else None
        # An explicit temporary work exception wins over a holiday; this covers
        # regional holidays, compensatory workdays and approved schedule swaps.
        can_work = cursor.isoweekday() in weekdays and cursor.isoformat() not in holidays
        if isinstance(override, dict) and override.get("work"):
            can_work = True
        if can_work and not (isinstance(override, dict) and override.get("off")):
            shifts = override.get("shifts") if isinstance(override, dict) else None
            shifts = shifts if isinstance(shifts, list) and shifts else schedule.get("shifts")
            if not isinstance(shifts, list) or not shifts:
                shifts = [{"start": schedule.get("start", "09:00"), "end": schedule.get("end", "18:00"), "breakMinutes": schedule.get("breakMinutes", 0)}]
            for shift in shifts[:4]:
                try:
                    start_hm = shift.get("start", schedule.get("start", "09:00")); end_hm = shift.get("end", schedule.get("end", "18:00"))
                    sh2, sm2 = (int(x) for x in str(start_hm).split(":")[:2]); eh2, em2 = (int(x) for x in str(end_hm).split(":")[:2])
                    pause = max(0, int(shift.get("breakMinutes", 0))) * 60
                except (TypeError, ValueError):
                    continue
                ws = datetime(cursor.year, cursor.month, cursor.day, sh2, sm2, tzinfo=local_zone)
                we = datetime(cursor.year, cursor.month, cursor.day, eh2, em2, tzinfo=local_zone)
                if we <= ws: we += timedelta(days=1)
                we -= timedelta(seconds=pause)
                clipped = (max(start, ws.astimezone(timezone.utc)), min(end, we.astimezone(timezone.utc)))
                if clipped[1] > clipped[0]: windows.append(clipped)
        cursor += timedelta(days=1)
    return windows


def schedule_metrics(schedule: dict | None, start: datetime, end: datetime, tracked: list[tuple[datetime, datetime]], active: list[tuple[datetime, datetime]], productive: list[tuple[datetime, datetime]]) -> dict:
    planned = schedule_windows(schedule, start, end)
    expected = intervals_duration(planned)
    active_inside = intersection_duration(active, planned)
    productive_inside = intersection_duration(productive, planned)
    tolerance = max(0, int((schedule or {}).get("toleranceMinutes", 0) or 0)) * 60
    first_observed = min((item[0] for item in active), default=None)
    first_shift = min((item[0] for item in planned), default=None)
    late_seconds = max(0.0, (first_observed - first_shift).total_seconds() - tolerance) if first_observed and first_shift else 0.0
    return {
        "expectedSeconds": round(expected, 3),
        "scheduledTrackedSeconds": round(intersection_duration(tracked, planned), 3),
        "scheduledActiveSeconds": round(active_inside, 3),
        "scheduledProductiveSeconds": round(productive_inside, 3),
        "outsideScheduleSeconds": round(max(0.0, intervals_duration(tracked) - intersection_duration(tracked, planned)), 3),
        "scheduleAdherence": round(min(100.0, active_inside / expected * 100) if expected else 0.0, 1),
        "productivityIndex": round(min(100.0, productive_inside / expected * 100) if expected else 0.0, 1),
        "lateSeconds": round(late_seconds, 3),
        # Bank hours compares observed active time with the planned workload;
        # overtime is visible, but only approved exceptions alter the schedule.
        "bankSeconds": round(intervals_duration(active) - expected, 3) if (schedule or {}).get("bankHours") else 0.0,
    }


def subtract_intervals(base: list[tuple[datetime, datetime]], masks: list[tuple[datetime, datetime]]) -> list[tuple[datetime, datetime]]:
    result = []
    for bs, be in base:
        cursor = bs
        for ms, me in masks:
            if me <= cursor: continue
            if ms >= be: break
            if ms > cursor: result.append((cursor, min(ms, be)))
            cursor = max(cursor, me)
            if cursor >= be: break
        if cursor < be: result.append((cursor, be))
    return [(s, e) for s, e in result if e > s]


def uncovered_duration(segment: tuple[datetime, datetime, dict], masks: list[tuple[datetime, datetime]]) -> float:
    segment_start, segment_end, _ = segment
    covered = 0.0
    for mask_start, mask_end in masks:
        if mask_end <= segment_start: continue
        if mask_start >= segment_end: break
        covered += max(0.0, (min(segment_end, mask_end) - max(segment_start, mask_start)).total_seconds())
    return max(0.0, (segment_end - segment_start).total_seconds() - covered)


def intersection_duration(left: list[tuple[datetime, datetime]], right: list[tuple[datetime, datetime]]) -> float:
    total = 0.0; i = 0; j = 0
    while i < len(left) and j < len(right):
        total += max(0.0, (min(left[i][1], right[j][1]) - max(left[i][0], right[j][0])).total_seconds())
        if left[i][1] <= right[j][1]: i += 1
        else: j += 1
    return total


def dashboard_data(params: dict, current_viewer: dict) -> dict:
    start, end, period = bounds(params)
    config = load_config()
    tenant_id = params.get("tenant", [current_viewer["tenantId"]])[0] if current_viewer["role"] == "super_admin" else current_viewer["tenantId"]
    scope = params.get("scope", ["default"])[0]
    buckets = aw_get("/api/0/buckets/")
    def belongs(bucket_id: str) -> bool:
        return bucket_id.startswith(f"tw-{tenant_id}_") if tenant_id != "synova" else not bucket_id.startswith("tw-") or bucket_id.startswith("tw-synova_")
    buckets = {key: {**value, "hostname": canonical_host(value.get("hostname", ""))} for key, value in buckets.items() if belongs(key)}
    removed_hosts = set((config.get("removedHosts") or {}).get(tenant_id, []))
    buckets = {key: value for key, value in buckets.items() if value.get("hostname") not in removed_hosts}
    assignable_hosts = telemetry_hosts(buckets)
    mine = member_person(config, current_viewer)
    my_host = mine.get("host") if mine else None
    if current_viewer["role"] in ("super_admin", "org_admin"):
        linkable_hosts = assignable_hosts
    elif current_viewer["role"] == "manager":
        linkable_hosts = assignable_hosts & manager_hosts(config, current_viewer.get("email", ""), tenant_id)
    else:
        linkable_hosts = {my_host} if my_host else set()
    # Personal mode is intentionally available to every role.  It narrows an
    # administrator or manager to the person record tied to their login e-mail.
    if scope == "self":
        buckets = {key: value for key, value in buckets.items() if my_host and value.get("hostname") == my_host}
    elif current_viewer["role"] == "manager":
        allowed_hosts = manager_hosts(config, current_viewer.get("email", ""), tenant_id)
        buckets = {key: value for key, value in buckets.items() if value.get("hostname") in allowed_hosts}
    elif current_viewer["role"] in ("member", "employee"):
        buckets = {key: value for key, value in buckets.items() if my_host and value.get("hostname") == my_host}
    rules = classification_rules(config, tenant_id)
    window_buckets = [(key, value) for key, value in buckets.items() if value.get("type") == "currentwindow"]
    afk_buckets = [(key, value) for key, value in buckets.items() if value.get("type") == "afkstatus"]
    input_buckets = [(key, value) for key, value in buckets.items() if value.get("type") == "os.hid.input"]
    web_buckets = [(key, value) for key, value in buckets.items() if value.get("type") in ("web.tab.current", "currentwebtab") or "web" in str(value.get("type", "")).lower()]
    heartbeat_buckets = [(key, value) for key, value in buckets.items() if value.get("type") == "timewatcher.heartbeat"]

    def events_for(bucket_id: str) -> list:
        query = urllib.parse.urlencode({"start": start.isoformat(), "end": end.isoformat(), "limit": 10000})
        return aw_get(f"/api/0/buckets/{urllib.parse.quote(bucket_id, safe='')}/events?{query}")

    window_event_groups = [events_for(bucket_id) for bucket_id, _ in window_buckets]
    afk_event_groups = [events_for(bucket_id) for bucket_id, _ in afk_buckets]
    web_event_groups = [events_for(bucket_id) for bucket_id, _ in web_buckets]
    windows = [event for group in window_event_groups for event in group]
    afk_events = [event for group in afk_event_groups for event in group]
    input_events = [event for bucket_id, _ in input_buckets for event in events_for(bucket_id)]
    web_events = [event for group in web_event_groups for event in group]
    app_seconds, domain_seconds, page_seconds, hourly = defaultdict(float), defaultdict(float), defaultdict(float), defaultdict(float)
    web_hourly, productive_hourly, input_hourly = defaultdict(float), defaultdict(float), defaultdict(lambda: {"presses": 0, "clicks": 0, "seconds": 0.0})
    page_titles, recent = {}, []
    window_segments = [segment for group in window_event_groups for segment in effective_segments(group, start, end)]
    web_segments = [segment for group in web_event_groups for segment in effective_segments(group, start, end)]
    idle_segments = [segment for group in afk_event_groups for segment in effective_segments([event for event in group if event.get("data", {}).get("status") == "afk"], start, end)]
    web_intervals = merge_intervals(web_segments)
    tracked_intervals = merge_intervals(window_segments + web_segments)
    tracked_seconds = intervals_duration(tracked_intervals)
    for segment_start, segment_end, data in window_segments:
        seconds = (segment_end - segment_start).total_seconds()
        app = str(data.get("app", "Não identificado")) or "Não identificado"
        title = str(data.get("title", ""))
        app_seconds[app] += seconds
        hourly[segment_start.astimezone(LOCAL_TIMEZONE).hour] += seconds
        if classify(app, rules) == "productive": productive_hourly[segment_start.astimezone(LOCAL_TIMEZONE).hour] += seconds
        recent.append({"timestamp": segment_start.isoformat(), "duration": seconds, "app": app, "title": title})
    for segment_start, segment_end, data in web_segments:
        seconds = (segment_end - segment_start).total_seconds()
        url = str(data.get("url", ""))
        if not url:
            continue
        parsed = urllib.parse.urlsplit(url if "://" in url else "https://" + url)
        domain = parsed.hostname or "URL desconhecida"
        clean_url = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", ""))
        domain_seconds[domain] += seconds
        page_seconds[clean_url] += seconds
        web_hourly[segment_start.astimezone(LOCAL_TIMEZONE).hour] += seconds
        if classify(domain, rules) == "productive": productive_hourly[segment_start.astimezone(LOCAL_TIMEZONE).hour] += seconds
        page_titles[clean_url] = str(data.get("title", ""))
        if not window_segments:
            hourly[segment_start.astimezone(LOCAL_TIMEZONE).hour] += seconds

    idle_seconds = intersection_duration(tracked_intervals, merge_intervals(idle_segments))
    active_seconds = max(0.0, tracked_seconds - idle_seconds)
    category_seconds = {"productive": 0.0, "neutral": 0.0, "unproductive": 0.0}
    for segment_start, segment_end, data in web_segments:
        raw_url = str(data.get("url", "")); domain = urllib.parse.urlsplit(raw_url).hostname or raw_url
        category_seconds[classify(domain, rules)] += (segment_end - segment_start).total_seconds()
    for segment in window_segments:
        app = str(segment[2].get("app", "Não identificado")) or "Não identificado"
        category_seconds[classify(app, rules)] += uncovered_duration(segment, web_intervals)
    apps = []
    window_total = intervals_duration(merge_intervals(window_segments))
    for name, seconds in sorted(app_seconds.items(), key=lambda item: item[1], reverse=True):
        category = classify(name, rules)
        apps.append({"name": name, "seconds": round(seconds, 3), "duration": duration_label(seconds), "classification": category, "share": round(seconds / window_total * 100 if window_total else 0, 1)})
    urls = []
    web_total = intervals_duration(web_intervals)
    for url, seconds in sorted(page_seconds.items(), key=lambda item: item[1], reverse=True):
        domain = urllib.parse.urlsplit(url).hostname or url
        urls.append({"url": url, "domain": domain, "title": page_titles.get(url, ""), "seconds": round(seconds, 3), "duration": duration_label(seconds), "classification": classify(domain, rules), "share": round(seconds / web_total * 100 if web_total else 0, 1)})
    if urls and web_total:
        # Keep the displayed percentages arithmetically integral after
        # one-decimal rounding (for example, never show a total of 100.2%).
        urls[0]["share"] = round(urls[0]["share"] + (100.0 - sum(item["share"] for item in urls)), 1)

    for event in input_events:
        try:
            hour = parse_timestamp(str(event["timestamp"])).astimezone(LOCAL_TIMEZONE).hour
            sample = input_hourly[hour]; data = event.get("data", {})
            sample["presses"] += int(data.get("presses", 0)); sample["clicks"] += int(data.get("clicks", 0)); sample["seconds"] += max(0.0, float(event.get("duration", 0)))
        except (KeyError, TypeError, ValueError):
            continue

    screenshot_buckets = [(key, value) for key, value in buckets.items() if value.get("type") in ("timewatcher.screenshot", "watchsynova.screenshot")]
    all_buckets = window_buckets + afk_buckets + input_buckets + web_buckets + screenshot_buckets + heartbeat_buckets
    last_seen_values, devices_by_host, clients_by_host = [], {}, {}
    signals_by_host: dict = defaultdict(dict)
    for _, bucket in all_buckets:
        hostname = bucket.get("hostname") or "Dispositivo desconhecido"
        if bucket.get("client"): clients_by_host.setdefault(hostname, str(bucket.get("client"))[:80])
        last_value = bucket.get("last_updated") or bucket.get("created")
        if last_value:
            last_dt = parse_timestamp(last_value)
            last_seen_values.append(last_dt)
            devices_by_host[hostname] = max(last_dt, devices_by_host.get(hostname, last_dt))
            btype = str(bucket.get("type", ""))
            signal = "window" if btype == "currentwindow" else "afk" if btype == "afkstatus" else "input" if btype == "os.hid.input" else "web" if btype in ("web.tab.current", "currentwebtab") or "web" in btype.lower() else "screenshots" if btype in ("timewatcher.screenshot", "watchsynova.screenshot") else "heartbeat" if btype == "timewatcher.heartbeat" else None
            if signal:
                signals_by_host[hostname][signal] = max(last_dt, signals_by_host[hostname].get(signal, last_dt))
    presses = sum(int(e.get("data", {}).get("presses", 0)) for e in input_events)
    clicks = sum(int(e.get("data", {}).get("clicks", 0)) for e in input_events)
    input_seconds = sum(max(0.0, float(e.get("duration", 0))) for e in input_events)
    blocked_hosts = set((config.get("blockedHosts") or {}).get(tenant_id, []))
    def device_health(seen: datetime) -> str:
        age = (end - seen).total_seconds()
        return "online" if age < 300 else "stale" if age < 3600 else "offline"
    registry = config.get("devices") or {}
    people_by_host = {canonical_host(person.get("host")): person for person in config.get("people", []) if person.get("tenantId") == tenant_id and person.get("host")}
    devices = [{"id": host, "name": (registry.get(f"{tenant_id}:{host}") or {}).get("name") or host.replace(".local", ""), "platform": "macOS" if "Mac" in host else "Desktop", "lastSeen": seen.isoformat(), "status": "online" if (end - seen).total_seconds() < 300 else "offline", "health": device_health(seen), "client": clients_by_host.get(host), "version": (registry.get(f"{tenant_id}:{host}") or {}).get("version") or clients_by_host.get(host), "updateRequested": bool((registry.get(f"{tenant_id}:{host}") or {}).get("updateRequested")), "updateStatus": (registry.get(f"{tenant_id}:{host}") or {}).get("updateStatus"), "targetVersion": (registry.get(f"{tenant_id}:{host}") or {}).get("targetVersion"), "lastUpdateCheckAt": (registry.get(f"{tenant_id}:{host}") or {}).get("lastUpdateCheckAt"), "lastUpdatedAt": (registry.get(f"{tenant_id}:{host}") or {}).get("lastUpdatedAt"), "updateError": (registry.get(f"{tenant_id}:{host}") or {}).get("updateError"), "assignedPersonId": (registry.get(f"{tenant_id}:{host}") or {}).get("personId"), "personName": (people_by_host.get(host) or {}).get("name"), "personEmail": (people_by_host.get(host) or {}).get("email"), "blocked": host in blocked_hosts, "inventory": (registry.get(f"{tenant_id}:{host}") or {}).get("inventory", {}), "software": (registry.get(f"{tenant_id}:{host}") or {}).get("software", []), "observedIp": (registry.get(f"{tenant_id}:{host}") or {}).get("observedIp"), "trackedSeconds": round(tracked_seconds, 3), "activeSeconds": round(active_seconds, 3), "presses": presses, "clicks": clicks, "signals": {name: timestamp.isoformat() for name, timestamp in signals_by_host.get(host, {}).items()}} for host, seen in sorted(devices_by_host.items())]
    _managed = managed_team_ids(config, current_viewer.get("email", ""), tenant_id) if current_viewer["role"] == "manager" else None
    _member = member_person(config, current_viewer) if current_viewer["role"] in ("member", "employee") else None
    people = [person.copy() for person in config["people"] if person["tenantId"] == tenant_id and (_managed is None or person.get("teamId") in _managed) and (_member is None or person.get("id") == _member.get("id"))]
    if people:
        people[0]["deviceIds"] = [d["id"] for d in devices]
    productive = category_seconds["productive"]
    score = round(productive / tracked_seconds * 100 if tracked_seconds else 0)
    screenshot_count = sum(1 for _ in (DATA_DIR / "screenshots").rglob("*.jpg"))
    person = people[0] if people else {"id": "unassigned", "name": "Sem colaborador", "role": "Colaborador", "scheduleId": None, "deviceIds": []}
    schedule = resolved_schedule(config, person, tenant_id)
    tracked_intervals = merge_intervals(window_segments + web_segments)
    idle_intervals = merge_intervals(idle_segments)
    active_intervals = subtract_intervals(tracked_intervals, idle_intervals)
    productive_segments = [seg for seg in web_segments if classify(urllib.parse.urlsplit(str(seg[2].get("url", ""))).hostname or str(seg[2].get("url", "")), rules) == "productive"]
    productive_segments += [seg for seg in window_segments if classify(str(seg[2].get("app", "Não identificado")), rules) == "productive"]
    journey = schedule_metrics(schedule, start, end, tracked_intervals, active_intervals, merge_intervals(productive_segments))
    person.update({"deviceCount": len(devices), "status": "online" if any(d["status"] == "online" for d in devices) else "offline", "trackedSeconds": round(tracked_seconds, 3), "activeSeconds": round(active_seconds, 3), "idleSeconds": round(idle_seconds, 3), "productiveSeconds": round(productive, 3), "focusScore": score})
    person.update(journey)
    tenant = next((t for t in config["tenants"] if t["id"] == tenant_id), {"id": tenant_id, "name": tenant_id})
    recent.sort(key=lambda item: item.get("timestamp") or "", reverse=True)
    return {
        "viewer": current_viewer, "scope": scope, "tenant": tenant, "tenants": config["tenants"] if current_viewer["role"] == "super_admin" else [tenant],
        "selfLink": {"linked": bool(my_host), "host": my_host, "candidates": [{"host": host, "name": ((config.get("devices") or {}).get(f"{tenant_id}:{host}") or {}).get("name") or host.replace(".local", "")} for host in sorted(linkable_hosts)]},
        "period": period, "range": {"start": start.isoformat(), "end": end.isoformat()}, "generatedAt": datetime.now(timezone.utc).isoformat(),
        "person": person, "people": people, "schedules": [s for s in config["schedules"] if s["tenantId"] == tenant_id], "schedule": schedule,
        "summary": {"trackedSeconds": round(tracked_seconds, 3), "activeSeconds": round(active_seconds, 3), "idleSeconds": round(idle_seconds, 3), "productiveSeconds": round(productive, 3), "neutralSeconds": round(category_seconds["neutral"], 3), "unproductiveSeconds": round(category_seconds["unproductive"], 3), "focusScore": score, "deviceCount": len(devices), "onlineDeviceCount": sum(d["status"] == "online" for d in devices), "screenshotCount": screenshot_count, "urlCount": len(urls), "webSeconds": round(web_total, 3), "inputSeconds": round(input_seconds, 3), "lastSeen": max(last_seen_values).isoformat() if last_seen_values else None, **journey},
        "devices": devices, "agentFleet": agent_fleet_summary(config, tenant_id), "apps": apps[:100], "urls": urls[:200], "domains": [{"domain": d, "seconds": round(s, 3), "duration": duration_label(s), "classification": classify(d, rules)} for d, s in sorted(domain_seconds.items(), key=lambda item: item[1], reverse=True)],
        "timeline": [{"hour": h, "label": f"{h:02d}h", "seconds": round(hourly[h], 3)} for h in range(24) if hourly[h] > 0],
        "interactionTimeline": [{"hour": h, "label": f"{h:02d}", "presses": input_hourly[h]["presses"], "clicks": input_hourly[h]["clicks"], "seconds": round(input_hourly[h]["seconds"], 3)} for h in range(24)],
        "webTimeline": [{"hour": h, "label": f"{h:02d}", "seconds": round(web_hourly[h], 3), "productiveSeconds": round(productive_hourly[h], 3)} for h in range(24)],
        "recent": recent[:100], "input": {"presses": presses, "clicks": clicks},
    }


def monthly_closing_preview(config: dict, current_viewer: dict, tenant_id: str, month: str) -> dict:
    """Build an immutable, auditable monthly workload snapshot from real telemetry."""
    if not re.fullmatch(r"\d{4}-\d{2}", month or ""):
        raise ValueError("invalid_month")
    year, month_number = (int(part) for part in month.split("-"))
    start = datetime(year, month_number, 1, tzinfo=LOCAL_TIMEZONE)
    end = datetime(year + 1, 1, 1, tzinfo=LOCAL_TIMEZONE) if month_number == 12 else datetime(year, month_number + 1, 1, tzinfo=LOCAL_TIMEZONE)
    # bounds() treats a custom end date as inclusive; use the last date of the
    # target month so that the next month's first day never leaks into closing.
    last_day = (end - timedelta(days=1)).date().isoformat()
    snapshot = dashboard_data({"period": ["custom"], "start": [start.date().isoformat()], "end": [last_day], "tenant": [tenant_id], "scope": ["default"]}, {**current_viewer, "tenantId": tenant_id})
    summary = snapshot["summary"]
    return {"month": month, "tenantId": tenant_id, "range": snapshot["range"], "people": len(snapshot["people"]), "trackedSeconds": summary["trackedSeconds"], "activeSeconds": summary["activeSeconds"], "productiveSeconds": summary["productiveSeconds"], "idleSeconds": summary["idleSeconds"], "expectedSeconds": summary.get("expectedSeconds", 0), "bankSeconds": summary.get("bankSeconds", 0), "lateSeconds": summary.get("lateSeconds", 0), "scheduleAdherence": summary.get("scheduleAdherence", 0), "focusScore": summary.get("focusScore", 0)}


def descendant_ou_ids(config: dict, tenant_id: str, roots: set) -> set:
    """All OU ids in the subtree(s) rooted at `roots` (inclusive of the roots)."""
    children: dict = {}
    for team in config.get("teams", []):
        if team.get("tenantId") == tenant_id:
            children.setdefault(team.get("parentId"), []).append(team["id"])
    result = set(roots); stack = list(roots)
    while stack:
        node = stack.pop()
        for child in children.get(node, []):
            if child not in result:
                result.add(child); stack.append(child)
    return result


def managed_team_ids(config: dict, email: str, tenant_id: str) -> set:
    """OU ids a manager is responsible for — the OUs they manage plus all descendants."""
    target = (email or "").lower()
    direct = {t["id"] for t in config.get("teams", []) if t.get("tenantId") == tenant_id and (t.get("managerEmail") or "").lower() == target}
    return descendant_ou_ids(config, tenant_id, direct)


def manager_hosts(config: dict, email: str, tenant_id: str) -> set:
    """Telemetry hosts a manager may see (people assigned to their teams)."""
    team_ids = managed_team_ids(config, email, tenant_id)
    return {p.get("host") for p in config.get("people", []) if p.get("tenantId") == tenant_id and p.get("teamId") in team_ids and p.get("host")}


def member_person(config: dict, viewer: dict) -> dict | None:
    """The person a logged-in member IS (matched by e-mail), for self-only views."""
    email = (viewer.get("email") or "").lower()
    for person in config.get("people", []):
        if person.get("tenantId") == viewer.get("tenantId") and (person.get("email") or "").lower() == email:
            return person
    return None


def telemetry_hosts(buckets: dict) -> set:
    """Hosts that have sent a real, assignable signal (not only stale metadata)."""
    allowed = {"currentwindow", "afkstatus", "os.hid.input", "timewatcher.heartbeat", "web.tab.current", "currentwebtab"}
    return {str(bucket.get("hostname")) for bucket in buckets.values()
            if bucket.get("hostname") and (bucket.get("type") in allowed or "web" in str(bucket.get("type", "")).lower())}


def resolved_schedule(config: dict, person: dict, tenant_id: str) -> dict | None:
    base = next((s for s in config.get("schedules", []) if s.get("id") == person.get("scheduleId") and s.get("tenantId") == tenant_id), None)
    if not base:
        return None
    override = person.get("scheduleOverride") or {}
    return {**base, **override, "id": base["id"], "tenantId": tenant_id} if isinstance(override, dict) else base


def host_blocked(tenant_id: str, host: str) -> bool:
    return host in set((load_config().get("blockedHosts") or {}).get(tenant_id, []))


def host_removed(tenant_id: str, host: str) -> bool:
    return host in set((load_config().get("removedHosts") or {}).get(tenant_id, []))


def reconcile_case_variant_host(tenant_id: str, raw_host: str) -> None:
    """Recover a live host that used a legacy hostname casing from a stale removal."""
    canonical = canonical_host(raw_host)
    if raw_host == canonical:
        return
    with _CONFIG_LOCK:
        config = load_config()
        raw_key = f"{tenant_id}:{raw_host}"
        if raw_key not in (config.get("devices") or {}):
            return
        removed = config.setdefault("removedHosts", {}).setdefault(tenant_id, [])
        if canonical in removed:
            config["removedHosts"][tenant_id] = [item for item in removed if item != canonical]
            config.setdefault("blockedHosts", {})[tenant_id] = [item for item in config.get("blockedHosts", {}).get(tenant_id, []) if item != canonical]
            save_config(config)
            audit("device.case_migration", "system", {"tenant": tenant_id, "host": canonical})


def people_directory(params: dict, current_viewer: dict) -> dict:
    """Real people directory: one monitored person per telemetry host, with
    per-person metrics merged with persistent metadata (name/team/schedule)."""
    start, end, period = bounds(params)
    config = load_config()
    tenant_id = params.get("tenant", [current_viewer["tenantId"]])[0] if current_viewer["role"] == "super_admin" else current_viewer["tenantId"]
    buckets = aw_get("/api/0/buckets/")
    def belongs(bucket_id: str) -> bool:
        return bucket_id.startswith(f"tw-{tenant_id}_") if tenant_id != "synova" else not bucket_id.startswith("tw-") or bucket_id.startswith("tw-synova_")
    buckets = {key: {**value, "hostname": canonical_host(value.get("hostname", ""))} for key, value in buckets.items() if belongs(key) and canonical_host(value.get("hostname", "")) not in set((config.get("removedHosts") or {}).get(tenant_id, []))}

    scope = params.get("scope", ["default"])[0]
    is_manager = current_viewer["role"] == "manager" and scope != "self"
    managed = managed_team_ids(config, current_viewer.get("email", ""), tenant_id) if is_manager else set()
    rules = classification_rules(config, tenant_id)
    accounts = {email.lower(): account for email, account in config.get("accounts", {}).items() if account.get("tenantId") == tenant_id and account.get("status", "active") == "active"}
    org_people = [person.copy() for person in config.get("people", []) if person.get("tenantId") == tenant_id]
    known_emails = {(person.get("email") or "").lower() for person in org_people if person.get("email")}
    for email, account in accounts.items():
        if email not in known_emails:
            org_people.append({"id": "account-" + hashlib.sha256(email.encode()).hexdigest()[:12], "tenantId": tenant_id, "name": account.get("name") or email.split("@", 1)[0], "email": email, "title": "Usuário da plataforma", "accessRole": account.get("role")})

    hosts: dict = {}
    for bucket_id, bucket in buckets.items():
        host = bucket.get("hostname") or "Dispositivo desconhecido"
        slot = hosts.setdefault(host, {"window": [], "afk": [], "input": [], "web": [], "lastSeen": None})
        btype = bucket.get("type")
        if btype == "currentwindow": slot["window"].append(bucket_id)
        elif btype == "afkstatus": slot["afk"].append(bucket_id)
        elif btype == "os.hid.input": slot["input"].append(bucket_id)
        elif btype in ("web.tab.current", "currentwebtab") or "web" in str(btype or "").lower(): slot["web"].append(bucket_id)
        last_value = bucket.get("last_updated") or bucket.get("created")
        if last_value:
            last_dt = parse_timestamp(last_value)
            slot["lastSeen"] = last_dt if slot["lastSeen"] is None else max(slot["lastSeen"], last_dt)

    def events_for(bucket_id: str) -> list:
        query = urllib.parse.urlencode({"start": start.isoformat(), "end": end.isoformat(), "limit": 10000})
        return aw_get(f"/api/0/buckets/{urllib.parse.quote(bucket_id, safe='')}/events?{query}")

    meta_by_key: dict = {}
    for person in org_people:
        meta_by_key[canonical_host(person.get("host")) if person.get("host") else person.get("id")] = person

    people = []; used_person_ids: set = set()
    for host, slot in sorted(hosts.items()):
        app_seconds: dict = defaultdict(float); page_seconds: dict = defaultdict(float); page_titles: dict = {}; tracked = 0.0; web_seconds = 0.0; input_seconds = 0.0; recent_activity = []
        for bucket_id in slot["window"]:
            for event in events_for(bucket_id):
                seconds = max(0.0, float(event.get("duration", 0)))
                app = str(event.get("data", {}).get("app", "Não identificado")) or "Não identificado"
                app_seconds[app] += seconds; tracked += seconds
                recent_activity.append({"timestamp": event.get("timestamp"), "kind": "app", "app": app, "title": str(event.get("data", {}).get("title", "")), "duration": duration_label(seconds)})
        for bucket_id in slot["web"]:
            for event in events_for(bucket_id):
                seconds = max(0.0, float(event.get("duration", 0))); data = event.get("data", {}); raw_url = str(data.get("url", ""))
                if not raw_url: continue
                parsed = urllib.parse.urlsplit(raw_url if "://" in raw_url else "https://" + raw_url)
                clean_url = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", "")); page_seconds[clean_url] += seconds; web_seconds += seconds; page_titles[clean_url] = str(data.get("title", ""))
                recent_activity.append({"timestamp": event.get("timestamp"), "kind": "url", "app": str(data.get("app", "Navegador")), "title": page_titles[clean_url], "url": clean_url, "duration": duration_label(seconds)})
        productive = sum(seconds for app, seconds in app_seconds.items() if classify(app, rules) == "productive")
        idle = 0.0
        for bucket_id in slot["afk"]:
            for event in events_for(bucket_id):
                if event.get("data", {}).get("status") == "afk": idle += max(0.0, float(event.get("duration", 0)))
        presses = clicks = 0
        for bucket_id in slot["input"]:
            for event in events_for(bucket_id):
                presses += int(event.get("data", {}).get("presses", 0)); clicks += int(event.get("data", {}).get("clicks", 0))
                input_seconds += max(0.0, float(event.get("duration", 0)))
        active = max(0.0, tracked - min(idle, tracked))
        pid = re.sub(r"[^a-z0-9-]", "-", host.lower()).strip("-") or "host"
        meta = meta_by_key.get(host) or meta_by_key.get(pid) or {}
        schedule = resolved_schedule(config, meta, tenant_id)
        expected = intervals_duration(schedule_windows(schedule, start, end))
        scheduled_active = min(active, expected) if expected else 0.0
        scheduled_productive = min(productive, expected) if expected else 0.0
        # RBAC: a manager only sees people assigned to the teams they manage
        if is_manager and meta.get("teamId") not in managed:
            continue
        # skip noise/validation buckets: a host with zero signal is not a person
        if tracked == 0 and idle == 0 and presses == 0 and clicks == 0 and host not in meta_by_key and pid not in meta_by_key:
            continue
        last_seen = slot["lastSeen"]
        online = bool(last_seen and (end - last_seen).total_seconds() < 300)
        top_apps = sorted(app_seconds.items(), key=lambda item: item[1], reverse=True)[:6]
        top_urls = sorted(page_seconds.items(), key=lambda item: item[1], reverse=True)[:8]
        recent_activity.sort(key=lambda item: item.get("timestamp") or "", reverse=True)
        if meta.get("id"): used_person_ids.add(meta["id"])
        inventory = (config.get("devices", {}).get(f"{tenant_id}:{host}") or {}).get("inventory", {})
        observed_ip = (config.get("devices", {}).get(f"{tenant_id}:{host}") or {}).get("observedIp")
        people.append({
            "id": meta.get("id") or pid, "host": host,
            "name": meta.get("name") or host.replace(".local", ""),
            "title": meta.get("title") or "Colaborador",
            "accessRole": (accounts.get((meta.get("email") or "").lower()) or {}).get("role") or meta.get("accessRole"),
            "teamId": meta.get("teamId"), "ouId": meta.get("ouId") or meta.get("teamId"), "scheduleId": meta.get("scheduleId"),
            "email": meta.get("email"), "licenseType": meta.get("licenseType"), "registered": bool(meta), "hasTelemetry": True,
            "device": host.replace(".local", ""), "platform": "macOS" if "Mac" in host else "Desktop",
            "sessionUser": inventory.get("sessionUser"), "observedIp": observed_ip, "inventory": inventory,
            "status": "online" if online else "offline", "lastSeen": last_seen.isoformat() if last_seen else None,
            "trackedSeconds": round(tracked, 3), "activeSeconds": round(active, 3), "idleSeconds": round(idle, 3),
            "productiveSeconds": round(productive, 3), "focusScore": round(productive / tracked * 100 if tracked else 0),
            "expectedSeconds": round(expected, 3), "scheduledActiveSeconds": round(scheduled_active, 3), "scheduledProductiveSeconds": round(scheduled_productive, 3),
            "scheduleAdherence": round(min(100.0, scheduled_active / expected * 100) if expected else 0.0, 1), "productivityIndex": round(min(100.0, scheduled_productive / expected * 100) if expected else 0.0, 1), "outsideScheduleSeconds": round(max(0.0, tracked - min(tracked, expected)) if expected else 0.0, 3), "scheduleName": schedule.get("name") if schedule else None,
            "presses": presses, "clicks": clicks,
            "inputSeconds": round(input_seconds, 3), "webSeconds": round(web_seconds, 3), "appSeconds": round(sum(app_seconds.values()), 3),
            "topApps": [{"name": app, "seconds": round(seconds, 3), "duration": duration_label(seconds), "classification": classify(app, rules)} for app, seconds in top_apps],
            "topUrls": [{"url": url, "domain": urllib.parse.urlsplit(url).hostname or url, "title": page_titles.get(url, ""), "seconds": round(seconds, 3), "duration": duration_label(seconds), "classification": classify(urllib.parse.urlsplit(url).hostname or url, rules)} for url, seconds in top_urls],
            "recentActivity": recent_activity[:40],
        })
    # registered people without telemetry (or not yet linked to a host) still belong in the roster
    for person in org_people:
        if person.get("id") in used_person_ids: continue
        if is_manager and person.get("teamId") not in managed: continue
        host = person.get("host")
        people.append({
            "id": person["id"], "host": host,
            "name": person.get("name") or person["id"], "title": person.get("title") or "Colaborador", "accessRole": (accounts.get((person.get("email") or "").lower()) or {}).get("role") or person.get("accessRole"),
            "teamId": person.get("teamId"), "ouId": person.get("ouId") or person.get("teamId"), "scheduleId": person.get("scheduleId"),
            "email": person.get("email"), "licenseType": person.get("licenseType"), "registered": True, "hasTelemetry": False,
            "device": (host or "").replace(".local", "") or "—", "platform": "—",
            "status": "offline", "lastSeen": None,
            "trackedSeconds": 0, "activeSeconds": 0, "idleSeconds": 0, "productiveSeconds": 0, "focusScore": 0,
            "expectedSeconds": round(intervals_duration(schedule_windows(next((s for s in config.get("schedules", []) if s.get("id") == person.get("scheduleId") and s.get("tenantId") == tenant_id), None), start, end)), 3), "scheduledActiveSeconds": 0, "scheduledProductiveSeconds": 0, "scheduleAdherence": 0, "productivityIndex": 0, "outsideScheduleSeconds": 0, "scheduleName": next((s.get("name") for s in config.get("schedules", []) if s.get("id") == person.get("scheduleId")), None),
            "presses": 0, "clicks": 0, "inputSeconds": 0, "webSeconds": 0, "appSeconds": 0, "topApps": [], "topUrls": [], "recentActivity": [],
        })
    if scope == "self" or current_viewer["role"] in ("member", "employee"):
        me = (current_viewer.get("email") or "").lower()
        people = [p for p in people if (p.get("email") or "").lower() == me]
    people.sort(key=lambda person: (person["status"] != "online", person["name"].lower()))
    tenant = next((t for t in config["tenants"] if t["id"] == tenant_id), {"id": tenant_id, "name": tenant_id})
    return {
        "tenant": tenant, "scope": scope, "generatedAt": datetime.now(timezone.utc).isoformat(), "period": period,
        "range": {"start": start.isoformat(), "end": end.isoformat()}, "people": people,
        "schedules": [s for s in config["schedules"] if s["tenantId"] == tenant_id],
        "teams": [t for t in config.get("teams", []) if t.get("tenantId") == tenant_id],
        "counts": {"people": len(people), "online": sum(1 for p in people if p["status"] == "online"), "withDevice": sum(1 for p in people if p.get("host")), "withoutDevice": sum(1 for p in people if not p.get("host")), "withAccess": sum(1 for p in people if p.get("accessRole"))},
    }


def analytics_dashboard(params: dict, current_viewer: dict) -> dict:
    """Productivity breakdown by person and organizational unit from telemetry."""
    directory = people_directory(params, current_viewer)
    config = load_config()
    team_names = {t.get("id"): t.get("name", "Sem OU") for t in directory.get("teams", [])}
    groups: dict[str, dict] = {}
    for person in directory["people"]:
        team_id = person.get("teamId") or "unassigned"
        row = groups.setdefault(team_id, {"id": team_id, "name": team_names.get(team_id, "Sem OU"), "people": 0, "trackedSeconds": 0.0, "activeSeconds": 0.0, "productiveSeconds": 0.0, "webSeconds": 0.0, "inputSeconds": 0.0, "presses": 0, "clicks": 0})
        row["people"] += 1
        for key in ("trackedSeconds", "activeSeconds", "productiveSeconds", "webSeconds", "inputSeconds", "presses", "clicks"):
            row[key] += float(person.get(key, 0) or 0)
    teams = []
    for row in groups.values():
        row["focusScore"] = round(row["productiveSeconds"] / row["trackedSeconds"] * 100 if row["trackedSeconds"] else 0.0, 1)
        for key in ("trackedSeconds", "activeSeconds", "productiveSeconds", "webSeconds", "inputSeconds"):
            row[key] = round(row[key], 3)
        row["presses"] = int(row["presses"]); row["clicks"] = int(row["clicks"])
        teams.append(row)
    teams.sort(key=lambda row: (-row["focusScore"], -row["productiveSeconds"], row["name"].lower()))
    people = sorted(directory["people"], key=lambda person: (-person.get("productiveSeconds", 0), person["name"].lower()))
    return {"tenant": directory["tenant"], "period": directory["period"], "range": directory["range"], "generatedAt": directory["generatedAt"], "people": people, "teams": teams}


def tenant_admin_emails(config: dict, tenant_id: str) -> list:
    """Active admins of a workspace (recipients for alert/digest e-mails)."""
    out = []
    for email, account in config.get("accounts", {}).items():
        if account.get("status") == "active" and account.get("role") in ("org_admin", "super_admin") and account.get("tenantId") == tenant_id:
            out.append(email)
    return out


def text_to_email_html(text: str) -> str:
    """Light, safe conversion of the LLM digest text into e-mail paragraphs."""
    import html as _html
    safe = _html.escape(text or "").strip()
    blocks = [b.strip() for b in re.split(r"\n\s*\n", safe) if b.strip()]
    parts = []
    for block in blocks:
        block = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", block).replace("\n", "<br>")
        parts.append(f'<p style="margin:0 0 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.65;color:#4a5270">{block}</p>')
    return "".join(parts) or "<p>—</p>"


def compute_alerts(current_viewer: dict) -> dict:
    """Real alert engine: agent offline during shift, long idle, low adherence.
    Reuses the (RBAC-scoped) people directory for today's telemetry."""
    data = people_directory({"period": ["today"]}, current_viewer)
    config = load_config()
    tenant_id = data["tenant"]["id"]
    schedules = {s["id"]: s for s in config.get("schedules", []) if s.get("tenantId") == tenant_id}
    pol = (config.get("policies") or {}).get("alerts") or {}
    idle_threshold = int(pol.get("idleHours", 2)) * 3600
    offline_minutes = int(pol.get("offlineMinutes", 15))
    now_utc = datetime.now(timezone.utc)
    now_local = now_utc.astimezone(LOCAL_TIMEZONE)
    today = now_local.date().isoformat()
    now_sec = now_local.hour * 3600 + now_local.minute * 60 + now_local.second

    def hm_to_sec(hm: str) -> int:
        try:
            hours, minutes = str(hm).split(":"); return int(hours) * 3600 + int(minutes) * 60
        except (ValueError, AttributeError):
            return 0

    alerts = []

    def add(kind: str, severity: str, person: dict, message: str) -> None:
        alerts.append({
            "id": hashlib.sha1(f"{kind}:{person['id']}:{today}".encode()).hexdigest()[:12],
            "type": kind, "severity": severity, "personId": person["id"], "personName": person["name"],
            "device": person.get("device"), "message": message, "at": now_utc.isoformat(),
        })

    for person in data["people"]:
        sched = schedules.get(person.get("scheduleId")) if person.get("scheduleId") else None
        start = sched["start"] if sched else "09:00"
        end = sched["end"] if sched else "18:00"
        weekdays = sched["weekdays"] if sched else [1, 2, 3, 4, 5]
        in_window = now_local.isoweekday() in weekdays and hm_to_sec(start) <= now_sec <= hm_to_sec(end)
        last = parse_timestamp(person["lastSeen"]) if person.get("lastSeen") else None
        if in_window and person["status"] == "offline":
            mins = int((now_utc - last).total_seconds() / 60) if last else None
            if mins is None or mins >= offline_minutes:
                since = last.astimezone(LOCAL_TIMEZONE).strftime("%H:%M") if last else "hoje"
                add("agent_offline", "critical", person, f"Sem sinal do agente desde {since} (deveria estar ativo agora).")
        if person["idleSeconds"] >= idle_threshold:
            add("long_idle", "warning", person, f"Ocioso por {duration_label(person['idleSeconds'])} no dia.")
        if in_window:
            elapsed = max(0, min(now_sec, hm_to_sec(end)) - hm_to_sec(start))
            if elapsed > 3600 and person["activeSeconds"] < 0.3 * elapsed:
                add("low_adherence", "warning", person, f"Aderência baixa: {duration_label(person['activeSeconds'])} ativos de ~{duration_label(elapsed)} de jornada.")

    order = {"critical": 0, "warning": 1, "info": 2}
    alerts.sort(key=lambda a: (order.get(a["severity"], 3), a["personName"].lower()))
    return {
        "alerts": alerts, "generatedAt": now_utc.isoformat(), "tenant": data["tenant"],
        "counts": {
            "total": len(alerts),
            "critical": sum(1 for a in alerts if a["severity"] == "critical"),
            "warning": sum(1 for a in alerts if a["severity"] == "warning"),
        },
    }


# --- Pre-aggregation: response cache + daily per-person rollups ---
AGGREGATES_FILE = DATA_DIR / "aggregates.json"
CACHE_TTL = int(os.environ.get("TIMEWATCHER_CACHE_TTL", "30") or "0")
_AW_CACHE: dict = {}
_CACHE_LOCK = threading.Lock()
_AGG_LOCK = threading.Lock()


def cached(key: tuple, producer):
    """Short-TTL memoization so repeated dashboard loads don't re-scan AW."""
    if CACHE_TTL <= 0:
        return producer()
    now = time.time()
    with _CACHE_LOCK:
        hit = _AW_CACHE.get(key)
        if hit and now - hit[0] < CACHE_TTL:
            return hit[1]
    value = producer()
    with _CACHE_LOCK:
        _AW_CACHE[key] = (now, value)
        if len(_AW_CACHE) > 256:
            for stale in [k for k, v in _AW_CACHE.items() if now - v[0] > CACHE_TTL]:
                _AW_CACHE.pop(stale, None)
    return value


def load_aggregates() -> dict:
    try:
        return json.loads(AGGREGATES_FILE.read_text("utf-8"))
    except (OSError, ValueError):
        return {}


def save_aggregates(data: dict) -> None:
    tmp = AGGREGATES_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data), "utf-8")
    tmp.replace(AGGREGATES_FILE)


def aggregate_store_day(date_iso: str) -> None:
    """Consolidate one day's per-person metrics into the rollup store."""
    config = load_config()
    with _AGG_LOCK:
        agg = load_aggregates()
    for tenant in config.get("tenants", []):
        tid = tenant["id"]
        viewer = {"role": "super_admin", "tenantId": tid, "email": "system", "name": "system", "username": "system"}
        try:
            data = people_directory({"period": ["custom"], "start": [date_iso], "end": [date_iso], "tenant": [tid]}, viewer)
        except Exception:
            continue
        for person in data["people"]:
            agg.setdefault(tid, {}).setdefault(person["host"], {})[date_iso] = {
                "trackedSeconds": person["trackedSeconds"], "activeSeconds": person["activeSeconds"],
                "idleSeconds": person["idleSeconds"], "productiveSeconds": person["productiveSeconds"],
                "focusScore": person["focusScore"], "presses": person["presses"], "clicks": person["clicks"],
            }
    with _AGG_LOCK:
        save_aggregates(agg)


def rollup_worker() -> None:
    while True:
        try:
            now_local = datetime.now(timezone.utc).astimezone(LOCAL_TIMEZONE)
            for back in range(1, 4):  # catch up the last few days idempotently
                aggregate_store_day((now_local.date() - timedelta(days=back)).isoformat())
        except Exception:
            pass
        time.sleep(6 * 3600)


def platform_trends(current_viewer: dict, days: int) -> dict:
    """Per-day tenant trend from the rollup store (+ today computed live)."""
    days = max(1, min(90, days))
    config = load_config()
    tenant_id = current_viewer["tenantId"]
    agg = load_aggregates().get(tenant_id, {})
    allowed = manager_hosts(config, current_viewer.get("email", ""), tenant_id) if current_viewer["role"] == "manager" else None
    now_local = datetime.now(timezone.utc).astimezone(LOCAL_TIMEZONE)
    today = now_local.date().isoformat()
    series = []
    for offset in range(days - 1, -1, -1):
        day = (now_local.date() - timedelta(days=offset)).isoformat()
        tracked = active = productive = 0.0
        if day == today:
            live = people_directory({"period": ["today"]}, current_viewer)
            for person in live["people"]:
                tracked += person["trackedSeconds"]; active += person["activeSeconds"]; productive += person["productiveSeconds"]
        else:
            for host, by_day in agg.items():
                if allowed is not None and host not in allowed:
                    continue
                metrics = by_day.get(day)
                if metrics:
                    tracked += metrics["trackedSeconds"]; active += metrics["activeSeconds"]; productive += metrics["productiveSeconds"]
        series.append({"date": day, "trackedSeconds": round(tracked, 1), "activeSeconds": round(active, 1), "productiveSeconds": round(productive, 1), "focusScore": round(productive / tracked * 100 if tracked else 0)})
    return {"days": days, "series": series, "source": "rollup+live"}


INTELLIGENCE_SUGGESTIONS = [
    "Onde o time concentrou mais tempo esta semana?",
    "Quais padrões de ociosidade merecem atenção?",
    "Quem está fora da jornada planejada?",
    "O que mudou em relação aos últimos 7 dias?",
    "Quais são as recomendações prioritárias?",
]


def _intent_of(question: str) -> str:
    q = (question or "").lower()
    if any(w in q for w in ("recomend", "prioriz", "priorit", "sugest", "o que fazer", "acoes", "ações", "plano de acao")): return "recommendations"
    if any(w in q for w in ("ocios", "idle", "parad", "afk")): return "idle"
    if any(w in q for w in ("jornada", "fora", "offline", "aderenc", "aderĂȘnc", "escala", "atras")): return "off_schedule"
    if any(w in q for w in ("mudou", "semana anterior", "7 dias", "compar", "tend", "cresc", "cai")): return "week_change"
    if any(w in q for w in ("tempo", "concentr", "onde", "app", "aplicativ", "site", "url", "foco")): return "top_time"
    return "summary"


def intelligence_snapshot(current_viewer: dict) -> dict:
    """Compact, aggregate-only snapshot fed to the LLM (never raw content).
    Only people with an Intelligence license enter the analysis."""
    everyone = people_directory({"period": ["7d"]}, current_viewer)["people"]
    ipeople = [p for p in everyone if p.get("licenseType") == "intelligence"]
    tracked = sum(p["trackedSeconds"] for p in ipeople); active = sum(p["activeSeconds"] for p in ipeople)
    productive = sum(p["productiveSeconds"] for p in ipeople); idle = sum(p["idleSeconds"] for p in ipeople)
    app_seconds: dict = defaultdict(float); site_seconds: dict = defaultdict(float)
    for person in ipeople:
        for app in person.get("topApps", []): app_seconds[app["name"]] += app["seconds"]
        for site in (person.get("topUrls") or []): site_seconds[site["domain"]] += site["seconds"]
    top_apps = sorted(app_seconds.items(), key=lambda item: item[1], reverse=True)[:6]
    top_sites = sorted(site_seconds.items(), key=lambda item: item[1], reverse=True)[:4]
    idle_top = sorted([p for p in ipeople if p["idleSeconds"] > 0], key=lambda p: p["idleSeconds"], reverse=True)[:5]
    ids = {p["id"] for p in ipeople}
    alerts = [a for a in compute_alerts(current_viewer)["alerts"] if a["personId"] in ids]
    series = platform_trends(current_viewer, 14)["series"]
    this_week = sum(x["trackedSeconds"] for x in series[-7:]); prev_week = sum(x["trackedSeconds"] for x in series[-14:-7])
    return {
        "periodo": "ultimos 7 dias", "pessoas_analisadas": len(ipeople),
        "resumo": {"monitorado": duration_label(tracked), "ativo": duration_label(active), "ocioso": duration_label(idle),
                   "foco_pct": round(productive / tracked * 100 if tracked else 0)},
        "apps_mais_usados": [{"app": app, "tempo": duration_label(seconds)} for app, seconds in top_apps],
        "sites_mais_usados": [{"site": domain, "tempo": duration_label(seconds)} for domain, seconds in top_sites],
        "maior_ociosidade": [{"pessoa": p["name"], "ocioso": duration_label(p["idleSeconds"]), "foco_pct": p["focusScore"]} for p in idle_top],
        "alertas": [{"tipo": a["type"], "pessoa": a["personName"], "mensagem": a["message"]} for a in alerts[:8]],
        "variacao_semana": {"esta_semana": duration_label(this_week), "semana_anterior": duration_label(prev_week)},
    }


def llm_answer(question: str, snapshot: dict) -> str | None:
    """Natural-language answer via Amazon Bedrock (Anthropic). Returns None on any
    failure so the caller falls back to the deterministic engine."""
    if os.environ.get("TIMEWATCHER_LLM") != "bedrock":
        return None
    try:
        import boto3
        model = os.environ.get("TIMEWATCHER_BEDROCK_MODEL", "anthropic.claude-3-haiku-20240307-v1:0")
        client = boto3.client("bedrock-runtime", region_name=os.environ.get("AWS_DEFAULT_REGION", "us-east-1"))
        prompt = (
            "Voce e o analista do TimeWatcher, uma plataforma de gestao de produtividade. "
            "Responda em portugues do Brasil, de forma objetiva e executiva (2 a 4 frases), a pergunta do gestor. "
            "Use SOMENTE os dados do snapshot abaixo; nunca invente numeros, nomes ou fatos. Se o dado nao existir, diga que nao ha base. "
            "Nao ha conteudo digitado nos dados (privacidade/LGPD); nao mencione isso a menos que perguntem.\n\n"
            f"Pergunta: {question or 'Faca um resumo executivo da operacao.'}\n\n"
            f"Snapshot (JSON):\n{json.dumps(snapshot, ensure_ascii=False)}"
        )
        body = {"anthropic_version": "bedrock-2023-05-31", "max_tokens": 400, "temperature": 0.2,
                "messages": [{"role": "user", "content": prompt}]}
        response = client.invoke_model(modelId=model, body=json.dumps(body))
        payload = json.loads(response["body"].read())
        text = "".join(part.get("text", "") for part in payload.get("content", [])).strip()
        return text or None
    except Exception:
        return None


def intelligence_answer(current_viewer: dict, question: str) -> dict:
    """Data-grounded synthesis over the tenant's real metrics (LLM-ready).
    Gated behind the Intelligence plan."""
    config = load_config()
    tenant_id = current_viewer["tenantId"]
    if current_viewer.get("role") in ("member", "employee"):
        raise PermissionError("plan_required")
    if not billing_summary(config, tenant_id)["features"]["intelligence"]:
        raise PermissionError("plan_required")
    snap = intelligence_snapshot(current_viewer)
    intent = _intent_of(question)
    resumo = snap["resumo"]; n = snap["pessoas_analisadas"]
    if n == 0:
        answer = "Nenhuma pessoa com licença Intelligence tem dados no período — atribua a licença em Pessoas para incluí-la na análise."
    elif intent == "top_time":
        apps = snap["apps_mais_usados"]; sites = snap["sites_mais_usados"]
        answer = (f"Entre {n} pessoa(s) na análise, mais tempo em: " + ", ".join(f"{a['app']} ({a['tempo']})" for a in apps[:3]) + ".") if apps else "Sem apps registrados no período."
        if sites: answer += " Sites: " + ", ".join(f"{s['site']} ({s['tempo']})" for s in sites) + "."
        answer += f" Foco médio {resumo['foco_pct']}%."
    elif intent == "idle":
        top = snap["maior_ociosidade"]
        answer = ("Maiores ociosidades: " + "; ".join(f"{p['pessoa']} ({p['ocioso']}, {p['foco_pct']}% foco)" for p in top) + ".") if top else "Sem ociosidade relevante no período."
    elif intent == "off_schedule":
        al = snap["alertas"]
        answer = (f"{len(al)} fora do previsto: " + "; ".join(f"{a['pessoa']} — {a['mensagem']}" for a in al[:5])) if al else "Ninguém fora da jornada no momento."
    elif intent == "week_change":
        vs = snap["variacao_semana"]
        answer = f"Tempo monitorado (organização): {vs['esta_semana']} nesta semana vs {vs['semana_anterior']} na anterior. Foco médio das pessoas na IA: {resumo['foco_pct']}%."
    elif intent == "recommendations":
        recs = []
        if snap["alertas"]: recs.append("Tratar alertas de " + ", ".join(a["pessoa"] for a in snap["alertas"][:3]) + ".")
        if snap["maior_ociosidade"]: recs.append("Revisar ociosidade de " + ", ".join(p["pessoa"] for p in snap["maior_ociosidade"][:3]) + " — confirmar se são pausas legítimas.")
        answer = ("Recomendações prioritárias: " + " ".join(f"{i+1}) {r}" for i, r in enumerate(recs))) if recs else "Operação saudável — sem ações prioritárias no momento."
    else:
        answer = (f"Últimos 7 dias ({n} pessoa(s) na IA): {resumo['monitorado']} monitorados, {resumo['ativo']} ativos, "
                  f"{resumo['foco_pct']}% de foco. {len(snap['alertas'])} alerta(s).")
    result = {"question": question, "intent": intent, "answer": answer, "data": snap, "suggestions": INTELLIGENCE_SUGGESTIONS, "generatedAt": datetime.now(timezone.utc).isoformat(), "source": "rules"}
    if os.environ.get("TIMEWATCHER_LLM") == "bedrock":
        try:
            generated = llm_answer(question, snap)
            if generated:
                result["answer"] = generated; result["source"] = "llm"
        except Exception:
            pass
    return result


DIGESTS_FILE = DATA_DIR / "digests.json"
_DIGEST_LOCK = threading.Lock()


def load_digests() -> dict:
    try:
        return json.loads(DIGESTS_FILE.read_text("utf-8"))
    except (OSError, ValueError):
        return {}


def save_digests(data: dict) -> None:
    tmp = DIGESTS_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False), "utf-8")
    tmp.replace(DIGESTS_FILE)


def generate_and_store_digests() -> None:
    """Auto daily/weekly executive summaries per Intelligence tenant."""
    config = load_config()
    now_local = datetime.now(timezone.utc).astimezone(LOCAL_TIMEZONE)
    with _DIGEST_LOCK:
        store = load_digests()
    for tenant in config.get("tenants", []):
        tid = tenant["id"]
        if not billing_summary(config, tid)["features"]["intelligence"]:
            continue
        viewer = {"role": "super_admin", "tenantId": tid, "email": "system", "name": "system", "username": "system"}
        jobs = [
            ("daily", now_local.date().isoformat(), "Faça um resumo executivo do DIA de hoje da operação, com destaques e 2 a 3 recomendações objetivas."),
            ("weekly", now_local.strftime("%Y-S%V"), "Faça um resumo executivo da SEMANA da operação, com tendência, destaques e 2 a 3 recomendações."),
        ]
        fresh_keys = []
        for kind, period_key, question in jobs:
            try:
                text = intelligence_answer(viewer, question)["answer"]
            except Exception:
                continue
            key = f"{kind}:{period_key}"
            prev = store.get(tid, {}).get(key) or {}
            store.setdefault(tid, {})[key] = {"kind": kind, "period": period_key, "text": text, "generatedAt": datetime.now(timezone.utc).isoformat(), "emailedAt": prev.get("emailedAt")}
            fresh_keys.append(key)
        # despacho por e-mail: 1x por chave de periodo (nao reenvia; carrega emailedAt)
        if mailer.enabled():
            recipients = tenant_admin_emails(config, tid)
            for key in fresh_keys:
                entry = store[tid][key]
                if entry.get("emailedAt") or not recipients:
                    continue
                title = "Resumo diário" if entry["kind"] == "daily" else "Resumo semanal"
                summary_html = text_to_email_html(entry["text"])
                sent_any = False
                for recipient in recipients:
                    if mailer.send_digest(recipient, tenant.get("name", tid), title, summary_html, PUBLIC_URL).get("ok"):
                        sent_any = True
                if sent_any:
                    entry["emailedAt"] = datetime.now(timezone.utc).isoformat()
        entries = store.get(tid, {})
        if len(entries) > 40:
            for old in sorted(entries, key=lambda k: entries[k]["generatedAt"])[:-40]:
                entries.pop(old, None)
    with _DIGEST_LOCK:
        save_digests(store)


def digest_worker() -> None:
    while True:
        try:
            generate_and_store_digests()
        except Exception:
            pass
        time.sleep(6 * 3600)


ALERT_MAIL_FILE = DATA_DIR / "alert_mail_state.json"
_ALERT_MAIL_LOCK = threading.Lock()


def _load_alert_mail_state() -> dict:
    try:
        return json.loads(ALERT_MAIL_FILE.read_text())
    except (OSError, json.JSONDecodeError):
        return {}


def _save_alert_mail_state(state: dict) -> None:
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        ALERT_MAIL_FILE.write_text(json.dumps(state, ensure_ascii=False))
    except OSError:
        pass


def dispatch_alert_emails() -> None:
    """E-mail NEW critical alerts to each workspace's admins (dedup by id/day)."""
    config = load_config()
    policy_on = ((config.get("policies") or {}).get("alerts") or {}).get("email", True)
    if not policy_on:
        return
    today = datetime.now(timezone.utc).astimezone(LOCAL_TIMEZONE).date().isoformat()
    with _ALERT_MAIL_LOCK:
        state = _load_alert_mail_state()
    for tenant in config.get("tenants", []):
        tid = tenant["id"]
        viewer = {"role": "super_admin", "tenantId": tid, "email": "system", "name": "system", "username": "system"}
        try:
            result = compute_alerts(viewer)
        except Exception:
            continue
        critical = [a for a in result["alerts"] if a["severity"] == "critical"]
        already = set(state.get(tid, {}).get(today, []))
        fresh = [a for a in critical if a["id"] not in already]
        if not fresh:
            continue
        recipients = tenant_admin_emails(config, tid)
        if not recipients:
            continue
        payload = [{"severity": a["severity"], "title": a["personName"], "detail": a["message"]} for a in fresh]
        sent_any = False
        for recipient in recipients:
            if mailer.send_alerts(recipient, tenant.get("name", tid), payload, PUBLIC_URL).get("ok"):
                sent_any = True
        if sent_any:
            day_ids = list(already) + [a["id"] for a in fresh]
            state[tid] = {today: day_ids}  # mantem so o dia atual (poda dias antigos)
    with _ALERT_MAIL_LOCK:
        _save_alert_mail_state(state)


def alert_email_worker() -> None:
    interval = int(os.environ.get("TIMEWATCHER_ALERT_EMAIL_MINUTES", "60") or "0")
    if interval <= 0:
        return
    while True:
        try:
            if mailer.enabled():
                dispatch_alert_emails()
        except Exception:
            pass
        time.sleep(interval * 60)


class Handler(BaseHTTPRequestHandler):
    server_version = "TimeWatcher/2"

    def send_json(self, status: int, payload: object) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status); self.send_header("Content-Type", "application/json; charset=utf-8"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0")); return json.loads(self.rfile.read(length)) if 0 < length <= 1024 * 1024 else {}

    def authorized_admin(self, current: dict) -> bool:
        return current["role"] in ("super_admin", "org_admin")

    def scim_tenant(self) -> str | None:
        header = self.headers.get("Authorization", "")
        if not header.startswith("Bearer "): return None
        digest = hashlib.sha256(header[7:].encode()).hexdigest()
        for item in load_config().get("scimTokens", []):
            if hmac.compare_digest(item.get("tokenHash", ""), digest) and item.get("enabled", True): return item.get("tenantId")
        return None

    def scim_user(self, tenant_id: str, payload: dict, external_id: str = "") -> dict:
        email = str(payload.get("userName") or payload.get("emails", [{}])[0].get("value", "")).strip().lower()
        if "@" not in email: raise ValueError("userName_email_required")
        name_data = payload.get("name") if isinstance(payload.get("name"), dict) else {}
        name = str(payload.get("displayName") or " ".join(filter(None, [name_data.get("givenName"), name_data.get("familyName")])) or email.split("@", 1)[0])[:120]
        active = bool(payload.get("active", True))
        config = load_config(); person = next((p for p in config.get("people", []) if p.get("tenantId") == tenant_id and (p.get("email") or "").lower() == email), None)
        if not person:
            person = {"id": str(uuid.uuid4()), "tenantId": tenant_id, "email": email}; config.setdefault("people", []).append(person)
        person.update({"name": name, "title": str(payload.get("title", person.get("title", "Colaborador")))[:120], "scimExternalId": str(payload.get("externalId") or external_id or person.get("scimExternalId", ""))[:160], "scimActive": active})
        account = config.setdefault("accounts", {}).get(email)
        if account: account["name"] = name; account["status"] = "active" if active else "disabled"
        save_config(config); audit("scim.user.upsert", "scim", {"tenant": tenant_id, "email": email, "active": active})
        return {"schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"], "id": person["id"], "externalId": person.get("scimExternalId"), "userName": email, "displayName": name, "active": active, "emails": [{"value": email, "primary": True}]}

    def handle_scim(self, method: str, parsed, payload: dict | None = None) -> None:
        tenant_id = self.scim_tenant()
        if not tenant_id: return self.send_json(401, {"schemas": ["urn:ietf:params:scim:api:messages:2.0:Error"], "status": "401", "detail": "invalid_token"})
        path = parsed.path.rstrip("/")
        if path.endswith("/ServiceProviderConfig"):
            return self.send_json(200, {"schemas": ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"], "patch": {"supported": True}, "bulk": {"supported": False}, "filter": {"supported": True}, "changePassword": {"supported": False}, "sort": {"supported": False}, "etag": {"supported": False}})
        if path.endswith("/Users") and method == "GET":
            people = [p for p in load_config().get("people", []) if p.get("tenantId") == tenant_id and p.get("email")]
            resources = [{"schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"], "id": p["id"], "externalId": p.get("scimExternalId"), "userName": p["email"], "displayName": p.get("name", ""), "active": p.get("scimActive", True), "emails": [{"value": p["email"], "primary": True}]} for p in people]
            return self.send_json(200, {"schemas": ["urn:ietf:params:scim:api:messages:2.0:ListResponse"], "totalResults": len(resources), "Resources": resources})
        if path.endswith("/Users") and method == "POST":
            try: return self.send_json(201, self.scim_user(tenant_id, payload or {}))
            except ValueError as error: return self.send_json(400, {"detail": str(error)})
        if "/Users/" in path and method in ("PUT", "PATCH"):
            external_id = path.rsplit("/", 1)[-1]
            body = payload or {}
            if method == "PATCH":
                current = next((p for p in load_config().get("people", []) if p.get("tenantId") == tenant_id and (p.get("id") == external_id or p.get("scimExternalId") == external_id)), None)
                body = {"userName": (current or {}).get("email", ""), "displayName": (current or {}).get("name", ""), "active": (current or {}).get("scimActive", True), "externalId": external_id}
                for operation in (payload or {}).get("Operations", []):
                    field = str(operation.get("path", "")); value = operation.get("value")
                    if field == "active": body["active"] = value
                    elif field in ("displayName", "userName"): body[field] = value
            try: return self.send_json(200, self.scim_user(tenant_id, body, external_id))
            except ValueError as error: return self.send_json(400, {"detail": str(error)})
        return self.send_json(404, {"detail": "not_found"})

    def do_GET(self) -> None:
        parsed = urllib.parse.urlsplit(self.path); params = urllib.parse.parse_qs(parsed.query); current = viewer(self.headers)
        if parsed.path.startswith("/scim/v2/"): return self.handle_scim("GET", parsed)
        if parsed.path == "/health": return self.send_json(200, {"status": "ok", "version": 3})
        if parsed.path == "/auth/invite": return self.invite_info(params)
        if parsed.path == "/auth/reset-info": return self.reset_info(params)
        if parsed.path == "/auth/me":
            return self.send_json(200, current) if current else self.send_json(401, {"error": "unauthenticated"})
        if parsed.path == "/v1/agent-update":
            supplied = self.headers.get("Authorization", "")
            tenant_id = ingest_tenant(supplied[7:]) if supplied.startswith("Bearer ") else None
            if not tenant_id: return self.send_json(401, {"error": "unauthorized"})
            hostname = canonical_host(str(params.get("host", [""])[0])[:200])
            platform_name = agent_platform(params.get("platform", [""])[0])
            current_version = str(params.get("version", [""])[0])[:80]
            if not hostname or platform_name not in ("macos", "windows") or not current_version:
                return self.send_json(400, {"error": "host_platform_version_required"})
            with _CONFIG_LOCK:
                config = load_config()
                if host_removed(tenant_id, hostname): return self.send_json(410, {"error": "device_removed"})
                result = agent_update_manifest(config, tenant_id, hostname, platform_name, current_version)
                save_config(config)
            return self.send_json(200, result)
        if parsed.path.startswith("/dashboard/") and not current: return self.send_json(401, {"error": "unauthenticated"})
        if current and current["role"] in ("member", "employee") and (parsed.path.startswith("/dashboard/screenshots") or parsed.path in ("/dashboard/teams", "/dashboard/alerts", "/dashboard/billing", "/dashboard/policies", "/dashboard/audit", "/dashboard/digests", "/dashboard/trends", "/dashboard/intelligence", "/dashboard/invites")):
            return self.send_json(403, {"error": "forbidden"})
        if parsed.path == "/dashboard/invites":
            if not self.authorized_admin(current): return self.send_json(403, {"error": "forbidden"})
            return self.list_invites(current)
        if parsed.path == "/dashboard/schedules":
            config = load_config(); tid = params.get("tenant", [current["tenantId"]])[0] if current["role"] == "super_admin" else current["tenantId"]
            return self.send_json(200, {"schedules": [s for s in config.get("schedules", []) if s.get("tenantId") == tid], "holidays": sorted({h for s in config.get("schedules", []) if s.get("tenantId") == tid for h in (s.get("holidays") or [])})})
        if parsed.path == "/dashboard/report-schedules":
            config = load_config(); tid = params.get("tenant", [current["tenantId"]])[0] if current["role"] == "super_admin" else current["tenantId"]
            if current["role"] not in ("super_admin", "org_admin"): return self.send_json(403, {"error": "forbidden"})
            return self.send_json(200, {"schedules": [s for s in config.get("reportSchedules", []) if s.get("tenantId") == tid]})
        if parsed.path == "/dashboard/monthly-closing":
            if current["role"] not in ("super_admin", "org_admin"): return self.send_json(403, {"error": "forbidden"})
            tid = params.get("tenant", [current["tenantId"]])[0] if current["role"] == "super_admin" else current["tenantId"]
            month = params.get("month", [datetime.now(LOCAL_TIMEZONE).strftime("%Y-%m")])[0]
            config = load_config(); closed = next((c for c in config.get("monthlyClosings", []) if c.get("tenantId") == tid and c.get("month") == month), None)
            try: preview = monthly_closing_preview(config, current, tid, month)
            except ValueError: return self.send_json(400, {"error": "invalid_month"})
            return self.send_json(200, {"preview": preview, "closing": closed})
        if parsed.path == "/dashboard/onboarding":
            if current["role"] not in ("super_admin", "org_admin"): return self.send_json(403, {"error": "forbidden"})
            config = load_config(); tid = params.get("tenant", [current["tenantId"]])[0] if current["role"] == "super_admin" else current["tenantId"]
            state = config.setdefault("onboarding", {}).get(tid, {})
            people = [p for p in config.get("people", []) if p.get("tenantId") == tid]
            return self.send_json(200, {"tenantId": tid, "steps": {"company": True, "schedule": any(s.get("tenantId") == tid for s in config.get("schedules", [])), "users": bool(people), "installer": any(e.get("tenantId") == tid and parse_timestamp(e.get("expiresAt")) > datetime.now(timezone.utc) for e in config.get("enrollments", [])), "device": any(p.get("tenantId") == tid and p.get("host") for p in people)}, "state": state})
        if parsed.path == "/dashboard/agent-fleet":
            if current["role"] not in ("super_admin", "org_admin"): return self.send_json(403, {"error": "forbidden"})
            config = load_config(); tid = params.get("tenant", [current["tenantId"]])[0] if current["role"] == "super_admin" else current["tenantId"]
            return self.send_json(200, agent_fleet_summary(config, tid))
        if parsed.path == "/dashboard/journey-adjustments":
            config = load_config(); tid = params.get("tenant", [current["tenantId"]])[0] if current["role"] == "super_admin" else current["tenantId"]
            items = [x for x in config.get("journeyAdjustments", []) if x.get("tenantId") == tid]
            if current["role"] == "manager":
                allowed = managed_team_ids(config, current.get("email", ""), tid)
                people = {p.get("id"): p for p in config.get("people", [])}
                items = [x for x in items if people.get(x.get("personId"), {}).get("teamId") in allowed]
            return self.send_json(200, {"adjustments": sorted(items, key=lambda x: x.get("createdAt", ""), reverse=True)[:200]})
        if parsed.path == "/dashboard/operations":
            if current["role"] not in ("super_admin", "org_admin", "manager"): return self.send_json(403, {"error": "forbidden"})
            config = load_config(); tid = current["tenantId"]
            buckets = aw_get("/api/0/buckets/")
            tenant_buckets = [b for b in buckets.values() if b.get("hostname")]
            recent = []
            try:
                for line in AUDIT_FILE.read_text(encoding="utf-8").splitlines()[-100:]: recent.append(json.loads(line))
            except (OSError, json.JSONDecodeError): pass
            return self.send_json(200, {"generatedAt": datetime.now(timezone.utc).isoformat(), "ingest": {"buckets": len(tenant_buckets), "hosts": len({b.get('hostname') for b in tenant_buckets}), "lastEvent": max((b.get('last_updated') or b.get('created') or '' for b in tenant_buckets), default=None)}, "alerts": compute_alerts(current), "audit": list(reversed(recent[-50:])), "services": {"ingest": "online", "activityStore": "online", "dashboard": "online"}, "readiness": readiness_snapshot(config, tid)})
        if parsed.path == "/dashboard/audit":
            if current["role"] != "super_admin": return self.send_json(403, {"error": "forbidden"})
            return self.list_audit()
        if parsed.path == "/dashboard/data":
            key = ("data", current["role"], current["email"], current["tenantId"], str(params.get("tenant")), str(params.get("scope")), str(params.get("period")), str(params.get("start")), str(params.get("end")))
            force_refresh = params.get("refresh", ["0"])[0] == "1"
            try: return self.send_json(200, dashboard_data(params, current) if force_refresh else cached(key, lambda: dashboard_data(params, current)))
            except Exception as error: return self.send_json(502, {"error": "dashboard_unavailable", "detail": str(error)[:240]})
        if parsed.path == "/dashboard/people":
            key = ("people", current["role"], current["email"], current["tenantId"], str(params.get("tenant")), str(params.get("scope")), str(params.get("period")), str(params.get("start")), str(params.get("end")))
            try: return self.send_json(200, cached(key, lambda: people_directory(params, current)))
            except Exception as error: return self.send_json(502, {"error": "people_unavailable", "detail": str(error)[:240]})
        if parsed.path == "/dashboard/analytics":
            key = ("analytics", current["role"], current["email"], current["tenantId"], str(params.get("tenant")), str(params.get("scope")), str(params.get("period")), str(params.get("start")), str(params.get("end")))
            try: return self.send_json(200, cached(key, lambda: analytics_dashboard(params, current)))
            except Exception as error: return self.send_json(502, {"error": "analytics_unavailable", "detail": str(error)[:240]})
        if parsed.path == "/dashboard/teams":
            return self.list_teams(current, params)
        if parsed.path == "/dashboard/policies":
            return self.get_policies(current, params)
        if parsed.path == "/dashboard/alerts":
            key = ("alerts", current["role"], current["email"], current["tenantId"])
            try: return self.send_json(200, cached(key, lambda: compute_alerts(current)))
            except Exception as error: return self.send_json(502, {"error": "alerts_unavailable", "detail": str(error)[:240]})
        if parsed.path == "/dashboard/trends":
            raw = params.get("days", ["14"])[0]
            days = int(raw) if str(raw).isdigit() else 14
            key = ("trends", current["role"], current["email"], current["tenantId"], days)
            try: return self.send_json(200, cached(key, lambda: platform_trends(current, days)))
            except Exception as error: return self.send_json(502, {"error": "trends_unavailable", "detail": str(error)[:240]})
        if parsed.path == "/dashboard/intelligence":
            question = params.get("q", [""])[0]
            key = ("intel", current["role"], current["email"], current["tenantId"], question)
            try: return self.send_json(200, cached(key, lambda: intelligence_answer(current, question)))
            except PermissionError: return self.send_json(403, {"error": "plan_required"})
            except Exception as error: return self.send_json(502, {"error": "intelligence_unavailable", "detail": str(error)[:240]})
        if parsed.path == "/dashboard/digests":
            entries = sorted(load_digests().get(current["tenantId"], {}).values(), key=lambda e: e["generatedAt"], reverse=True)
            return self.send_json(200, {"digests": entries[:12], "intelligence": billing_summary(load_config(), current["tenantId"])["features"]["intelligence"]})
        if parsed.path == "/dashboard/billing":
            config = load_config(); is_super = current["role"] == "super_admin"
            tenant_id = params.get("tenant", [current["tenantId"]])[0] if is_super else current["tenantId"]
            return self.send_json(200, {**billing_summary(config, tenant_id), "pricingEditable": is_super, "poolEditable": is_super, "tenant": next((t for t in config["tenants"] if t["id"] == tenant_id), {"id": tenant_id, "name": tenant_id})})
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
        if parsed.path.startswith("/dashboard/screenshots/"): return self.serve_screenshot(current, parsed.path.rsplit("/", 1)[-1])
        if parsed.path == "/dashboard/avatar": return self.serve_avatar(current)
        return self.send_json(404, {"error": "not_found"})

    def do_POST(self) -> None:
        parsed = urllib.parse.urlsplit(self.path); current = viewer(self.headers)
        if parsed.path == "/internal/agent-release":
            supplied = self.headers.get("Authorization", "")
            if not supplied.startswith("Bearer ") or not hmac.compare_digest(supplied[7:], TOKEN): return self.send_json(401, {"error": "unauthorized"})
            try: payload = self.read_json()
            except Exception: return self.send_json(400, {"error": "invalid_json"})
            platform_name = agent_platform(payload.get("platform")); version = str(payload.get("version", ""))[:80]; url = str(payload.get("url", ""))[:1000]; sha = str(payload.get("sha256", "")).lower()
            if platform_name not in ("macos", "windows") or not version or not url.startswith("https://") or not re.fullmatch(r"[a-f0-9]{64}", sha): return self.send_json(400, {"error": "invalid_release"})
            with _CONFIG_LOCK:
                config = load_config(); release = {"version": version, "url": url, "sha256": sha, "publishedAt": datetime.now(timezone.utc).isoformat(), "publishedBy": "deployment"}; config.setdefault("agentReleases", {})[platform_name] = release; save_config(config)
            audit("agent.release.publish", "deployment", {"platform": platform_name, "version": version}); return self.send_json(201, release)
        if parsed.path.startswith("/scim/v2/"):
            try: payload = self.read_json()
            except Exception: return self.send_json(400, {"detail": "invalid_json"})
            return self.handle_scim("POST", parsed, payload)
        if parsed.path == "/auth/login": return self.do_login()
        if parsed.path == "/auth/logout": return self.do_logout()
        if parsed.path == "/auth/accept-invite": return self.do_accept_invite()
        if parsed.path == "/auth/forgot-password": return self.do_forgot_password()
        if parsed.path == "/auth/reset-password": return self.do_reset_password()
        if parsed.path == "/dashboard/avatar":
            if not current: return self.send_json(401, {"error": "unauthenticated"})
            return self.receive_avatar(current)
        if parsed.path == "/dashboard/me/onboarding-complete":
            if not current: return self.send_json(401, {"error": "unauthenticated"})
            with _CONFIG_LOCK:
                config = load_config(); account = config.get("accounts", {}).get(current["email"])
                if not account: return self.send_json(404, {"error": "account_not_found"})
                account["onboardingCompletedAt"] = datetime.now(timezone.utc).isoformat(); save_config(config)
            audit("onboarding.user.complete", current["email"], {"tenantId": current["tenantId"]})
            return self.send_json(200, {"ok": True})
        if parsed.path == "/dashboard/me/link-device":
            if not current: return self.send_json(401, {"error": "unauthenticated"})
            try: payload = self.read_json()
            except Exception: return self.send_json(400, {"error": "invalid_json"})
            host = str(payload.get("host", "")).strip()[:200]
            if not host: return self.send_json(400, {"error": "host_required"})
            with _CONFIG_LOCK:
                config = load_config(); tenant_id = current["tenantId"]
                buckets = aw_get("/api/0/buckets/")
                buckets = {key: value for key, value in buckets.items() if (key.startswith(f"tw-{tenant_id}_") if tenant_id != "synova" else not key.startswith("tw-") or key.startswith("tw-synova_"))}
                eligible = telemetry_hosts(buckets)
                if current["role"] == "manager": eligible &= manager_hosts(config, current["email"], tenant_id)
                elif current["role"] in ("member", "employee"):
                    existing = member_person(config, current); eligible = {existing.get("host")} if existing and existing.get("host") else set()
                if host not in eligible: return self.send_json(403, {"error": "device_not_available"})
                entry = member_person(config, current)
                owner = next((p for p in config.get("people", []) if p.get("tenantId") == tenant_id and p.get("host") == host and p is not entry), None)
                if owner and owner.get("email") and owner.get("email", "").lower() != current["email"]:
                    return self.send_json(409, {"error": "device_assigned", "person": owner.get("name", "outro colaborador")})
                if entry is None:
                    entry = owner or {"id": re.sub(r"[^a-z0-9-]", "-", current["email"].split("@")[0].lower()).strip("-") or str(uuid.uuid4()), "tenantId": tenant_id}
                    if entry not in config.setdefault("people", []): config["people"].append(entry)
                entry.update({"host": host, "email": current["email"], "name": entry.get("name") or current["name"]})
                config.setdefault("devices", {}).setdefault(f"{tenant_id}:{host}", {})["personId"] = entry["id"]
                save_config(config)
            with _CACHE_LOCK: _AW_CACHE.clear()
            audit("person.self_link_device", current["email"], {"tenantId": current["tenantId"], "host": host})
            return self.send_json(200, {"ok": True, "host": host, "person": entry})
        if parsed.path.startswith("/dashboard/"):
            if not current: return self.send_json(401, {"error": "unauthenticated"})
            if not self.authorized_admin(current): return self.send_json(403, {"error": "forbidden"})
            try: payload = self.read_json()
            except Exception: return self.send_json(400, {"error": "invalid_json"})
            with _CONFIG_LOCK:
                config = load_config()
                if parsed.path == "/dashboard/invites":
                    email = str(payload.get("email", "")).strip().lower(); role = payload.get("role", "member")
                    if role in ("admin", "administrador", "org_admin"): role = "org_admin"
                    elif role in ("manager", "gestor"): role = "manager"
                    else: role = "member"
                    # A tenant administrator can delegate workspace roles, but
                    # never elevate someone to the Synova platform role.
                    if current["role"] != "super_admin" and role == "super_admin":
                        return self.send_json(403, {"error": "super_admin_required"})
                    if "@" not in email or len(email) > 200: return self.send_json(400, {"error": "invalid_email"})
                    if config["accounts"].get(email, {}).get("status") == "active": return self.send_json(409, {"error": "account_exists"})
                    inv_tenant = payload.get("tenantId", current["tenantId"]) if current["role"] == "super_admin" else current["tenantId"]
                    token = secrets.token_urlsafe(32); now = datetime.now(timezone.utc)
                    invite = {"email": email, "role": role, "tenantId": inv_tenant, "teamId": payload.get("teamId"), "scheduleId": payload.get("scheduleId"), "tokenHash": hashlib.sha256(token.encode()).hexdigest(), "createdAt": now.isoformat(), "expiresAt": (now + timedelta(days=7)).isoformat()}
                    config["invites"] = [i for i in config["invites"] if i.get("email") != email] + [invite]; save_config(config)
                    audit("invite.create", current["email"], {"email": email, "role": role, "tenantId": inv_tenant})
                    host = self.headers.get("Host") or urllib.parse.urlsplit(PUBLIC_URL).netloc
                    invite_url = f"https://{host}/?invite={token}"
                    tenant_name = next((t.get("name") for t in config.get("tenants", []) if t.get("id") == inv_tenant), "")
                    sent = mailer.send_invite(email, role, invite_url, tenant_name or "")
                    if sent.get("ok"): audit("invite.email_sent", current["email"], {"email": email})
                    return self.send_json(201, {"email": email, "role": role, "inviteUrl": invite_url, "emailSent": bool(sent.get("ok"))})
                if parsed.path == "/dashboard/schedules":
                    s_tenant = payload.get("tenantId", current["tenantId"]) if current["role"] == "super_admin" else current["tenantId"]
                    schedule = {"id": payload.get("id") or str(uuid.uuid4()), "tenantId": s_tenant, "name": str(payload.get("name", "Jornada"))[:80], "start": str(payload.get("start", "09:00"))[:5], "end": str(payload.get("end", "18:00"))[:5], "breakMinutes": max(0, int(payload.get("breakMinutes", 60))), "weekdays": payload.get("weekdays", [1,2,3,4,5]), "timezone": str(payload.get("timezone", "America/Sao_Paulo")), "holidays": [str(x)[:10] for x in (payload.get("holidays") or [])][:500], "exceptions": payload.get("exceptions") if isinstance(payload.get("exceptions"), dict) else {}, "shifts": payload.get("shifts") if isinstance(payload.get("shifts"), list) else [], "toleranceMinutes": max(0, int(payload.get("toleranceMinutes", 0) or 0)), "bankHours": bool(payload.get("bankHours", False)), "approvalRequired": bool(payload.get("approvalRequired", True))}
                    config["schedules"] = [s for s in config["schedules"] if not (s["id"] == schedule["id"] and s.get("tenantId") == s_tenant)] + [schedule]; save_config(config); audit("schedule.upsert", current["email"], {"id": schedule["id"], "tenantId": s_tenant}); return self.send_json(201, schedule)
                if parsed.path == "/dashboard/report-schedules":
                    r_tenant = payload.get("tenantId", current["tenantId"]) if current["role"] == "super_admin" else current["tenantId"]
                    email = str(payload.get("email", current["email"])).strip().lower()
                    frequency = str(payload.get("frequency", "weekly")).lower()
                    if "@" not in email or frequency not in ("daily", "weekly", "monthly"): return self.send_json(400, {"error": "invalid_schedule"})
                    entry = {"id": str(uuid.uuid4()), "tenantId": r_tenant, "email": email, "frequency": frequency, "period": str(payload.get("period", "7d"))[:20], "enabled": True, "createdAt": datetime.now(timezone.utc).isoformat(), "createdBy": current["email"], "lastSentAt": None, "delivery": "secure_link"}
                    config.setdefault("reportSchedules", []).append(entry); save_config(config); audit("report_schedule.create", current["email"], {"id": entry["id"], "tenantId": r_tenant, "email": email}); return self.send_json(201, entry)
                if parsed.path == "/dashboard/scim/tokens":
                    s_tenant = payload.get("tenantId", current["tenantId"]) if current["role"] == "super_admin" else current["tenantId"]
                    token = secrets.token_urlsafe(32)
                    entry = {"id": str(uuid.uuid4()), "tenantId": s_tenant, "name": str(payload.get("name", "SCIM provisionamento"))[:80], "tokenHash": hashlib.sha256(token.encode()).hexdigest(), "createdAt": datetime.now(timezone.utc).isoformat(), "createdBy": current["email"], "enabled": True}
                    config.setdefault("scimTokens", []).append(entry); save_config(config); audit("scim.token.create", current["email"], {"tenant": s_tenant, "id": entry["id"]}); return self.send_json(201, {"token": token, "endpoint": f"{PUBLIC_URL}/scim/v2", "id": entry["id"], "tenantId": s_tenant})
                if parsed.path == "/dashboard/monthly-closing":
                    c_tenant = payload.get("tenantId", current["tenantId"]) if current["role"] == "super_admin" else current["tenantId"]
                    month = str(payload.get("month", ""))[:7]
                    if payload.get("action") == "reopen":
                        config["monthlyClosings"] = [c for c in config.get("monthlyClosings", []) if not (c.get("tenantId") == c_tenant and c.get("month") == month)]
                        save_config(config); audit("monthly_closing.reopen", current["email"], {"tenantId": c_tenant, "month": month}); return self.send_json(200, {"ok": True, "status": "open"})
                    try: snapshot = monthly_closing_preview(config, current, c_tenant, month)
                    except ValueError: return self.send_json(400, {"error": "invalid_month"})
                    existing = next((c for c in config.get("monthlyClosings", []) if c.get("tenantId") == c_tenant and c.get("month") == month), None)
                    if existing: return self.send_json(200, {"closing": existing, "alreadyClosed": True})
                    closing = {**snapshot, "status": "closed", "closedAt": datetime.now(timezone.utc).isoformat(), "closedBy": current["email"]}
                    config.setdefault("monthlyClosings", []).append(closing); save_config(config); audit("monthly_closing.close", current["email"], {"tenantId": c_tenant, "month": month}); return self.send_json(201, {"closing": closing})
                if parsed.path == "/dashboard/journey-adjustments":
                    person_id = str(payload.get("personId", "")).strip(); day = str(payload.get("date", ""))[:10]
                    person = next((p for p in config.get("people", []) if p.get("id") == person_id), None)
                    if not person or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day): return self.send_json(400, {"error": "person_and_date_required"})
                    if current["role"] != "super_admin" and person.get("tenantId") != current["tenantId"]: return self.send_json(403, {"error": "forbidden"})
                    adjustment = {"id": str(uuid.uuid4()), "tenantId": person["tenantId"], "personId": person_id, "date": day, "reason": str(payload.get("reason", ""))[:500], "exception": payload.get("exception") if isinstance(payload.get("exception"), dict) else {}, "status": "pending", "createdBy": current["email"], "createdAt": datetime.now(timezone.utc).isoformat()}
                    config.setdefault("journeyAdjustments", []).append(adjustment); save_config(config); audit("journey.adjustment.request", current["email"], {"id": adjustment["id"], "personId": person_id}); return self.send_json(201, adjustment)
                if parsed.path == "/dashboard/journey-adjustments/approve":
                    adj = next((x for x in config.get("journeyAdjustments", []) if x.get("id") == payload.get("id")), None)
                    if not adj or adj.get("status") != "pending": return self.send_json(404, {"error": "pending_adjustment_not_found"})
                    person = next((p for p in config.get("people", []) if p.get("id") == adj.get("personId")), None)
                    if not person or (current["role"] != "super_admin" and person.get("tenantId") != current["tenantId"]): return self.send_json(403, {"error": "forbidden"})
                    override = person.setdefault("scheduleOverride", {}); exceptions = override.setdefault("exceptions", {}); exceptions[adj["date"]] = adj.get("exception") or {}
                    adj["status"] = "approved"; adj["approvedBy"] = current["email"]; adj["approvedAt"] = datetime.now(timezone.utc).isoformat(); save_config(config); audit("journey.adjustment.approve", current["email"], {"id": adj["id"], "personId": person["id"]}); return self.send_json(200, adj)
                if parsed.path == "/dashboard/people/schedule":
                    ids = payload.get("personIds", []); schedule_id = payload.get("scheduleId")
                    for person in config["people"]:
                        if person["id"] in ids and (current["role"] == "super_admin" or person["tenantId"] == current["tenantId"]): person["scheduleId"] = schedule_id
                    save_config(config); return self.send_json(200, {"updated": len(ids)})
                if parsed.path == "/dashboard/people":
                    host = str(payload.get("host") or "").strip()
                    ref_id = str(payload.get("id") or "").strip()
                    name = str(payload.get("name") or "").strip()
                    if not (host or ref_id or name): return self.send_json(400, {"error": "name_required"})
                    p_tenant = payload.get("tenantId", current["tenantId"]) if current["role"] == "super_admin" else current["tenantId"]
                    people = config.setdefault("people", [])
                    entry = None
                    if ref_id: entry = next((p for p in people if p.get("tenantId") == p_tenant and p.get("id") == ref_id), None)
                    if entry is None and host: entry = next((p for p in people if p.get("tenantId") == p_tenant and p.get("host") == host), None)
                    if entry is None:
                        seed = ref_id or host or name
                        new_id = re.sub(r"[^a-z0-9-]", "-", seed.lower()).strip("-") or "pessoa"
                        existing = {p.get("id") for p in people if p.get("tenantId") == p_tenant}
                        base, n = new_id, 2
                        while new_id in existing: new_id = f"{base}-{n}"; n += 1
                        entry = {"id": new_id, "tenantId": p_tenant}; people.append(entry)
                    if host: entry["host"] = host
                    for field in ("name", "title", "email"):
                        if payload.get(field) is not None: entry[field] = str(payload[field])[:120]
                    for field in ("teamId", "ouId", "scheduleId"):
                        if field in payload: entry[field] = payload[field] or None
                    if "licenseType" in payload:
                        new_lic = payload["licenseType"] if payload.get("licenseType") in ("essential", "intelligence") else None
                        if new_lic and new_lic != entry.get("licenseType"):
                            bs = billing_summary(config, p_tenant)
                            if bs["used"].get(new_lic, 0) >= bs["pool"].get(new_lic, 0):
                                return self.send_json(409, {"error": "pool_exhausted", "license": new_lic})
                        entry["licenseType"] = new_lic
                    save_config(config); audit("person.update", current["email"], {"id": entry["id"]}); return self.send_json(200, entry)
                if parsed.path == "/dashboard/people/delete":
                    ref_id = str(payload.get("id") or "").strip()
                    before = len(config.get("people", []))
                    config["people"] = [p for p in config.get("people", []) if not (p.get("id") == ref_id and (current["role"] == "super_admin" or p.get("tenantId") == current["tenantId"]))]
                    save_config(config); audit("person.delete", current["email"], {"id": ref_id}); return self.send_json(200, {"deleted": before - len(config.get("people", []))})
                if parsed.path == "/dashboard/teams":
                    name = str(payload.get("name", "")).strip()
                    if not name: return self.send_json(400, {"error": "name_required"})
                    t_tenant = payload.get("tenantId", current["tenantId"]) if current["role"] == "super_admin" else current["tenantId"]
                    tid = re.sub(r"[^a-z0-9-]", "-", str(payload.get("id") or name).lower()).strip("-") or "ou"
                    manager_email = str(payload.get("managerEmail", "")).strip().lower() or None
                    parent_id = str(payload.get("parentId", "")).strip() or None
                    if parent_id:
                        if parent_id == tid or parent_id in descendant_ou_ids(config, t_tenant, {tid}):
                            parent_id = None
                        elif not any(t["id"] == parent_id and t.get("tenantId") == t_tenant for t in config.get("teams", [])):
                            parent_id = None
                    team = {"id": tid, "tenantId": t_tenant, "name": name[:80], "managerEmail": manager_email, "parentId": parent_id}
                    teams = config.setdefault("teams", [])
                    config["teams"] = [t for t in teams if not (t["id"] == tid and t.get("tenantId") == t_tenant)] + [team]
                    save_config(config); audit("team.upsert", current["email"], {"id": tid, "manager": manager_email, "parent": parent_id}); return self.send_json(201, team)
                if parsed.path == "/dashboard/teams/delete":
                    tid = str(payload.get("id", "")).strip()
                    deleted = next((t for t in config.get("teams", []) if t["id"] == tid), None)
                    new_parent = deleted.get("parentId") if deleted else None
                    config["teams"] = [t for t in config.get("teams", []) if not (t["id"] == tid and (current["role"] == "super_admin" or t.get("tenantId") == current["tenantId"]))]
                    for team in config["teams"]:
                        if team.get("parentId") == tid: team["parentId"] = new_parent
                    for person in config.get("people", []):
                        if person.get("teamId") == tid: person["teamId"] = None
                    save_config(config); audit("team.delete", current["email"], {"id": tid}); return self.send_json(200, {"deleted": tid})
                if parsed.path == "/dashboard/users":
                    email = str(payload.get("email", "")).strip().lower()
                    target = config["accounts"].get(email)
                    if not target: return self.send_json(404, {"error": "account_not_found"})
                    if current["role"] != "super_admin" and target.get("tenantId") != current["tenantId"]: return self.send_json(403, {"error": "forbidden"})
                    if target.get("role") == "super_admin" and current["role"] != "super_admin": return self.send_json(403, {"error": "forbidden"})
                    if email == current["email"]: return self.send_json(409, {"error": "cannot_modify_self"})
                    if "role" in payload:
                        new_role = str(payload.get("role", "")).lower()
                        if new_role in ("admin", "administrador", "org_admin"): target["role"] = "org_admin"
                        elif new_role in ("manager", "gestor"): target["role"] = "manager"
                        elif new_role in ("member", "employee", "colaborador", "membro"): target["role"] = "member"
                        elif new_role == "super_admin" and current["role"] == "super_admin": target["role"] = "super_admin"
                    if "status" in payload:
                        target["status"] = "disabled" if str(payload.get("status")).lower() in ("disabled", "inactive", "inativo", "suspenso") else "active"
                    save_config(config); audit("user.update", current["email"], {"email": email, "role": target.get("role"), "status": target.get("status")})
                    return self.send_json(200, {"email": email, "name": target.get("name"), "role": target.get("role"), "status": target.get("status")})
                if parsed.path == "/dashboard/users/delete":
                    email = str(payload.get("email", "")).strip().lower()
                    target = config["accounts"].get(email)
                    if not target: return self.send_json(404, {"error": "account_not_found"})
                    if current["role"] != "super_admin" and target.get("tenantId") != current["tenantId"]: return self.send_json(403, {"error": "forbidden"})
                    if target.get("role") == "super_admin" and current["role"] != "super_admin": return self.send_json(403, {"error": "forbidden"})
                    if email == current["email"]: return self.send_json(409, {"error": "cannot_delete_self"})
                    config["accounts"].pop(email, None)
                    save_config(config); audit("user.delete", current["email"], {"email": email}); return self.send_json(200, {"deleted": email})
                if parsed.path == "/dashboard/invites/resend":
                    email = str(payload.get("email", "")).strip().lower()
                    match = next((i for i in config["invites"] if i.get("email") == email and (current["role"] == "super_admin" or i.get("tenantId") == current["tenantId"])), None)
                    if not match: return self.send_json(404, {"error": "invite_not_found"})
                    token = secrets.token_urlsafe(32); now = datetime.now(timezone.utc)
                    match["tokenHash"] = hashlib.sha256(token.encode()).hexdigest(); match["createdAt"] = now.isoformat(); match["expiresAt"] = (now + timedelta(days=7)).isoformat()
                    save_config(config); audit("invite.resend", current["email"], {"email": email})
                    host = self.headers.get("Host") or urllib.parse.urlsplit(PUBLIC_URL).netloc
                    invite_url = f"https://{host}/?invite={token}"
                    tenant_name = next((t.get("name") for t in config.get("tenants", []) if t.get("id") == match.get("tenantId")), "")
                    sent = mailer.send_invite(email, match["role"], invite_url, tenant_name or "")
                    if sent.get("ok"): audit("invite.email_sent", current["email"], {"email": email})
                    return self.send_json(200, {"email": email, "role": match["role"], "inviteUrl": invite_url, "emailSent": bool(sent.get("ok"))})
                if parsed.path == "/dashboard/invites/revoke":
                    email = str(payload.get("email", "")).strip().lower()
                    before = len(config["invites"])
                    config["invites"] = [i for i in config["invites"] if not (i.get("email") == email and (current["role"] == "super_admin" or i.get("tenantId") == current["tenantId"]))]
                    save_config(config); audit("invite.revoke", current["email"], {"email": email}); return self.send_json(200, {"revoked": before - len(config["invites"])})
                if parsed.path == "/dashboard/policies":
                    p_tenant = payload.get("tenantId", current["tenantId"]) if current["role"] == "super_admin" else current["tenantId"]
                    if isinstance(payload.get("classification"), dict):
                        clean = {}
                        for cat in ("productive", "unproductive", "neutral"):
                            vals = payload["classification"].get(cat) or []
                            clean[cat] = sorted({str(t).strip().lower() for t in vals if str(t).strip()})[:200]
                        config.setdefault("classification", {})[p_tenant] = clean
                    if "retentionDays" in payload and current["role"] == "super_admin":
                        try: config.setdefault("policies", {})["retentionDays"] = max(0, min(3650, int(payload["retentionDays"])))
                        except (TypeError, ValueError): pass
                    save_config(config); audit("policies.update", current["email"], {"tenant": p_tenant})
                    return self.send_json(200, {"retentionDays": retention_days(), "classification": classification_rules(config, p_tenant)})
                if parsed.path == "/dashboard/billing":
                    if current["role"] != "super_admin":
                        return self.send_json(403, {"error": "super_admin_required"})
                    b_tenant = payload.get("tenantId", current["tenantId"])
                    billing = config.setdefault("billing", {}).setdefault(b_tenant, {})
                    if isinstance(payload.get("pool"), dict):
                        pool = dict(billing.get("pool") or {})
                        for key in ("essential", "intelligence"):
                            if key in payload["pool"]:
                                try: pool[key] = max(0, min(1000000, int(payload["pool"][key])))
                                except (TypeError, ValueError): pass
                        billing["pool"] = {"essential": int(pool.get("essential", 0) or 0), "intelligence": int(pool.get("intelligence", 0) or 0)}
                        billing.pop("plan", None); billing.pop("seats", None)
                    if "status" in payload:
                        billing["status"] = "active" if str(payload["status"]).lower() in ("active", "ativo") else "trial"
                    if not billing.get("cycleStart"):
                        billing["cycleStart"] = datetime.now(timezone.utc).date().isoformat()
                    if isinstance(payload.get("prices"), dict):
                        pricing = config.setdefault("pricing", {})
                        for key in ("essential", "intelligence"):
                            if key in payload["prices"]:
                                try: pricing[key] = round(float(payload["prices"][key]), 2)
                                except (TypeError, ValueError): pass
                    if isinstance(payload.get("limits"), dict):
                        limits = billing.setdefault("limits", {})
                        for key in ("people", "devices", "retentionDays"):
                            if key in payload["limits"]:
                                try: limits[key] = max(0, min(1000000, int(payload["limits"][key])))
                                except (TypeError, ValueError): pass
                    save_config(config); audit("billing.update", current["email"], {"tenant": b_tenant, "pool": billing.get("pool")})
                    return self.send_json(200, billing_summary(config, b_tenant))
                if parsed.path in ("/dashboard/devices/block", "/dashboard/devices/unblock"):
                    host = str(payload.get("host", "")).strip()
                    if not host: return self.send_json(400, {"error": "host_required"})
                    dev_tenant = payload.get("tenantId", current["tenantId"]) if current["role"] == "super_admin" else current["tenantId"]
                    blocked = config.setdefault("blockedHosts", {}).setdefault(dev_tenant, [])
                    is_block = parsed.path.endswith("/block")
                    if is_block:
                        if host not in blocked: blocked.append(host)
                    else:
                        config["blockedHosts"][dev_tenant] = [h for h in blocked if h != host]
                    save_config(config); audit("device.block" if is_block else "device.unblock", current["email"], {"host": host})
                    return self.send_json(200, {"host": host, "blocked": is_block})
                if parsed.path == "/dashboard/devices/update":
                    host = str(payload.get("host", "")).strip(); if_not = not host
                    if if_not: return self.send_json(400, {"error": "host_required"})
                    tid = payload.get("tenantId", current["tenantId"]) if current["role"] == "super_admin" else current["tenantId"]
                    key = f"{tid}:{host}"; registry = config.setdefault("devices", {}); entry = registry.setdefault(key, {})
                    if "name" in payload: entry["name"] = str(payload.get("name") or host)[:120]
                    if "personId" in payload:
                        person = next((p for p in config.get("people", []) if p.get("id") == payload.get("personId") and p.get("tenantId") == tid), None)
                        if not person: return self.send_json(404, {"error": "person_not_found"})
                        entry["personId"] = person["id"]; person["host"] = host
                    if payload.get("revoke"): config.setdefault("blockedHosts", {}).setdefault(tid, []); config["blockedHosts"][tid] = list(set(config["blockedHosts"][tid] + [host]))
                    if payload.get("requestUpdate"):
                        platform_name = agent_platform((entry.get("inventory") or {}).get("os") or ("macos" if "mac" in host.lower() else "windows"))
                        release = (config.get("agentReleases") or {}).get(platform_name) or {}
                        if not release.get("version"): return self.send_json(409, {"error": "stable_release_not_published", "platform": platform_name})
                        entry["updateRequested"] = True; entry["requestedAt"] = datetime.now(timezone.utc).isoformat(); entry["targetVersion"] = release["version"]; entry["updateStatus"] = "requested"; entry.pop("updateError", None)
                    save_config(config); audit("device.update", current["email"], {"tenant": tid, "host": host, "personId": entry.get("personId"), "updateRequested": bool(payload.get("requestUpdate"))}); return self.send_json(200, {"host": host, **entry})
                if parsed.path == "/dashboard/agent-update-policy":
                    tid = payload.get("tenantId", current["tenantId"]) if current["role"] == "super_admin" else current["tenantId"]
                    policy = tenant_update_policy({"agentUpdatePolicies": {tid: payload}}, tid)
                    config.setdefault("agentUpdatePolicies", {})[tid] = policy
                    save_config(config); audit("agent.policy.update", current["email"], {"tenant": tid, **policy})
                    return self.send_json(200, policy)
                if parsed.path == "/dashboard/agent-update-all":
                    tid = payload.get("tenantId", current["tenantId"]) if current["role"] == "super_admin" else current["tenantId"]
                    requested = 0; now = datetime.now(timezone.utc).isoformat()
                    for key, entry in config.setdefault("devices", {}).items():
                        if not key.startswith(f"{tid}:"): continue
                        platform_name = agent_platform((entry.get("inventory") or {}).get("os") or ("macos" if "mac" in key.lower() else "windows"))
                        release = (config.get("agentReleases") or {}).get(platform_name) or {}
                        if release.get("version") and version_key(entry.get("version", "")) < version_key(release["version"]):
                            entry.update({"updateRequested": True, "requestedAt": now, "targetVersion": release["version"], "updateStatus": "requested"}); entry.pop("updateError", None); requested += 1
                    save_config(config); audit("agent.update_all", current["email"], {"tenant": tid, "requested": requested})
                    return self.send_json(200, {"requested": requested})
                if parsed.path == "/dashboard/devices/delete":
                    host = str(payload.get("host", "")).strip()
                    if not host: return self.send_json(400, {"error": "host_required"})
                    tid = payload.get("tenantId", current["tenantId"]) if current["role"] == "super_admin" else current["tenantId"]
                    config.setdefault("removedHosts", {}).setdefault(tid, [])
                    if host not in config["removedHosts"][tid]: config["removedHosts"][tid].append(host)
                    config.setdefault("blockedHosts", {}).setdefault(tid, [])
                    if host not in config["blockedHosts"][tid]: config["blockedHosts"][tid].append(host)
                    config.setdefault("devices", {}).pop(f"{tid}:{host}", None)
                    for person in config.get("people", []):
                        if person.get("tenantId") == tid and person.get("host") == host:
                            person.pop("host", None)
                            person["deviceIds"] = [device for device in person.get("deviceIds", []) if device != host]
                    save_config(config)
                    with _CACHE_LOCK: _AW_CACHE.clear()
                    audit("device.delete", current["email"], {"tenant": tid, "host": host})
                    return self.send_json(200, {"host": host, "removed": True})
                if parsed.path == "/dashboard/agent-releases":
                    if current["role"] != "super_admin": return self.send_json(403, {"error": "super_admin_required"})
                    platform_name = str(payload.get("platform", "macos")).lower()
                    if platform_name not in ("macos", "windows"): return self.send_json(400, {"error": "invalid_platform"})
                    version = str(payload.get("version", "")).strip()[:80]; url = str(payload.get("url", "")).strip()[:1000]; sha = str(payload.get("sha256", "")).strip().lower()
                    if not version or not url.startswith("https://") or not re.fullmatch(r"[a-f0-9]{64}", sha): return self.send_json(400, {"error": "invalid_release"})
                    release = {"version": version, "url": url, "sha256": sha, "publishedAt": datetime.now(timezone.utc).isoformat(), "publishedBy": current["email"]}
                    config.setdefault("agentReleases", {})[platform_name] = release; save_config(config); audit("agent.release.publish", current["email"], {"platform": platform_name, "version": version}); return self.send_json(201, release)
                if parsed.path == "/dashboard/tenants":
                    if current["role"] != "super_admin": return self.send_json(403, {"error": "super_admin_required"})
                    tenant = {"id": re.sub(r"[^a-z0-9-]", "-", str(payload.get("id") or payload.get("name", "empresa")).lower()).strip("-"), "name": str(payload.get("name", "Empresa"))[:100], "kind": "customer", "status": "active", "peopleCount": 0, "deviceCount": 0}; config["tenants"].append(tenant); save_config(config); audit("tenant.create", current["email"], {"id": tenant["id"]}); return self.send_json(201, tenant)
                if parsed.path == "/dashboard/enrollments":
                    tenant_id = payload.get("tenantId", current["tenantId"]) if current["role"] == "super_admin" else current["tenantId"]
                    token = secrets.token_urlsafe(32); enrollment = {"id": str(uuid.uuid4()), "tenantId": tenant_id, "tokenHash": hashlib.sha256(token.encode()).hexdigest(), "createdAt": datetime.now(timezone.utc).isoformat(), "expiresAt": (datetime.now(timezone.utc)+timedelta(days=7)).isoformat()}; config["enrollments"].append(enrollment); save_config(config); audit("enrollment.create", current["email"], {"tenantId": tenant_id}); return self.send_json(201, {"token": token, "tenantId": tenant_id, "serverUrl": "https://timewatcher.32-193-139-223.sslip.io"})
                return self.send_json(404, {"error": "not_found"})
        if parsed.path not in ("/v1/screenshots", "/v1/activity-events"): return self.send_json(404, {"error": "not_found"})
        supplied = self.headers.get("Authorization", "")
        tenant_id = ingest_tenant(supplied[7:]) if supplied.startswith("Bearer ") else None
        if not tenant_id: return self.send_json(401, {"error": "unauthorized"})
        self.ingest_tenant = tenant_id
        if parsed.path == "/v1/activity-events": return self.receive_activity_events()
        return self.receive_screenshot()

    def do_PUT(self) -> None:
        parsed = urllib.parse.urlsplit(self.path)
        if not parsed.path.startswith("/scim/v2/"): return self.send_json(404, {"error": "not_found"})
        try: payload = self.read_json()
        except Exception: return self.send_json(400, {"detail": "invalid_json"})
        return self.handle_scim("PUT", parsed, payload)

    def do_PATCH(self) -> None:
        parsed = urllib.parse.urlsplit(self.path)
        if not parsed.path.startswith("/scim/v2/"): return self.send_json(404, {"error": "not_found"})
        try: payload = self.read_json()
        except Exception: return self.send_json(400, {"detail": "invalid_json"})
        return self.handle_scim("PATCH", parsed, payload)

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

    def serve_screenshot(self, current: dict, image_id: str) -> None:
        if not re.fullmatch(r"[0-9a-f-]{36}", image_id): return self.send_json(400, {"error": "invalid_id"})
        root = DATA_DIR / "screenshots"
        if current["role"] == "super_admin":
            matches = list(root.rglob(f"{image_id}.jpg"))
        else:
            matches = list((root / current["tenantId"]).rglob(f"{image_id}.jpg"))
            # Screenshots created before tenant-aware storage lived directly
            # under screenshots/YYYY-MM-DD. They belong to the original Synova
            # tenant and must remain readable by its administrators.
            if current["tenantId"] == "synova":
                matches += list(root.glob(f"*/{image_id}.jpg"))
        if not matches: return self.send_json(404, {"error": "not_found"})
        audit("screenshot.view", current["email"], {"id": image_id})
        image = matches[0].read_bytes(); self.send_response(200); self.send_header("Content-Type", "image/jpeg"); self.send_header("Cache-Control", "private, max-age=300"); self.send_header("Content-Length", str(len(image))); self.end_headers(); self.wfile.write(image)

    def avatar_path(self, current: dict) -> Path:
        user = re.sub(r"[^a-z0-9_-]", "", str(current.get("username", "")).lower()) or "user"
        return AVATAR_DIR / f"{user}.jpg"

    def serve_avatar(self, current: dict) -> None:
        path = self.avatar_path(current)
        if not path.exists(): return self.send_json(404, {"error": "not_found"})
        image = path.read_bytes(); self.send_response(200); self.send_header("Content-Type", "image/jpeg"); self.send_header("Cache-Control", "private, max-age=30"); self.send_header("Content-Length", str(len(image))); self.end_headers(); self.wfile.write(image)

    def receive_avatar(self, current: dict) -> None:
        try: length = int(self.headers.get("Content-Length", "0"))
        except ValueError: length = 0
        path = self.avatar_path(current)
        if length <= 0:
            path.unlink(missing_ok=True); return self.send_json(200, {"deleted": True})
        if length > MAX_AVATAR_BYTES: return self.send_json(413, {"error": "invalid_size"})
        image = self.rfile.read(length)
        if len(image) != length or not image.startswith(b"\xff\xd8\xff"): return self.send_json(400, {"error": "invalid_jpeg"})
        AVATAR_DIR.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=AVATAR_DIR, delete=False) as temporary: temporary.write(image); temporary.flush(); os.fsync(temporary.fileno()); temporary_path = Path(temporary.name)
        temporary_path.chmod(0o600); temporary_path.replace(path)
        self.send_json(201, {"ok": True})

    def send_session(self, email: str, body: dict, status: int = 200) -> None:
        token = make_session(email)
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Set-Cookie", f"tw_session={token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age={SESSION_TTL_DAYS * 86400}")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_login(self) -> None:
        try: payload = self.read_json()
        except Exception: return self.send_json(400, {"error": "invalid_json"})
        email = str(payload.get("email", "")).strip().lower(); password = str(payload.get("password", ""))
        ip = client_ip(self.headers)
        if login_blocked(email) or login_blocked("ip:" + ip):
            audit("auth.login_blocked", email, {"ip": ip})
            return self.send_json(429, {"error": "too_many_attempts"})
        account = load_config()["accounts"].get(email)
        if not account or account.get("status") != "active" or not verify_password(password, account.get("pw", "")):
            record_login_failure(email); record_login_failure("ip:" + ip)
            audit("auth.login_failed", email, {"ip": ip})
            return self.send_json(401, {"error": "invalid_credentials"})
        clear_login_failures(email); clear_login_failures("ip:" + ip)
        audit("auth.login", email, {"ip": ip})
        self.send_session(email, {"email": email, "name": account.get("name", email), "role": account.get("role"), "tenantId": account.get("tenantId")})

    def do_logout(self) -> None:
        data = json.dumps({"ok": True}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Set-Cookie", "tw_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def invite_info(self, params: dict) -> None:
        token = params.get("token", [""])[0]; digest = hashlib.sha256(token.encode()).hexdigest(); now = datetime.now(timezone.utc)
        for invite in load_config()["invites"]:
            try:
                if hmac.compare_digest(digest, invite["tokenHash"]) and parse_timestamp(invite["expiresAt"]) > now:
                    return self.send_json(200, {"email": invite["email"], "role": invite["role"]})
            except (KeyError, ValueError): continue
        return self.send_json(404, {"error": "invalid_invite"})

    def do_accept_invite(self) -> None:
        try: payload = self.read_json()
        except Exception: return self.send_json(400, {"error": "invalid_json"})
        token = str(payload.get("token", "")); password = str(payload.get("password", ""))
        if len(password) < 8: return self.send_json(400, {"error": "weak_password"})
        digest = hashlib.sha256(token.encode()).hexdigest(); now = datetime.now(timezone.utc)
        with _CONFIG_LOCK:
            config = load_config(); match = None
            for invite in config["invites"]:
                try:
                    if hmac.compare_digest(digest, invite["tokenHash"]) and parse_timestamp(invite["expiresAt"]) > now:
                        match = invite; break
                except (KeyError, ValueError): continue
            if not match: return self.send_json(400, {"error": "invalid_invite"})
            email = match["email"]
            if config["accounts"].get(email, {}).get("status") == "active":
                config["invites"] = [i for i in config["invites"] if i.get("tokenHash") != match["tokenHash"]]; save_config(config)
                return self.send_json(409, {"error": "account_exists"})
            config["accounts"][email] = {"name": email.split("@")[0].replace(".", " ").replace("_", " ").title(), "role": match["role"], "tenantId": match.get("tenantId", "synova"), "status": "active", "pw": hash_password(password)}
            # Invitations are also the provisioning point for the monitored
            # roster: the admin can assign OU and jornada before first login.
            if not any((p.get("email") or "").lower() == email for p in config.get("people", [])):
                config.setdefault("people", []).append({
                    "id": re.sub(r"[^a-z0-9-]", "-", email.split("@", 1)[0].lower()).strip("-") or str(uuid.uuid4()),
                    "tenantId": match.get("tenantId", "synova"), "name": config["accounts"][email]["name"],
                    "email": email, "role": "Colaborador", "teamId": match.get("teamId"),
                    "scheduleId": match.get("scheduleId"), "deviceIds": [],
                })
            config["invites"] = [i for i in config["invites"] if i.get("tokenHash") != match["tokenHash"]]; save_config(config)
            audit("account.activate", email, {"role": match["role"], "tenantId": match.get("tenantId", "synova")})
            account = config["accounts"][email]
        self.send_session(email, {"email": email, "name": account["name"], "role": account["role"], "tenantId": account["tenantId"]})

    def reset_info(self, params: dict) -> None:
        token = params.get("token", [""])[0]; digest = hashlib.sha256(token.encode()).hexdigest(); now = datetime.now(timezone.utc)
        for email, account in load_config()["accounts"].items():
            try:
                if account.get("resetHash") and hmac.compare_digest(digest, account["resetHash"]) and parse_timestamp(account["resetExpires"]) > now:
                    return self.send_json(200, {"email": email})
            except (KeyError, ValueError): continue
        return self.send_json(404, {"error": "invalid_reset"})

    def do_forgot_password(self) -> None:
        try: payload = self.read_json()
        except Exception: return self.send_json(400, {"error": "invalid_json"})
        email = str(payload.get("email", "")).strip().lower(); ip = client_ip(self.headers)
        # throttle por IP p/ nao virar vetor de e-mail bombing; sempre responde 200 (sem enumeracao de contas)
        if login_blocked("reset:ip:" + ip): return self.send_json(200, {"ok": True})
        record_login_failure("reset:ip:" + ip)
        with _CONFIG_LOCK:
            config = load_config(); account = config["accounts"].get(email)
            if account and account.get("status") == "active":
                token = secrets.token_urlsafe(32); now = datetime.now(timezone.utc)
                account["resetHash"] = hashlib.sha256(token.encode()).hexdigest()
                account["resetExpires"] = (now + timedelta(hours=1)).isoformat()
                save_config(config); audit("auth.reset_requested", email, {"ip": ip})
                host = self.headers.get("Host") or urllib.parse.urlsplit(PUBLIC_URL).netloc
                sent = mailer.send_password_reset(email, f"https://{host}/?reset={token}")
                if sent.get("ok"): audit("auth.reset_email_sent", email, {})
        return self.send_json(200, {"ok": True})

    def do_reset_password(self) -> None:
        try: payload = self.read_json()
        except Exception: return self.send_json(400, {"error": "invalid_json"})
        token = str(payload.get("token", "")); password = str(payload.get("password", ""))
        if len(password) < 8: return self.send_json(400, {"error": "weak_password"})
        digest = hashlib.sha256(token.encode()).hexdigest(); now = datetime.now(timezone.utc)
        with _CONFIG_LOCK:
            config = load_config(); target = None
            for email, account in config["accounts"].items():
                try:
                    if account.get("resetHash") and hmac.compare_digest(digest, account["resetHash"]) and parse_timestamp(account["resetExpires"]) > now:
                        target = email; break
                except (KeyError, ValueError): continue
            if not target: return self.send_json(400, {"error": "invalid_reset"})
            account = config["accounts"][target]
            account["pw"] = hash_password(password); account.pop("resetHash", None); account.pop("resetExpires", None); account["status"] = "active"
            save_config(config); clear_login_failures(target); clear_login_failures("ip:" + client_ip(self.headers))
            audit("auth.reset_completed", target, {})
            view = {"email": target, "name": account.get("name", target), "role": account.get("role"), "tenantId": account.get("tenantId")}
        self.send_session(target, view)

    def get_policies(self, current: dict, params: dict) -> None:
        config = load_config()
        is_super = current["role"] == "super_admin"
        tenant_id = params.get("tenant", [current["tenantId"]])[0] if is_super else current["tenantId"]
        self.send_json(200, {
            "retentionDays": retention_days(),
            "retentionEditable": is_super,
            "classification": classification_rules(config, tenant_id),
            "defaults": {"productive": sorted(PRODUCTIVE), "unproductive": sorted(UNPRODUCTIVE)},
        })

    def list_teams(self, current: dict, params: dict) -> None:
        config = load_config()
        is_super = current["role"] == "super_admin"
        tenant_id = params.get("tenant", [current["tenantId"]])[0] if is_super else current["tenantId"]
        teams = [t for t in config.get("teams", []) if t.get("tenantId") == tenant_id]
        if current["role"] == "manager":
            managed = managed_team_ids(config, current["email"], tenant_id)
            teams = [t for t in teams if t["id"] in managed]
        people = [p for p in config.get("people", []) if p.get("tenantId") == tenant_id]
        accounts = config.get("accounts", {})
        def enrich(team: dict) -> dict:
            members = [{"id": p.get("id"), "name": p.get("name") or p.get("host"), "host": p.get("host")} for p in people if p.get("teamId") == team["id"]]
            mgr = accounts.get((team.get("managerEmail") or "").lower())
            return {**team, "members": members, "memberCount": len(members), "managerName": mgr.get("name") if mgr else None}
        managers = [{"email": e, "name": a.get("name"), "role": a.get("role")} for e, a in accounts.items() if (is_super or a.get("tenantId") == tenant_id) and a.get("role") in ("manager", "org_admin", "super_admin") and a.get("status") == "active"]
        all_people = [{"id": p.get("id"), "name": p.get("name") or p.get("host"), "teamId": p.get("teamId")} for p in people]
        self.send_json(200, {"teams": [enrich(t) for t in teams], "managers": managers, "people": all_people})

    def list_invites(self, current: dict) -> None:
        config = load_config(); is_super = current["role"] == "super_admin"; tenant = current["tenantId"]
        accounts = [{"email": e, "name": a.get("name"), "role": a.get("role"), "status": a.get("status")} for e, a in config["accounts"].items() if is_super or a.get("tenantId") == tenant]
        invites = [{"email": i["email"], "role": i["role"], "expiresAt": i["expiresAt"]} for i in config["invites"] if is_super or i.get("tenantId") == tenant]
        self.send_json(200, {"accounts": accounts, "invites": invites})

    def list_audit(self) -> None:
        entries = []
        try:
            for line in AUDIT_FILE.read_text(encoding="utf-8").splitlines()[-300:]:
                try: entries.append(json.loads(line))
                except json.JSONDecodeError: continue
        except OSError: pass
        entries.reverse()
        self.send_json(200, {"entries": entries})

    def receive_screenshot(self) -> None:
        if self.headers.get_content_type() != "image/jpeg": return self.send_json(415, {"error": "jpeg_required"})
        try: length = int(self.headers.get("Content-Length", "0"))
        except ValueError: length = 0
        if not 4 <= length <= MAX_UPLOAD_BYTES: return self.send_json(413, {"error": "invalid_size"})
        image = self.rfile.read(length)
        if len(image) != length or not image.startswith(b"\xff\xd8\xff"): return self.send_json(400, {"error": "invalid_jpeg"})
        raw_device = self.headers.get("X-Device-Id", "unknown")[:120]; reconcile_case_variant_host(getattr(self, "ingest_tenant", "synova"), raw_device); device = canonical_host(raw_device); captured_at = self.headers.get("X-Captured-At", datetime.now(timezone.utc).isoformat())[:80]; app = self.headers.get("X-Active-App", "")[:300]; title = self.headers.get("X-Active-Title", "")[:1000]
        tenant_id = getattr(self, "ingest_tenant", "synova")
        if host_removed(tenant_id, device): return self.send_json(410, {"error": "device_removed"})
        if host_blocked(tenant_id, device): return self.send_json(403, {"error": "device_blocked"})
        with _CONFIG_LOCK:
            config = load_config()
            if not device_allowed(config, tenant_id, device): return self.send_json(403, {"error": "device_limit_reached"})
            register_device_signal(config, tenant_id, device, "timewatcher-agent")
            save_config(config)
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
            raw_hostname = str(bucket.get("hostname", "unknown"))[:200]; reconcile_case_variant_host(tenant_id, raw_hostname); hostname = canonical_host(raw_hostname)
            bucket = {**bucket, "hostname": hostname}
            if host_removed(tenant_id, hostname): return self.send_json(410, {"error": "device_removed"})
            if host_blocked(tenant_id, hostname): return self.send_json(403, {"error": "device_blocked"})
            if not isinstance(events, list) or len(events) > 1000: raise ValueError()
            clean = [{"timestamp": str(e["timestamp"]), "duration": float(e.get("duration", 0)), "data": dict(e.get("data", {}))} for e in events]
            # The first signal is the enrollment point.  Enforce the contracted
            # device capacity server-side before persisting any telemetry.
            with _CONFIG_LOCK:
                config = load_config()
                if not device_allowed(config, tenant_id, hostname): return self.send_json(403, {"error": "device_limit_reached"})
                signal = next((e.get("data", {}) for e in reversed(clean) if isinstance(e.get("data"), dict) and (e.get("data", {}).get("version") or e.get("data", {}).get("device"))), {})
                version = str(signal.get("version", ""))
                inventory = signal.get("device") if isinstance(signal.get("device"), dict) else None
                register_device_signal(config, tenant_id, hostname, str(bucket.get("client", "")), version, inventory, client_ip(self.headers))
                linked = auto_link_device_identity(config, tenant_id, hostname, inventory or {})
                if linked:
                    audit("device.auto_link", "system", {"tenant": tenant_id, "host": hostname, "personId": linked["id"]})
                save_config(config)
            aw_request("POST", f"/api/0/buckets/{urllib.parse.quote(bucket_id, safe='')}", {"id": bucket_id, "type": str(bucket.get("type", "unknown"))[:200], "client": str(bucket.get("client", "timewatcher"))[:200], "hostname": str(bucket.get("hostname", "unknown"))[:200], "data": dict(bucket.get("data", {}))})
            if clean: aw_request("POST", f"/api/0/buckets/{urllib.parse.quote(bucket_id, safe='')}/events", clean)
            if str(bucket.get("type")) == "timewatcher.heartbeat":
                heartbeat = next((e.get("data", {}) for e in reversed(clean) if e.get("data", {}).get("version")), {})
                version = str(heartbeat.get("version", "")); update = heartbeat.get("update") if isinstance(heartbeat.get("update"), dict) else {}
                with _CONFIG_LOCK:
                    config = load_config()
                    entry = config.setdefault("devices", {}).setdefault(f"{tenant_id}:{hostname}", {})
                    now = datetime.now(timezone.utc).isoformat(); entry["lastHeartbeatAt"] = now
                    if update:
                        status = str(update.get("status", ""))[:80]
                        if status: entry["updateStatus"] = status
                        if update.get("checkedAt"): entry["lastUpdateCheckAt"] = str(update["checkedAt"])[:80]
                        if update.get("targetVersion"): entry["targetVersion"] = str(update["targetVersion"])[:80]
                        if update.get("error"): entry["updateError"] = str(update["error"])[:500]
                        elif status in ("current", "installed"): entry.pop("updateError", None)
                    target = str(entry.get("targetVersion") or "")
                    if target and version and version_key(version) >= version_key(target):
                        entry["updateRequested"] = False; entry["updateStatus"] = "current"; entry["lastUpdatedAt"] = now; entry.pop("updateError", None)
                    save_config(config)
            with _CACHE_LOCK: _AW_CACHE.clear()
        except (KeyError, TypeError, ValueError, json.JSONDecodeError): return self.send_json(400, {"error": "invalid_payload"})
        except Exception: return self.send_json(502, {"error": "activity_write_failed"})
        self.send_json(201, {"bucket": bucket_id, "accepted": len(clean)})

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"{self.address_string()} - {fmt % args}", flush=True)


def bootstrap_admin() -> None:
    email = BOOTSTRAP_ADMIN.strip().lower()
    if not email:
        return
    config = load_config()
    if config.get("accounts"):
        return
    if any(i.get("email") == email for i in config.get("invites", [])):
        return
    token = secrets.token_urlsafe(32); now = datetime.now(timezone.utc)
    config.setdefault("invites", []).append({"email": email, "role": "super_admin", "tenantId": "synova", "tokenHash": hashlib.sha256(token.encode()).hexdigest(), "createdAt": now.isoformat(), "expiresAt": (now + timedelta(days=14)).isoformat()})
    save_config(config)
    link = f"{PUBLIC_URL}/?invite={token}"
    try:
        path = DATA_DIR / "bootstrap-admin-link.txt"
        path.write_text(link + "\n")
        path.chmod(0o600)
    except OSError:
        pass
    print(f"[bootstrap] admin invite for {email}: {link}", flush=True)


if __name__ == "__main__":
    DATA_DIR.mkdir(parents=True, exist_ok=True); load_config(); session_secret(); bootstrap_admin()
    threading.Thread(target=retention_worker, daemon=True).start()
    threading.Thread(target=rollup_worker, daemon=True).start()
    threading.Thread(target=digest_worker, daemon=True).start()
    threading.Thread(target=alert_email_worker, daemon=True).start()
    threading.Thread(target=report_schedule_worker, daemon=True).start()
    ThreadingHTTPServer(("127.0.0.1", 5610), Handler).serve_forever()
