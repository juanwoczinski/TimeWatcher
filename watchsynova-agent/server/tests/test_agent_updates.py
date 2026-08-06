import os
import sys
import unittest

os.environ.setdefault("WATCHSYNOVA_INGEST_TOKEN", "test-token")
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import ingest_server as server


class AgentUpdateTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
