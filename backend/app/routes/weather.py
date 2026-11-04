"""
Weather Road Risk Warning Endpoint
==================================
GET /api/weather/warning?latitude=...&longitude=...
Fetches cached live meteorological data from Open-Meteo and applies
two-wheeler safety thresholds (wet road, crosswinds, visibility, storms).
"""

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from typing import Optional, List
from backend.app import weather

router = APIRouter(prefix="/api/weather", tags=["Weather Road Risk"])


class WeatherWarningResponse(BaseModel):
    status: str
    source: Optional[str] = None
    latitude: float
    longitude: float
    data_timestamp: Optional[str] = None
    cache_age_seconds: Optional[float] = None
    is_stale: bool = False
    temperature_c: Optional[float] = None
    apparent_temperature_c: Optional[float] = None
    humidity_percent: Optional[float] = None
    precipitation_mm: Optional[float] = None
    rain_mm: Optional[float] = None
    weather_code: Optional[int] = None
    weather_description: Optional[str] = None
    wind_speed_kmh: Optional[float] = None
    wind_gusts_kmh: Optional[float] = None
    visibility_m: Optional[float] = None
    risk_level: str  # "NORMAL" | "CAUTION" | "HIGH_CAUTION"
    primary_warning: str
    active_hazards: List[str] = []
    error_detail: Optional[str] = None
    attribution: str
    disclaimer: str


@router.get("/warning", response_model=WeatherWarningResponse)
def get_weather_warning_for_coords(
    latitude: float = Query(..., ge=-90.0, le=90.0, description="WGS84 GPS Latitude"),
    longitude: float = Query(..., ge=-180.0, le=180.0, description="WGS84 GPS Longitude")
):
    """
    Returns live weather conditions and two-wheeler road hazard assessment
    for the specified coordinates.
    """
    res = weather.get_weather_warning(latitude, longitude)
    return res
