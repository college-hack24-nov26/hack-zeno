from typing import Optional, List, Literal, Dict
from pydantic import BaseModel, Field, field_validator
from datetime import datetime, timezone

# Supported hazard classifications including new types required by judges
HazardType = Literal[
    'pothole',
    'obstacle',
    'roadblock',
    'unsafe_condition',
    'oil_spill',
    'gravel',
    'unmarked_speed_bump',
    'broken_surface',
    'waterlogging',
    'debris',
    'road_works'
]

SeverityLevel = Literal['low', 'medium', 'high', 'critical']

# Supported verification states: unconfirmed (Unverified), confirmed (Corroborated), investigating (Under Review), resolved (Cleared)
ConfirmationStatus = Literal['unconfirmed', 'confirmed', 'investigating', 'resolved']

HazardSource = Literal['edge_vision', 'rider_manual', 'fleet_telemetry']

class HazardBase(BaseModel):
    hazard_type: HazardType = Field(..., description="Classification category of the hazard")
    severity: SeverityLevel = Field(..., description="Risk severity rating")
    latitude: float = Field(..., ge=-90.0, le=90.0, description="WGS84 GPS latitude")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="WGS84 GPS longitude")
    description: str = Field(..., min_length=2, max_length=500, description="Rider-facing description of the hazard")
    confirmation_status: ConfirmationStatus = Field(default='unconfirmed', description="Multi-rider validation status")
    confidence: float = Field(default=0.75, ge=0.0, le=1.0, description="Reliability score from 0.0 to 1.0")
    source: HazardSource = Field(default='rider_manual', description="Origin of the hazard report")
    image_path: Optional[str] = Field(default=None, description="Path or URL to evidence photo")
    corroboration_count: int = Field(default=0, ge=0, description="Number of independent reports confirming this hazard")
    status_reason: Optional[str] = Field(default=None, description="Explainable justification for the hazard status")
    location_accuracy: Optional[float] = Field(default=None, description="GPS accuracy radius in meters (WGS84 horizontal)")
    location_timestamp: Optional[str] = Field(default=None, description="ISO timestamp when GPS fix was acquired")
    location_source: Optional[str] = Field(default='manual', description="Location origin: 'device_gps' | 'manual' | 'video_track' | 'video_unlocalized'")
    resolved_address: Optional[str] = Field(default=None, description="Human-readable address resolved via reverse geocoding")

class HazardCreate(HazardBase):
    reported_at: Optional[str] = Field(default=None, description="ISO timestamp of detection")

    @field_validator('reported_at', mode='before')
    def set_reported_at(cls, v):
        if not v:
            return datetime.now(timezone.utc).isoformat()
        return v

class HazardUpdate(BaseModel):
    hazard_type: Optional[HazardType] = None
    severity: Optional[SeverityLevel] = None
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0)
    description: Optional[str] = Field(None, min_length=2, max_length=500)
    confirmation_status: Optional[ConfirmationStatus] = None
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0)
    source: Optional[HazardSource] = None
    image_path: Optional[str] = None
    corroboration_count: Optional[int] = Field(None, ge=0)
    status_reason: Optional[str] = None
    location_accuracy: Optional[float] = None
    location_timestamp: Optional[str] = None
    location_source: Optional[str] = None
    resolved_address: Optional[str] = None

class HazardResponse(HazardBase):
    id: int
    reported_at: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True

class HealthResponse(BaseModel):
    status: str
    app: str
    version: str
    timestamp: str
    database: str
    total_hazards: int
    corroborated_hazards: int

class HazardSummary(BaseModel):
    total_hazards: int
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int
    confirmed_count: int
    unconfirmed_count: int
    resolved_count: int
    active_riders_simulated: int
    severity_breakdown: Dict[str, int]
    type_breakdown: Dict[str, int]
    recent_activity: List[HazardResponse]

class PhotoUploadResponse(BaseModel):
    status: str
    image_path: str
    filename: str
    size_bytes: int
