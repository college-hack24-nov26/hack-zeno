"""
EVEN Reverse Geocoding Service
==============================
Provides cached, rate-limited reverse geocoding via OpenStreetMap Nominatim.

Compliance & Usage Policy Rules:
1. Max 1 request per second to OpenStreetMap Nominatim (enforced via thread lock & timestamp).
2. Proper identifying User-Agent header (required by OSM Nominatim usage policy).
3. In-memory coordinate cache (rounded to 4 decimal places, ~11 meters) to prevent duplicate lookups.
4. Mandatory attribution: "Data © OpenStreetMap contributors, ODbL 1.0".
5. Explicit accuracy disclaimer: Reverse geocoding translates coordinates into place names;
   it preserves original coordinates unchanged and does not improve GPS sensor accuracy.
6. Offline / timeout resilience: Returns fallback schema without crashing or fabricating addresses.
"""

import time
import json
import logging
import urllib.request
import urllib.error
from typing import Dict, Any, Optional
from threading import Lock

logger = logging.getLogger("even.geocoding")

# Cache mapping (round(lat, 4), round(lon, 4)) -> dict
_GEOCODE_CACHE: Dict[tuple, Dict[str, Any]] = {}
_RATE_LIMIT_LOCK = Lock()
_LAST_REQUEST_TIME: float = 0.0

NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
USER_AGENT = "EVEN-RoadSafety-Hackathon-Prototype/1.0 (contact: hackathon@even-safety.org)"
ATTRIBUTION = "Data © OpenStreetMap contributors, ODbL 1.0"
DISCLAIMER = (
    "Reverse geocoding translates GPS coordinates into a human-readable place label. "
    "Original coordinates are preserved unchanged. Place names do not verify or improve "
    "the physical accuracy of the GPS sensor measurement."
)


def _format_address(raw_data: Dict[str, Any]) -> str:
    """Extracts a clean, concise road/area/city label from Nominatim jsonv2."""
    addr = raw_data.get("address", {})
    parts = []

    # Road / Highway / Path
    road = addr.get("road") or addr.get("pedestrian") or addr.get("cycleway") or addr.get("highway")
    if road:
        parts.append(road)

    # Suburb / Neighbourhood
    area = addr.get("suburb") or addr.get("neighbourhood") or addr.get("residential") or addr.get("quarter")
    if area and area not in parts:
        parts.append(area)

    # City / Town / District
    city = addr.get("city") or addr.get("town") or addr.get("village") or addr.get("municipality")
    if city and city not in parts:
        parts.append(city)

    # State
    state = addr.get("state")
    if state and state not in parts and len(parts) < 3:
        parts.append(state)

    if parts:
        return ", ".join(parts)

    # Fallback to display_name truncated
    display = raw_data.get("display_name", "")
    if display:
        tokens = [t.strip() for t in display.split(",")]
        return ", ".join(tokens[:4])

    return "Unnamed Road / Segment"


def reverse_geocode(latitude: float, longitude: float) -> Dict[str, Any]:
    """
    Reverse geocodes latitude/longitude coordinates to a street address.
    Checks memory cache first, then throttled Nominatim query.
    """
    global _LAST_REQUEST_TIME

    # Validate coordinate range
    if not (-90.0 <= latitude <= 90.0 and -180.0 <= longitude <= 180.0):
        return {
            "status": "invalid_coordinates",
            "latitude": latitude,
            "longitude": longitude,
            "resolved_address": None,
            "error_detail": "Latitude must be between -90 and 90, longitude between -180 and 180.",
            "attribution": ATTRIBUTION,
            "disclaimer": DISCLAIMER
        }

    # Cache key rounded to ~11m precision (4 decimals)
    cache_key = (round(latitude, 4), round(longitude, 4))
    if cache_key in _GEOCODE_CACHE:
        cached = dict(_GEOCODE_CACHE[cache_key])
        cached["source"] = "local_cache"
        return cached

    # Rate limiting: wait until at least 1.05s since previous request
    with _RATE_LIMIT_LOCK:
        elapsed = time.time() - _LAST_REQUEST_TIME
        if elapsed < 1.05:
            time.sleep(1.05 - elapsed)

        req_url = f"{NOMINATIM_URL}?lat={latitude:.6f}&lon={longitude:.6f}&format=jsonv2&zoom=18&addressdetails=1"
        req = urllib.request.Request(
            req_url,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "application/json"
            }
        )

        try:
            with urllib.request.urlopen(req, timeout=4.5) as response:
                _LAST_REQUEST_TIME = time.time()
                raw_text = response.read().decode("utf-8")
                data = json.loads(raw_text)

            formatted_address = _format_address(data)
            addr_data = data.get("address", {})

            result = {
                "status": "success",
                "source": "nominatim_live",
                "latitude": latitude,
                "longitude": longitude,
                "resolved_address": formatted_address,
                "road": addr_data.get("road"),
                "neighbourhood": addr_data.get("suburb") or addr_data.get("neighbourhood"),
                "city": addr_data.get("city") or addr_data.get("town") or addr_data.get("village"),
                "state": addr_data.get("state"),
                "country": addr_data.get("country"),
                "full_display_name": data.get("display_name"),
                "attribution": ATTRIBUTION,
                "disclaimer": DISCLAIMER
            }

            _GEOCODE_CACHE[cache_key] = result
            logger.info(f"[Geocode] Resolved {latitude:.4f},{longitude:.4f} -> {formatted_address}")
            return result

        except urllib.error.HTTPError as he:
            logger.warning(f"[Geocode] HTTP error {he.code}: {he.reason}")
            return {
                "status": "service_unavailable",
                "source": "failed",
                "latitude": latitude,
                "longitude": longitude,
                "resolved_address": None,
                "error_detail": f"Nominatim HTTP {he.code}: {he.reason}. Coordinates preserved.",
                "attribution": ATTRIBUTION,
                "disclaimer": DISCLAIMER
            }
        except Exception as exc:
            logger.warning(f"[Geocode] Reverse geocoding offline or timed out: {exc}")
            return {
                "status": "offline",
                "source": "failed",
                "latitude": latitude,
                "longitude": longitude,
                "resolved_address": None,
                "error_detail": "Reverse geocoding network unavailable. Original GPS coordinates preserved.",
                "attribution": ATTRIBUTION,
                "disclaimer": DISCLAIMER
            }
