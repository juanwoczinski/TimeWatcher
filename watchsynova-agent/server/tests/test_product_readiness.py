import os
import unittest

# The module reads this at import time.  Unit tests exercise only pure helpers.
os.environ.setdefault("WATCHSYNOVA_INGEST_TOKEN", "test-token")

from ingest_server import aggregate_productivity_scores, default_config, device_allowed, productivity_score, readiness_snapshot


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

    def test_productivity_score_is_explainable_and_coverage_adjusted(self):
        result = productivity_score({
            "trackedSeconds": 3600, "activeSeconds": 3240, "expectedSeconds": 3600,
            "scheduledActiveSeconds": 3240, "inputSeconds": 360, "presses": 600,
            "clicks": 180, "hasWindowSignal": True, "hasAfkSignal": True,
            "hasWebSignal": True, "hasInputSignal": True,
            "appCategories": {"productive": 2400, "neutral": 600, "unproductive": 600},
            "urlCategories": {"productive": 900, "neutral": 300, "unproductive": 0},
        })
        self.assertEqual(result["coverage"], 100)
        self.assertTrue(result["sufficientData"])
        self.assertEqual(set(result["components"]), {"apps", "urls", "schedule", "utilization", "interaction"})
        self.assertGreater(result["score"], 70)

    def test_missing_collectors_reduce_coverage_without_becoming_hidden(self):
        result = productivity_score({
            "trackedSeconds": 3600, "activeSeconds": 3600, "hasWindowSignal": True,
            "appCategories": {"productive": 3600, "neutral": 0, "unproductive": 0},
        })
        self.assertEqual(result["coverage"], 30)
        self.assertFalse(result["sufficientData"])
        self.assertIn("URLs", result["missingSignals"])
        self.assertLess(result["score"], result["rawScore"])

    def test_organization_rollup_counts_scheduled_person_without_data(self):
        productive = productivity_score({"trackedSeconds": 3600, "activeSeconds": 3600, "expectedSeconds": 3600, "scheduledActiveSeconds": 3600, "hasWindowSignal": True, "hasAfkSignal": True, "appCategories": {"productive": 3600}})
        missing = productivity_score({"expectedSeconds": 3600})
        result = aggregate_productivity_scores([
            {"expectedSeconds": 3600, "trackedSeconds": 3600, "productivityScore": productive},
            {"expectedSeconds": 3600, "trackedSeconds": 0, "productivityScore": missing},
        ])
        self.assertEqual(result["people"], 2)
        self.assertEqual(result["peopleInsufficient"], 1)
        self.assertLess(result["score"], productive["score"])


if __name__ == "__main__":
    unittest.main()
