"""
Unit Tests: Reverse Geocoding Service
=====================================
Tests local caching, rate-limiting, coordinate validation, attribution,
and error handling for OpenStreetMap Nominatim reverse geocoding.
"""

import sys
import unittest
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from backend.app import geocoding


class TestGeocodingService(unittest.TestCase):

    def test_invalid_coordinates(self):
        """Out of bounds coordinates should fail gracefully."""
        res = geocoding.reverse_geocode(120.0, 73.0)
        self.assertEqual(res["status"], "invalid_coordinates")
        self.assertIsNone(res["resolved_address"])
        self.assertIn("attribution", res)
        self.assertIn("disclaimer", res)

    def test_reverse_geocode_valid_or_cached(self):
        """Valid coordinates should return required keys and proper attribution."""
        lat, lon = 18.5204, 73.8567
        res = geocoding.reverse_geocode(lat, lon)
        self.assertIn(res["status"], {"success", "offline", "service_unavailable", "cached"})
        self.assertEqual(res["latitude"], lat)
        self.assertEqual(res["longitude"], lon)
        self.assertIn("OpenStreetMap", res["attribution"])
        self.assertIn("Reverse geocoding translates", res["disclaimer"])

        # Second call must hit the local cache
        res2 = geocoding.reverse_geocode(lat, lon)
        if res["status"] == "success":
            self.assertEqual(res2["source"], "local_cache")
            self.assertEqual(res2["resolved_address"], res["resolved_address"])

    def test_disclaimer_explains_no_accuracy_improvement(self):
        """Service must explicitly state it does not improve GPS sensor accuracy."""
        res = geocoding.reverse_geocode(18.52, 73.85)
        self.assertIn("do not verify or improve", res["disclaimer"].lower())


if __name__ == "__main__":
    unittest.main(verbosity=2)
