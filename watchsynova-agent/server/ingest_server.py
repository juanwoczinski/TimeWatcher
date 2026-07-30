#!/usr/bin/env python3
"""Authenticated, write-only screenshot ingestion for WatchSynova."""

import hashlib
import hmac
import json
import os
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
DATA_DIR = Path(os.environ.get("WATCHSYNOVA_DATA_DIR", "/var/lib/watchsynova-ingest"))
TOKEN = os.environ["WATCHSYNOVA_INGEST_TOKEN"]
AW_SERVER = os.environ.get("WATCHSYNOVA_AW_SERVER", "http://127.0.0.1:5600")


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


class Handler(BaseHTTPRequestHandler):
    server_version = "WatchSynovaIngest/1"

    def send_json(self, status: int, payload: object) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/health":
            self.send_json(200, {"status": "ok"})
        else:
            self.send_json(404, {"error": "not_found"})

    def do_POST(self) -> None:
        if self.path != "/v1/screenshots":
            self.send_json(404, {"error": "not_found"})
            return
        supplied = self.headers.get("Authorization", "")
        if not supplied.startswith("Bearer ") or not hmac.compare_digest(supplied[7:], TOKEN):
            self.send_json(401, {"error": "unauthorized"})
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
        bucket_id = f"watchsynova-screenshot_{device}".replace("/", "_")
        try:
            aw_request("POST", f"/api/0/buckets/{urllib.parse.quote(bucket_id, safe='')}", {
                "id": bucket_id, "type": "watchsynova.screenshot", "client": "watchsynova-agent",
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

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"{self.address_string()} - {fmt % args}", flush=True)


if __name__ == "__main__":
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    ThreadingHTTPServer(("127.0.0.1", 5610), Handler).serve_forever()
