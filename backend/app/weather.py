"""
EVEN Weather Road Risk Engine
=============================
Retrieves live atmospheric data via Open-Meteo (free, no API key required)
and computes explainable two-wheeler road safety warnings.

Key Architectural Principles:
1. Uses Open-Meteo REST API (open-source meteorological model data).
2. Strict non-commercial attribution: "Weather data by Open-Meteo.com (CC BY 4.0)".
3. In-memory coordinate cache (rounded to 2 decimal places ~1.1km) with 10-minute TTL
   to prevent excessive polling during GPS telemetry updates.
4. Transparent, documented warning thresholds separating raw sensor values from risk categories.
5. Explicit safety disclaimer: Weather advisory data alone does not predict road accidents.
"""

import time
import json
import logging
import urllib.request
import urllib.error
from typing import Dict, Any, Optional, Tuple, List
from threading import Lock
from datetime import datetime, timezone

logger = logging.getLogger("even.weather")

# Cache: (round(lat, 2), round(lon, 2)) -> { "data": dict, "cached_at": float }
_WEATHER_CACHE: Dict[Tuple[float, float], Dict[str, Any]] = {}
_WEATHER_LOCK = Lock()
_LAST_REQUEST_TIME: float = 0.0

CACHE_TTL_SECONDS = 600.0  # 10 minutes cache
STALE_THRESHOLD_SECONDS = 900.0  # 15 minutes before marking stale

OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast"
ATTRIBUTION = "Weather data by Open-Meteo.com (CC BY 4.0)"
DISCLAIMER = (
    "Weather road safety ratings are advisory atmospheric risk assessments. "
    "Weather conditions alone do not predict traffic accidents; road surface integrity, "
    "rider vigilance, tire condition, and speed are primary factors."
)

# WMO Weather interpretation codes (WW)
WMO_DESCRIPTIONS: Dict[int, str] = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow fall",
    73: "Moderate snow fall",
    75: "Heavy snow fall",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
}


def evaluate_weather_road_risk(
    temp_c: float,
    precip_mm: float,
    rain_mm: float,
    weather_code: int,
    wind_speed_kmh: float,
    wind_gusts_kmh: float,
    visibility_m: Optional[float] = None
) -> Tuple[str, str, List[str]]:
    """
    Evaluates road risk for motorcycles based on transparent, documented thresholds.
    Returns:
        (risk_level, primary_warning, active_hazards)
        risk_level is one of: 'NORMAL', 'CAUTION', 'HIGH_CAUTION'
    """
    active_hazards: List[str] = []
    level_order = {"NORMAL": 0, "CAUTION": 1, "HIGH_CAUTION": 2}
    current_level = "NORMAL"

    def elevate(new_level: str):
        nonlocal current_level
        if level_order[new_level] > level_order[current_level]:
            current_level = new_level

    # Rule 1: Thunderstorm (WMO 95, 96, 99)
    if weather_code in {95, 96, 99}:
        elevate("HIGH_CAUTION")
        active_hazards.append(
            "Severe Thunderstorm Alert: Lightning danger, flash flooding risk, and sudden violent squalls. Seek covered shelter off roadway."
        )

    # Rule 2: Heavy Precipitation / Hydroplaning (Rain >= 2.5mm/h or WMO heavy rain)
    if precip_mm >= 2.5 or rain_mm >= 2.5 or weather_code in {65, 67, 75, 82, 96, 99}:
        elevate("HIGH_CAUTION")
        active_hazards.append(
            f"Heavy Rain ({precip_mm:.1f} mm/h): Standing water & high hydroplaning risk. Helmet visor visibility severely degraded. Reduce speed & increase following distance."
        )
    # Rule 3: Wet Road / Light Precipitation (Precipitation > 0.0 mm/h or WMO rain/drizzle)
    elif precip_mm > 0.0 or rain_mm > 0.0 or weather_code in {51, 53, 55, 56, 57, 61, 63, 66, 80, 81}:
        elevate("CAUTION")
        active_hazards.append(
            f"Wet Road Warning ({precip_mm:.1f} mm/h): Surface friction reduced. Paint markings, manhole covers, and metal bridge expansion joints become exceptionally slick."
        )

    # Rule 4: Strong Winds & Gusts
    if wind_speed_kmh >= 38.0 or wind_gusts_kmh >= 52.0:
        elevate("HIGH_CAUTION")
        active_hazards.append(
            f"Gale-Force Crosswinds ({wind_speed_kmh:.0f} km/h, gusts {wind_gusts_kmh:.0f} km/h): Severe lateral force on motorcycle. High lane deviation risk on bridges and open corridors."
        )
    elif wind_speed_kmh >= 25.0 or wind_gusts_kmh >= 38.0:
        elevate("CAUTION")
        active_hazards.append(
            f"Moderate Crosswind ({wind_speed_kmh:.0f} km/h, gusts {wind_gusts_kmh:.0f} km/h): Steady lateral push. Grip handlebars firmly with relaxed elbows and expect turbulence around large vehicles."
        )

    # Rule 5: Low Visibility / Fog
    if visibility_m is not None:
        if visibility_m < 500:
            elevate("HIGH_CAUTION")
            active_hazards.append(
                f"Extremely Low Visibility ({visibility_m:.0f}m): Stopping sight distance critically compromised. Use low-beam lighting and avoid rapid lane changes."
            )
        elif visibility_m < 1000:
            elevate("CAUTION")
            active_hazards.append(
                f"Reduced Visibility ({visibility_m:.0f}m): Mist/fog hazard delay. Increase following distance by at least 3 seconds."
            )
    elif weather_code in {45, 48}:
        elevate("CAUTION")
        active_hazards.append(
            "Fog Warning: Visual range compromised. Turn on low-beam headlights and slow down."
        )

    # Rule 6: Freezing / Sub-Zero Asphalt
    if temp_c <= 2.0:
        elevate("HIGH_CAUTION")
        active_hazards.append(
            f"Near-Freezing Temperature ({temp_c:.1f}°C): High probability of black ice on shaded asphalt, flyovers, and elevated structures."
        )

    if current_level == "NORMAL":
        primary_warning = "Dry Road Conditions: Normal atmospheric stability. Standard tire traction expected."
    elif current_level == "CAUTION":
        primary_warning = active_hazards[0] if active_hazards else "Atmospheric Caution: Wet or breezy conditions present."
    else:
        primary_warning = active_hazards[0] if active_hazards else "High Weather Caution: Hazardous road conditions detected."

    return current_level, primary_warning, active_hazards


def get_weather_warning(latitude: float, longitude: float) -> Dict[str, Any]:
    """
    Fetches weather data for coordinates (from cache or Open-Meteo) and evaluates road safety.
    """
    global _LAST_REQUEST_TIME

    if not (-90.0 <= latitude <= 90.0 and -180.0 <= longitude <= 180.0):
        return {
            "status": "invalid_coordinates",
            "latitude": latitude,
            "longitude": longitude,
            "error_detail": "Latitude must be between -90 and 90, longitude between -180 and 180.",
            "attribution": ATTRIBUTION,
            "disclaimer": DISCLAIMER
        }

    cache_key = (round(latitude, 2), round(longitude, 2))
    now = time.time()

    # Check cache
    if cache_key in _WEATHER_CACHE:
        entry = _WEATHER_CACHE[cache_key]
        age = now - entry["cached_at"]
        if age < CACHE_TTL_SECONDS:
            cached_result = dict(entry["result"])
            cached_result["status"] = "cached"
            cached_result["cache_age_seconds"] = round(age, 1)
            cached_result["is_stale"] = age > STALE_THRESHOLD_SECONDS
            return cached_result

    # Outbound request to Open-Meteo
    with _WEATHER_LOCK:
        # Check cache once more inside lock
        if cache_key in _WEATHER_CACHE:
            entry = _WEATHER_CACHE[cache_key]
            age = now - entry["cached_at"]
            if age < CACHE_TTL_SECONDS:
                cached_result = dict(entry["result"])
                cached_result["status"] = "cached"
                cached_result["cache_age_seconds"] = round(age, 1)
                cached_result["is_stale"] = age > STALE_THRESHOLD_SECONDS
                return cached_result

        # Throttle outbound requests
        elapsed = now - _LAST_REQUEST_TIME
        if elapsed < 2.0:
            time.sleep(2.0 - elapsed)

        req_url = (
            f"{OPEN_METEO_BASE}?"
            f"latitude={latitude:.4f}&longitude={longitude:.4f}"
            f"&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m,wind_gusts_10m"
            f"&hourly=visibility"
            f"&timezone=auto"
            f"&forecast_days=1"
        )

        req = urllib.request.Request(
            req_url,
            headers={
                "User-Agent": "EVEN-RoadSafety-Weather-Module/1.0 (contact: hackathon@even-safety.org)",
                "Accept": "application/json"
            }
        )

        try:
            with urllib.request.urlopen(req, timeout=5.0) as resp:
                _LAST_REQUEST_TIME = time.time()
                raw = resp.read().decode("utf-8")
                api_data = json.loads(raw)

            current = api_data.get("current", {})
            temp_c = float(current.get("temperature_2m", 25.0))
            apparent_temp_c = float(current.get("apparent_temperature", temp_c))
            humidity_pct = float(current.get("relative_humidity_2m", 50.0))
            precip_mm = float(current.get("precipitation", 0.0))
            rain_mm = float(current.get("rain", 0.0))
            code = int(current.get("weather_code", 0))
            wind_speed = float(current.get("wind_speed_10m", 0.0))
            wind_gusts = float(current.get("wind_gusts_10m", wind_speed))
            data_time = current.get("time") or datetime.now(timezone.utc).isoformat()

            # Extract current hour visibility if available
            visibility_m: Optional[float] = None
            hourly = api_data.get("hourly", {})
            if "visibility" in hourly and hourly["visibility"]:
                vis_list = hourly["visibility"]
                if len(vis_list) > 0:
                    visibility_m = float(vis_list[0])

            weather_desc = WMO_DESCRIPTIONS.get(code, "Unknown Conditions")

            # Evaluate Road Risk
            risk_level, primary_warning, active_hazards = evaluate_weather_road_risk(
                temp_c=temp_c,
                precip_mm=precip_mm,
                rain_mm=rain_mm,
                weather_code=code,
                wind_speed_kmh=wind_speed,
                wind_gusts_kmh=wind_gusts,
                visibility_m=visibility_m
            )

            result = {
                "status": "success",
                "source": "open_meteo",
                "latitude": latitude,
                "longitude": longitude,
                "data_timestamp": data_time,
                "is_stale": False,
                "temperature_c": temp_c,
                "apparent_temperature_c": apparent_temp_c,
                "humidity_percent": humidity_pct,
                "precipitation_mm": precip_mm,
                "rain_mm": rain_mm,
                "weather_code": code,
                "weather_description": weather_desc,
                "wind_speed_kmh": wind_speed,
                "wind_gusts_kmh": wind_gusts,
                "visibility_m": visibility_m,
                "risk_level": risk_level,
                "primary_warning": primary_warning,
                "active_hazards": active_hazards,
                "attribution": ATTRIBUTION,
                "disclaimer": DISCLAIMER
            }

            _WEATHER_CACHE[cache_key] = {
                "result": result,
                "cached_at": time.time()
            }
            logger.info(f"[Weather] Fetched {latitude:.2f},{longitude:.2f}: {weather_desc}, risk={risk_level}")
            return result

        except Exception as exc:
            logger.warning(f"[Weather] Open-Meteo request failed: {exc}")
            # If we have an expired cache entry, return it marked stale rather than failing
            if cache_key in _WEATHER_CACHE:
                fallback = dict(_WEATHER_CACHE[cache_key]["result"])
                fallback["status"] = "stale_cache"
                fallback["is_stale"] = True
                fallback["error_detail"] = f"Network offline ({exc}). Displaying cached weather."
                return fallback

            return {
                "status": "offline",
                "source": "unavailable",
                "latitude": latitude,
                "longitude": longitude,
                "data_timestamp": datetime.now(timezone.utc).isoformat(),
                "is_stale": True,
                "temperature_c": None,
                "precipitation_mm": None,
                "weather_description": "Weather Service Offline",
                "risk_level": "NORMAL",
                "primary_warning": "Atmospheric data unavailable. Observe local roadside visibility and surface conditions directly.",
                "active_hazards": [],
                "error_detail": f"Weather API unreachable: {exc}",
                "attribution": ATTRIBUTION,
                "disclaimer": DISCLAIMER
            }
