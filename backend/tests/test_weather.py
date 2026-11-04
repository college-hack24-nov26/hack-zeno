"""
Unit Tests: Weather Road Risk Engine
====================================
Tests the transparent threshold rules for motorcycle road hazard warnings:
wet road friction, hydroplaning, gale winds, fog, thunderstorms, and black ice.
"""

import sys
import unittest
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from backend.app import weather


class TestWeatherRiskRules(unittest.TestCase):

    def test_clear_dry_conditions(self):
        """Dry road with light breeze must evaluate to NORMAL."""
        level, primary, hazards = weather.evaluate_weather_road_risk(
            temp_c=25.0,
            precip_mm=0.0,
            rain_mm=0.0,
            weather_code=0,  # Clear sky
            wind_speed_kmh=10.0,
            wind_gusts_kmh=15.0,
            visibility_m=10000.0
        )
        self.assertEqual(level, "NORMAL")
        self.assertIn("Dry Road Conditions", primary)
        self.assertEqual(len(hazards), 0)

    def test_light_rain_wet_road_caution(self):
        """Light rain (> 0.0mm/h or WMO 61) must trigger CAUTION wet road warning."""
        level, primary, hazards = weather.evaluate_weather_road_risk(
            temp_c=22.0,
            precip_mm=0.8,
            rain_mm=0.8,
            weather_code=61,  # Slight rain
            wind_speed_kmh=12.0,
            wind_gusts_kmh=18.0,
            visibility_m=6000.0
        )
        self.assertEqual(level, "CAUTION")
        self.assertTrue(any("Wet Road Warning" in h for h in hazards))
        self.assertTrue(any("slick" in h.lower() for h in hazards))

    def test_heavy_precipitation_high_caution(self):
        """Precipitation >= 2.5mm/h must trigger HIGH_CAUTION hydroplaning warning."""
        level, primary, hazards = weather.evaluate_weather_road_risk(
            temp_c=20.0,
            precip_mm=4.5,
            rain_mm=4.5,
            weather_code=65,  # Heavy rain
            wind_speed_kmh=15.0,
            wind_gusts_kmh=22.0,
            visibility_m=3000.0
        )
        self.assertEqual(level, "HIGH_CAUTION")
        self.assertTrue(any("hydroplaning" in h.lower() for h in hazards))

    def test_thunderstorm_severe_warning(self):
        """WMO 95 must trigger HIGH_CAUTION thunderstorm warning."""
        level, primary, hazards = weather.evaluate_weather_road_risk(
            temp_c=24.0,
            precip_mm=1.0,
            rain_mm=1.0,
            weather_code=95,  # Thunderstorm
            wind_speed_kmh=20.0,
            wind_gusts_kmh=30.0,
            visibility_m=5000.0
        )
        self.assertEqual(level, "HIGH_CAUTION")
        self.assertTrue(any("Thunderstorm" in h for h in hazards))

    def test_moderate_crosswind(self):
        """Wind 28 km/h must trigger CAUTION crosswind advisory."""
        level, primary, hazards = weather.evaluate_weather_road_risk(
            temp_c=25.0,
            precip_mm=0.0,
            rain_mm=0.0,
            weather_code=0,
            wind_speed_kmh=28.0,
            wind_gusts_kmh=35.0,
            visibility_m=10000.0
        )
        self.assertEqual(level, "CAUTION")
        self.assertTrue(any("Crosswind" in h for h in hazards))

    def test_gale_force_crosswind_high_caution(self):
        """Wind gusts >= 52 km/h must trigger HIGH_CAUTION stability warning."""
        level, primary, hazards = weather.evaluate_weather_road_risk(
            temp_c=24.0,
            precip_mm=0.0,
            rain_mm=0.0,
            weather_code=0,
            wind_speed_kmh=40.0,
            wind_gusts_kmh=58.0,
            visibility_m=10000.0
        )
        self.assertEqual(level, "HIGH_CAUTION")
        self.assertTrue(any("Gale-Force Crosswinds" in h for h in hazards))

    def test_dense_fog_low_visibility(self):
        """Visibility < 500m must trigger HIGH_CAUTION visibility warning."""
        level, primary, hazards = weather.evaluate_weather_road_risk(
            temp_c=16.0,
            precip_mm=0.0,
            rain_mm=0.0,
            weather_code=45,  # Fog
            wind_speed_kmh=5.0,
            wind_gusts_kmh=8.0,
            visibility_m=350.0
        )
        self.assertEqual(level, "HIGH_CAUTION")
        self.assertTrue(any("Low Visibility" in h for h in hazards))

    def test_near_freezing_black_ice(self):
        """Temperature <= 2.0C must trigger HIGH_CAUTION black ice alert."""
        level, primary, hazards = weather.evaluate_weather_road_risk(
            temp_c=1.5,
            precip_mm=0.0,
            rain_mm=0.0,
            weather_code=0,
            wind_speed_kmh=10.0,
            wind_gusts_kmh=12.0,
            visibility_m=8000.0
        )
        self.assertEqual(level, "HIGH_CAUTION")
        self.assertTrue(any("black ice" in h.lower() for h in hazards))


class TestWeatherServiceIntegration(unittest.TestCase):

    def test_coordinate_validation(self):
        """Coordinates outside -90..90, -180..180 must return invalid_coordinates."""
        res = weather.get_weather_warning(150.0, 73.0)
        self.assertEqual(res["status"], "invalid_coordinates")

    def test_valid_weather_fetch_or_cache(self):
        """Valid query must return attribution, disclaimer, and road risk fields."""
        lat, lon = 18.52, 73.85
        res = weather.get_weather_warning(lat, lon)
        self.assertIn(res["status"], {"success", "cached", "offline", "stale_cache"})
        self.assertIn("Open-Meteo", res["attribution"])
        self.assertIn("advisory atmospheric risk assessments", res["disclaimer"])
        self.assertIn(res["risk_level"], {"NORMAL", "CAUTION", "HIGH_CAUTION"})

        # Second request must hit the memory cache
        res2 = weather.get_weather_warning(lat, lon)
        if res["status"] in {"success", "cached"}:
            self.assertEqual(res2["status"], "cached")


if __name__ == "__main__":
    unittest.main(verbosity=2)
