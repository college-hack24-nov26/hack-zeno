"""
Reverse Geocoding Endpoint
==========================
GET /api/geocode/reverse?latitude=...&longitude=...
Translates GPS coordinates into a formatted street address using OpenStreetMap Nominatim
with rate-limiting and local caching.
"""

from fastapi import APIRouter, Query, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional
from backend.app import geocoding

router = APIRouter(prefix="/api/geocode", tags=["Geocoding"])


class ReverseGeocodeResponse(BaseModel):
    status: str
    source: Optional[str] = None
    latitude: float
    longitude: float
    resolved_address: Optional[str] = None
    road: Optional[str] = None
    neighbourhood: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    full_display_name: Optional[str] = None
    error_detail: Optional[str] = None
    attribution: str
    disclaimer: str


@router.get("/reverse", response_model=ReverseGeocodeResponse)
def reverse_geocode_coords(
    latitude: float = Query(..., ge=-90.0, le=90.0, description="WGS84 Latitude"),
    longitude: float = Query(..., ge=-180.0, le=180.0, description="WGS84 Longitude")
):
    """
    Reverse geocodes GPS coordinates to a human-readable street/area label.
    - Rate-limited to 1 req/sec.
    - Caches repeated lookups locally.
    - Preserves coordinates unchanged.
    """
    res = geocoding.reverse_geocode(latitude, longitude)
    return res
