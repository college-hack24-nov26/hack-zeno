export type HazardType =
  | 'pothole'
  | 'obstacle'
  | 'roadblock'
  | 'unsafe_condition'
  | 'oil_spill'
  | 'gravel'
  | 'unmarked_speed_bump'
  | 'broken_surface'
  | 'waterlogging'
  | 'debris'
  | 'road_works';

export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

export type ConfirmationStatus = 'unconfirmed' | 'confirmed' | 'investigating' | 'resolved';

export type HazardSource = 'edge_vision' | 'rider_manual' | 'fleet_telemetry';

export type LocationSource = 'device_gps' | 'manual' | 'video_track' | 'video_unlocalized';

export interface Hazard {
  id: number;
  hazard_type: HazardType;
  severity: SeverityLevel;
  latitude: number;
  longitude: number;
  description: string;
  reported_at: string;
  confirmation_status: ConfirmationStatus;
  confidence: number;
  source: HazardSource;
  image_path?: string | null;
  corroboration_count?: number;
  status_reason?: string | null;
  location_accuracy?: number | null;
  location_timestamp?: string | null;
  location_source?: LocationSource;
  resolved_address?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface HazardCreate {
  hazard_type: HazardType;
  severity: SeverityLevel;
  latitude: number;
  longitude: number;
  description: string;
  reported_at?: string;
  confirmation_status?: ConfirmationStatus;
  confidence?: number;
  source?: HazardSource;
  image_path?: string | null;
  corroboration_count?: number;
  status_reason?: string | null;
  location_accuracy?: number | null;
  location_timestamp?: string | null;
  location_source?: LocationSource;
  resolved_address?: string | null;
}

export interface HazardUpdate {
  hazard_type?: HazardType;
  severity?: SeverityLevel;
  latitude?: number;
  longitude?: number;
  description?: string;
  confirmation_status?: ConfirmationStatus;
  confidence?: number;
  source?: HazardSource;
  image_path?: string | null;
  corroboration_count?: number;
  status_reason?: string | null;
  location_accuracy?: number | null;
  location_timestamp?: string | null;
  location_source?: LocationSource;
  resolved_address?: string | null;
}

export interface HealthResponse {
  status: string;
  app: string;
  version: string;
  timestamp: string;
  database: string;
  total_hazards: number;
  corroborated_hazards: number;
}

export interface HazardSummary {
  total_hazards: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  confirmed_count: number;
  unconfirmed_count: number;
  resolved_count: number;
  active_riders_simulated: number;
  severity_breakdown: Record<string, number>;
  type_breakdown: Record<string, number>;
  recent_activity: Hazard[];
}

export interface MaintenancePriorityItem {
  hazard_id: number;
  hazard_type: HazardType;
  severity: SeverityLevel;
  latitude: number;
  longitude: number;
  description: string;
  confirmation_status: ConfirmationStatus;
  confidence: number;
  corroboration_count: number;
  status_reason: string;
  reported_at: string;
  priority_score: number;
  recommended_action: string;
}

export interface SpatialCluster {
  cluster_id: number;
  center_latitude: number;
  center_longitude: number;
  hazard_count: number;
  has_critical: boolean;
  primary_type: HazardType;
  hazard_ids: number[];
  risk_level: string;
}

export interface ReportTrend {
  date: string;
  count: number;
}

export interface SampleSector {
  zone: string;
  road_condition_index: string;
  planning_note: string;
  data_mode: string;
}

export interface UrbanIntelligenceData {
  total_active_hazards: number;
  priority_maintenance_queue: MaintenancePriorityItem[];
  real_spatial_clusters: SpatialCluster[];
  report_trends: ReportTrend[];
  type_distribution: Record<string, number>;
  severity_distribution: Record<string, number>;
  municipal_sectors_sample: SampleSector[];
  data_source_badge: string;
}

// ---- Pothole Detection (ONNX inference) ----

export interface DetectionBBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height: number;
}

export interface DetectionResult {
  class_id: number;
  class_name: string;        // always "pothole" for this model
  confidence: number;        // raw model confidence [0..1] — NOT the same as hazard severity
  bbox_pixels: DetectionBBox;
}

export interface DetectHazardResponse {
  inference_status: 'ok' | 'no_detections' | 'model_not_loaded' | 'error';
  model_name: string;
  model_source?: string;
  model_license?: string;
  architecture?: string;
  detection_count: number;
  detections: DetectionResult[];
  annotated_image_b64?: string | null;  // base64 JPEG with drawn bounding boxes
  error_detail?: string | null;
  disclaimer: string;
}

// ---- Reverse Geocoding ----

export interface ReverseGeocodeResult {
  status: 'success' | 'local_cache' | 'offline' | 'service_unavailable' | 'invalid_coordinates';
  source?: string;
  latitude: number;
  longitude: number;
  resolved_address?: string | null;
  road?: string | null;
  neighbourhood?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  full_display_name?: string | null;
  error_detail?: string | null;
  attribution: string;
  disclaimer: string;
}

// ---- Road Video Analyzer ----

export interface VideoFrameDetection {
  timestamp_sec: number;
  formatted_time: string;
  detections: DetectionResult[];
  annotated_b64?: string | null;
}

export interface VideoPotholeTrack {
  track_id: string;
  first_seen_sec: number;
  last_seen_sec: number;
  formatted_time_range: string;
  frame_count: number;
  peak_confidence: number;
  best_bbox: DetectionBBox;
  best_annotated_b64?: string | null;
  dedup_explanation: string;
  location_note: string;
  suggested_severity: SeverityLevel;
  track_type?: 'verified_track' | 'ai_prediction' | 'stationary_vehicle';
  is_stationary?: boolean;
}

// ---- Weather Road Risk ----

export type WeatherRiskLevel = 'NORMAL' | 'CAUTION' | 'HIGH_CAUTION';

export interface WeatherWarningResponse {
  status: 'success' | 'cached' | 'stale_cache' | 'offline' | 'invalid_coordinates';
  source?: string;
  latitude: number;
  longitude: number;
  data_timestamp?: string | null;
  cache_age_seconds?: number | null;
  is_stale: boolean;
  temperature_c?: number | null;
  apparent_temperature_c?: number | null;
  humidity_percent?: number | null;
  precipitation_mm?: number | null;
  rain_mm?: number | null;
  weather_code?: number | null;
  weather_description?: string | null;
  wind_speed_kmh?: number | null;
  wind_gusts_kmh?: number | null;
  visibility_m?: number | null;
  risk_level: WeatherRiskLevel;
  primary_warning: string;
  active_hazards: string[];
  error_detail?: string | null;
  attribution: string;
  disclaimer: string;
}
