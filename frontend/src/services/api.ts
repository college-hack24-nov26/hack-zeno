import type {
  Hazard,
  HazardCreate,
  HazardUpdate,
  HealthResponse,
  HazardSummary,
  UrbanIntelligenceData,
  DetectHazardResponse,
  ReverseGeocodeResult,
  WeatherWarningResponse
} from '../types/hazard';

const API_BASE = '/api';

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) {
    throw new Error(`Health check failed with status: ${res.status}`);
  }
  return res.json();
}

export async function fetchHazards(filters?: {
  hazard_type?: string;
  severity?: string;
  confirmation_status?: string;
  limit?: number;
}): Promise<Hazard[]> {
  const params = new URLSearchParams();
  if (filters?.hazard_type && filters.hazard_type !== 'all') params.set('hazard_type', filters.hazard_type);
  if (filters?.severity && filters.severity !== 'all') params.set('severity', filters.severity);
  if (filters?.confirmation_status && filters.confirmation_status !== 'all') params.set('confirmation_status', filters.confirmation_status);
  if (filters?.limit) params.set('limit', filters.limit.toString());

  const url = `${API_BASE}/hazards${params.toString() ? '?' + params.toString() : ''}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch hazards (${res.status})`);
  }
  return res.json();
}

export async function fetchHazard(id: number): Promise<Hazard> {
  const res = await fetch(`${API_BASE}/hazards/${id}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch hazard #${id} (${res.status})`);
  }
  return res.json();
}

export async function createHazard(data: HazardCreate): Promise<Hazard> {
  const res = await fetch(`${API_BASE}/hazards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to create hazard (${res.status})`);
  }
  return res.json();
}

export async function updateHazard(id: number, data: HazardUpdate): Promise<Hazard> {
  const res = await fetch(`${API_BASE}/hazards/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to update hazard #${id} (${res.status})`);
  }
  return res.json();
}

export async function deleteHazard(id: number): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_BASE}/hazards/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    throw new Error(`Failed to delete hazard #${id} (${res.status})`);
  }
  return res.json();
}

export async function uploadHazardPhoto(file: File): Promise<{ image_path: string; filename: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/hazards/upload-photo`, {
    method: 'POST',
    body: formData
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
    throw new Error(err.detail || `Photo upload failed (${res.status})`);
  }
  return res.json();
}

export async function recalculateCorroborations(): Promise<{ updated_count: number; message: string }> {
  const res = await fetch(`${API_BASE}/hazards/recalculate-corroboration`, {
    method: 'POST'
  });
  if (!res.ok) {
    throw new Error(`Recalculation failed (${res.status})`);
  }
  return res.json();
}

export async function fetchOverviewAnalytics(): Promise<HazardSummary> {
  const res = await fetch(`${API_BASE}/analytics/overview`);
  if (!res.ok) {
    throw new Error(`Failed to fetch analytics overview (${res.status})`);
  }
  return res.json();
}

export async function fetchUrbanIntelligence(): Promise<UrbanIntelligenceData> {
  const res = await fetch(`${API_BASE}/analytics/urban-intelligence`);
  if (!res.ok) {
    throw new Error(`Failed to fetch urban intelligence (${res.status})`);
  }
  return res.json();
}

/**
 * POST /api/detect-hazard
 * Runs local YOLOv8n ONNX pothole inference on the given image file.
 * Returns detection results including confidence and bounding boxes.
 * NOTE: detection confidence ≠ hazard severity. Do not use one to set the other.
 */
export async function detectHazard(file: File): Promise<DetectHazardResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/detect-hazard`, {
    method: 'POST',
    body: formData
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Detection request failed' }));
    throw new Error(err.detail || `Detection failed (${res.status})`);
  }
  return res.json();
}

/**
 * GET /api/geocode/reverse?latitude=...&longitude=...
 * Converts coordinates into a human-readable street address via cached Nominatim.
 */
export async function reverseGeocode(latitude: number, longitude: number): Promise<ReverseGeocodeResult> {
  const res = await fetch(`${API_BASE}/geocode/reverse?latitude=${latitude}&longitude=${longitude}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Geocoding failed' }));
    throw new Error(err.detail || `Geocoding request failed (${res.status})`);
  }
  return res.json();
}

/**
 * GET /api/weather/warning?latitude=...&longitude=...
 * Fetches cached meteorological data and two-wheeler road risk warnings from Open-Meteo.
 */
export async function fetchWeatherWarning(latitude: number, longitude: number): Promise<WeatherWarningResponse> {
  const res = await fetch(`${API_BASE}/weather/warning?latitude=${latitude}&longitude=${longitude}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Weather request failed' }));
    throw new Error(err.detail || `Weather failed (${res.status})`);
  }
  return res.json();
}
