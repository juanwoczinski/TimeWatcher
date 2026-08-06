import os
import unittest

# The module reads this at import time.  Unit tests exercise only pure helpers.
os.environ.setdefault("WATCHSYNOVA_INGEST_TOKEN", "test-token")

from ingest_server import default_config, device_allowed, readiness_snapshot


class ProductReadinessTests(unittest.TestCase):
    def test_device_limit_is_enforced_for_new_host_only(self):
        config = default_config()
        config["billing"]["synova"] = {"limits": {"devices": 1}, "pool": {"essential": 1, "intelligence": 0}}
        config["devices"] = {"synova:existing": {"version": "1.0"}}
        self.assertTrue(device_allowed(config, "synova", "existing"))
        self.assertFalse(device_allowed(config, "synova", "new-host"))

    def test_readiness_requires_evidence_not_static_flags(self):
        config = default_config()
        snapshot = readiness_snapshot(config, "synova")
        checks = {item["id"]: item for item in snapshot["checks"]}
        self.assertFalse(checks["identity"]["ok"])
        self.assertFalse(checks["release"]["ok"])


if __name__ == "__main__":
    unittest.main()
