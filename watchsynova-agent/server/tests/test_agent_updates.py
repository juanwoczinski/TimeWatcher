import os
import sys
import io
import tempfile
import unittest
import zipfile
import hashlib
from datetime import datetime, timezone, timedelta

os.environ.setdefault("WATCHSYNOVA_INGEST_TOKEN", "test-token")
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import ingest_server as server


class AgentUpdateTests(unittest.TestCase):
    def test_platform_is_derived_from_inventory_not_hostname_casing(self):
        self.assertEqual(server.agent_platform("Darwin"), "macos")
        self.assertEqual(server.agent_platform("Windows"), "windows")

    def release_config(self):
        config = server.default_config()
        config["agentReleases"]["macos"] = {
            "version": "0.4.0",
            "url": "https://example.test/TimeWatcher.zip",
            "sha256": "a" * 64,
        }
        return config

    def test_stable_update_is_offered_and_recorded(self):
        config = self.release_config()
        manifest = server.agent_update_manifest(config, "synova", "MacBook.local", "macos", "0.3.0")
        self.assertTrue(manifest["updateAvailable"])
        self.assertEqual(manifest["release"]["version"], "0.4.0")
        self.assertEqual(config["devices"]["synova:macbook.local"]["updateStatus"], "offered")

    def test_current_version_is_never_downgraded(self):
        config = self.release_config()
        manifest = server.agent_update_manifest(config, "synova", "MacBook.local", "macos", "0.5.0")
        self.assertFalse(manifest["updateAvailable"])
        self.assertEqual(config["devices"]["synova:macbook.local"]["updateStatus"], "current")

    def test_disabled_policy_still_honors_explicit_command(self):
        config = self.release_config(); config["agentUpdatePolicies"]["synova"] = {"enabled": False, "rolloutPercent": 0}
        config["devices"]["synova:macbook.local"] = {"updateRequested": True}
        manifest = server.agent_update_manifest(config, "synova", "MacBook.local", "macos", "0.3.0")
        self.assertTrue(manifest["updateAvailable"])

    def test_fleet_report_has_real_version_distribution(self):
        config = self.release_config(); config["devices"] = {"synova:a": {"version": "0.4.0", "inventory": {"os": "macOS"}}, "synova:b": {"version": "0.3.0", "inventory": {"os": "macOS"}}}
        report = server.agent_fleet_summary(config, "synova")
        self.assertEqual(report["total"], 2)
        self.assertEqual(report["distribution"], {"0.4.0": 1, "0.3.0": 1})
        self.assertEqual(report["statuses"]["outdated"], 1)

    def test_activity_signal_does_not_erase_device_inventory(self):
        config = server.default_config()
        server.register_device_signal(config, "synova", "mac.local", "agent/0.4.0", "0.4.0", {"os": "Darwin", "model": "Mac17,2", "installedSoftware": ["TimeWatcher"]}, "203.0.113.10")
        server.register_device_signal(config, "synova", "mac.local", "window-watcher", "", None, "203.0.113.10")
        device = config["devices"]["synova:mac.local"]
        self.assertEqual(device["inventory"]["model"], "Mac17,2")
        self.assertEqual(device["software"], ["TimeWatcher"])

    def test_windows_enrollment_launcher_is_tenant_bound(self):
        token = "safe-enrollment-token"
        config = server.default_config()
        config["enrollments"] = [{"tenantId": "synova", "tokenHash": server.hashlib.sha256(token.encode()).hexdigest(), "expiresAt": "2099-01-01T00:00:00+00:00"}]
        original = server.load_config
        original_msi = server.WINDOWS_MSI_FILE
        try:
            server.load_config = lambda: config
            with tempfile.TemporaryDirectory() as directory:
                msi = os.path.join(directory, "TimeWatcher-Windows.msi")
                with open(msi, "wb") as artifact:
                    artifact.write(b"test-msi")
                server.WINDOWS_MSI_FILE = server.Path(msi)
                handler = object.__new__(server.Handler)
                handler.wfile = io.BytesIO()
                handler.send_response = lambda status: setattr(handler, "status", status)
                handler.send_header = lambda *_: None
                handler.end_headers = lambda: None
                handler.serve_windows_enrollment_package(token)
                self.assertEqual(handler.status, 200)
                with zipfile.ZipFile(io.BytesIO(handler.wfile.getvalue())) as package:
                    self.assertEqual(set(package.namelist()), {"TimeWatcher-Windows.msi", "Instalar-TimeWatcher.cmd", "LEIA-ME.txt"})
                    self.assertIn('TENANT_ID="synova"', package.read("Instalar-TimeWatcher.cmd").decode())
                    self.assertIn("net session", package.read("Instalar-TimeWatcher.cmd").decode())
        finally:
            server.load_config = original
            server.WINDOWS_MSI_FILE = original_msi

    def test_single_file_windows_launcher_downloads_and_verifies_msi(self):
        token = "single-file-token"
        config = server.default_config()
        config["enrollments"] = [{"tenantId": "synova", "tokenHash": hashlib.sha256(token.encode()).hexdigest(), "expiresAt": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()}]
        original = server.load_config; original_msi = server.WINDOWS_MSI_FILE
        try:
            server.load_config = lambda: config
            with tempfile.TemporaryDirectory() as directory:
                msi = os.path.join(directory, "TimeWatcher-Windows.msi")
                with open(msi, "wb") as artifact: artifact.write(b"test-msi")
                server.WINDOWS_MSI_FILE = server.Path(msi)
                handler = object.__new__(server.Handler); handler.wfile = io.BytesIO(); headers = {}
                handler.send_response = lambda status: setattr(handler, "status", status)
                handler.send_header = lambda key, value: headers.__setitem__(key, value)
                handler.end_headers = lambda: None
                handler.serve_windows_enrollment_package(token, True)
                launcher = handler.wfile.getvalue().decode()
                self.assertEqual(handler.status, 200)
                self.assertIn('filename="Instalar-TimeWatcher-Windows.cmd"', headers["Content-Disposition"])
                self.assertIn("Invoke-WebRequest", launcher)
                self.assertIn(hashlib.sha256(b"test-msi").hexdigest(), launcher)
                self.assertIn('ENROLLMENT_TOKEN="single-file-token"', launcher)
        finally:
            server.load_config = original; server.WINDOWS_MSI_FILE = original_msi

    def test_windows_executable_keeps_binary_immutable_and_binds_filename(self):
        token = "executable-enrollment-token"
        config = server.default_config()
        config["enrollments"] = [{"tenantId": "synova", "tokenHash": hashlib.sha256(token.encode()).hexdigest(), "expiresAt": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()}]
        original = server.load_config; original_setup = server.WINDOWS_SETUP_FILE
        try:
            server.load_config = lambda: config
            with tempfile.TemporaryDirectory() as directory:
                executable = os.path.join(directory, "TimeWatcher-Setup.exe")
                with open(executable, "wb") as artifact: artifact.write(b"MZ-test-executable")
                server.WINDOWS_SETUP_FILE = server.Path(executable)
                handler = object.__new__(server.Handler); handler.wfile = io.BytesIO(); headers = {}
                handler.send_response = lambda status: setattr(handler, "status", status)
                handler.send_header = lambda key, value: headers.__setitem__(key, value)
                handler.end_headers = lambda: None
                handler.serve_windows_enrollment_executable(token)
                self.assertEqual(handler.status, 200)
                self.assertEqual(handler.wfile.getvalue(), b"MZ-test-executable")
                self.assertIn(f"TimeWatcher-Setup-{token}.exe", headers["Content-Disposition"])
        finally:
            server.load_config = original; server.WINDOWS_SETUP_FILE = original_setup

    def test_durable_agent_token_survives_expired_enrollment(self):
        durable = "durable-device-token"
        config = server.default_config()
        config["enrollments"] = []
        config["agentTokens"] = [{"tenantId": "synova", "host": "pc-01", "tokenHash": hashlib.sha256(durable.encode()).hexdigest(), "enabled": True}]
        original = server.load_config
        try:
            server.load_config = lambda: config
            self.assertEqual(server.ingest_tenant(durable), "synova")
            self.assertIsNone(server.ingest_tenant("invalid"))
        finally:
            server.load_config = original


if __name__ == "__main__":
    unittest.main()
