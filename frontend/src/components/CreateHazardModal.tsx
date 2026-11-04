import React, { useState } from 'react';
import {
  X,
  MapPin,
  AlertTriangle,
  Check,
  Loader2,
  Compass,
  Camera,
  Upload,
  Calendar,
  Image as ImageIcon,
  Info,
  ScanSearch,
  ShieldAlert,
  CircleAlert,
  Globe,
  Navigation,
  CheckCircle2
} from 'lucide-react';
import type { HazardCreate, HazardType, SeverityLevel, HazardSource, LocationSource } from '../types/hazard';
import type { DetectHazardResponse } from '../types/hazard';
import { uploadHazardPhoto, detectHazard, reverseGeocode } from '../services/api';

interface CreateHazardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: HazardCreate) => Promise<void>;
}

export const CreateHazardModal: React.FC<CreateHazardModalProps> = ({
  isOpen,
  onClose,
  onSubmit
}) => {
  const [hazardType, setHazardType] = useState<HazardType>('pothole');
  const [severity, setSeverity] = useState<SeverityLevel>('high');
  const [latitude, setLatitude] = useState<string>('18.5205');
  const [longitude, setLongitude] = useState<string>('73.8568');
  const [description, setDescription] = useState<string>('');
  const [reportedAt, setReportedAt] = useState<string>(
    new Date().toISOString().slice(0, 16)
  );
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [gpsLoading, setGpsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // GPS Telemetry & Reverse Geocoding state
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [locationTimestamp, setLocationTimestamp] = useState<string | null>(null);
  const [locationSource, setLocationSource] = useState<LocationSource>('manual');
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [isResolvingAddress, setIsResolvingAddress] = useState<boolean>(false);
  const [geocodeAttribution, setGeocodeAttribution] = useState<string | null>(null);

  // Detection state — kept completely separate from severity
  const [isDetecting, setIsDetecting] = useState<boolean>(false);
  const [detectionResult, setDetectionResult] = useState<DetectHazardResponse | null>(null);
  const [detectionError, setDetectionError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setError('Photo must be less than 10MB.');
        return;
      }
      setSelectedPhoto(file);
      const reader = new FileReader();
      reader.onload = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = () => {
    setSelectedPhoto(null);
    setPhotoPreview(null);
    setDetectionResult(null);
    setDetectionError(null);
  };

  const handleRunDetection = async () => {
    if (!selectedPhoto) return;
    setIsDetecting(true);
    setDetectionResult(null);
    setDetectionError(null);
    try {
      const result = await detectHazard(selectedPhoto);
      setDetectionResult(result);
    } catch (err: any) {
      setDetectionError(err?.message || 'Detection request failed.');
    } finally {
      setIsDetecting(false);
    }
  };

  const handleResolveAddress = async (latVal?: number, lngVal?: number) => {
    const lat = latVal !== undefined ? latVal : parseFloat(latitude);
    const lng = lngVal !== undefined ? lngVal : parseFloat(longitude);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setError('Please provide valid coordinates before resolving address.');
      return;
    }
    setIsResolvingAddress(true);
    try {
      const res = await reverseGeocode(lat, lng);
      if (res.resolved_address) {
        setResolvedAddress(res.resolved_address);
        setGeocodeAttribution(res.attribution);
      } else {
        setResolvedAddress(null);
        if (res.error_detail) {
          setError(`Address resolution: ${res.error_detail}`);
        }
      }
    } catch (err: any) {
      console.warn('Geocoding notice:', err);
      // Non-fatal: coordinates remain intact
    } finally {
      setIsResolvingAddress(false);
    }
  };

  const handleGetLocation = () => {
    if (!('geolocation' in navigator)) {
      setError('Geolocation is not supported by your browser.');
      setLocationSource('manual');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latStr = pos.coords.latitude.toFixed(6);
        const lngStr = pos.coords.longitude.toFixed(6);
        setLatitude(latStr);
        setLongitude(lngStr);
        const acc = Math.round(pos.coords.accuracy * 10) / 10;
        setLocationAccuracy(acc);
        const fixTime = new Date(pos.timestamp).toISOString();
        setLocationTimestamp(fixTime);
        setLocationSource('device_gps');
        setGpsLoading(false);
        // Automatically attempt reverse geocoding on successful GPS fix
        handleResolveAddress(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        setGpsLoading(false);
        setLocationSource('manual');
        setLocationAccuracy(null);
        setError(`GPS permission denied or unavailable (${err.message}). Switched to manual coordinate entry.`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      setError('Please provide a valid latitude (-90.0 to 90.0)');
      return;
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      setError('Please provide a valid longitude (-180.0 to 180.0)');
      return;
    }
    if (!description.trim()) {
      setError('Please enter a brief hazard description.');
      return;
    }

    try {
      setIsSubmitting(true);
      let uploadedImagePath: string | null = null;

      // Upload photo if user attached one
      if (selectedPhoto) {
        try {
          const uploadRes = await uploadHazardPhoto(selectedPhoto);
          uploadedImagePath = uploadRes.image_path;
        } catch (uploadErr: any) {
          console.warn('Photo upload error, continuing report:', uploadErr);
          // If upload endpoint failed, use data URL as resilient fallback
          uploadedImagePath = photoPreview;
        }
      }

      const isoTimestamp = reportedAt ? new Date(reportedAt).toISOString() : new Date().toISOString();

      await onSubmit({
        hazard_type: hazardType,
        severity: severity,
        latitude: lat,
        longitude: lng,
        description: description.trim(),
        reported_at: isoTimestamp,
        confirmation_status: 'unconfirmed',
        confidence: 0.75,
        source: 'rider_manual',
        image_path: uploadedImagePath,
        location_accuracy: locationAccuracy,
        location_timestamp: locationTimestamp,
        location_source: locationSource,
        resolved_address: resolvedAddress
      });

      setSuccessMessage('Hazard report submitted! Road Memory confirmation engine evaluated nearby reports.');
      setTimeout(() => {
        setDescription('');
        setSelectedPhoto(null);
        setPhotoPreview(null);
        setSuccessMessage(null);
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit hazard report.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 overflow-y-auto">
      <div className="relative w-full max-w-lg bg-white border border-slate-200 rounded-lg shadow-xl p-6 text-slate-900 my-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-md bg-slate-100 text-slate-700">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Report Road Hazard</h2>
              <p className="text-xs text-slate-500">Ingest real-world condition into Road Memory</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="mt-4 p-3 rounded-md bg-teal-50 border border-teal-200 text-xs text-teal-800 flex items-center gap-2">
            <Check className="w-4 h-4 text-teal-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Hazard Classification */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Hazard Classification
            </label>
            <select
              value={hazardType}
              onChange={(e) => setHazardType(e.target.value as HazardType)}
              className="w-full bg-slate-50 border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-teal-500 focus:bg-white"
            >
              <option value="pothole">Pothole / Road Depression</option>
              <option value="obstacle">Obstacle / Debris on Lane</option>
              <option value="roadblock">Roadblock / Construction Closure</option>
              <option value="unsafe_condition">Unsafe Road Condition (Oil, Sand, Slick)</option>
              <option value="unmarked_speed_bump">Unmarked Speed Bump / Pitch Hazard</option>
              <option value="gravel">Loose Gravel / Aggregate on Corner</option>
              <option value="broken_surface">Broken Surface / Asphalt Erosion</option>
              <option value="waterlogging">Waterlogging / Submerged Trench</option>
              <option value="oil_spill">Oil Spill / Diesel Slick</option>
              <option value="debris">Fallen Cargo / Retread Debris</option>
            </select>
          </div>

          {/* Severity Level */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Severity Level
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['low', 'medium', 'high', 'critical'] as SeverityLevel[]).map((level) => (
                <button
                  type="button"
                  key={level}
                  onClick={() => setSeverity(level)}
                  className={`py-2 px-1 text-center rounded-md text-xs font-medium capitalize border transition-colors cursor-pointer ${
                    severity === level
                      ? level === 'critical'
                        ? 'bg-red-50 text-red-700 border-red-300 font-bold'
                        : level === 'high'
                        ? 'bg-amber-50 text-amber-800 border-amber-300 font-bold'
                        : level === 'medium'
                        ? 'bg-slate-200 text-slate-800 border-slate-300 font-bold'
                        : 'bg-teal-50 text-teal-800 border-teal-300 font-bold'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* GPS Location, Accuracy & Reverse Geocoding */}
          <div className="space-y-2 p-3 rounded-md bg-slate-50 border border-slate-200">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-teal-600" />
                <span>Geographic Location</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleGetLocation}
                  disabled={gpsLoading}
                  className="flex items-center gap-1 text-xs text-slate-700 hover:text-slate-900 font-medium cursor-pointer px-2.5 py-1 rounded-md bg-white border border-slate-300 shadow-sm"
                >
                  {gpsLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
                  ) : (
                    <Compass className="w-3.5 h-3.5 text-slate-500" />
                  )}
                  <span>{gpsLoading ? 'Acquiring...' : 'Use Device GPS'}</span>
                </button>
              </div>
            </div>

            {/* Telemetry Status Bar */}
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              {locationSource === 'device_gps' ? (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-teal-50 border border-teal-200 text-teal-800 font-mono">
                  <Navigation className="w-3 h-3 text-teal-600" />
                  <span>GPS Sensor Fix</span>
                  {locationAccuracy !== null && (
                    <span className="text-teal-700 font-semibold">(±{locationAccuracy}m)</span>
                  )}
                  {locationTimestamp && (
                    <span className="text-slate-500">@ {new Date(locationTimestamp).toLocaleTimeString()}</span>
                  )}
                </span>
              ) : (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 font-mono">
                  <MapPin className="w-3 h-3 text-slate-500" />
                  <span>Manually Provided Coordinates</span>
                </span>
              )}

              {/* Action: Resolve Address */}
              <button
                type="button"
                onClick={() => handleResolveAddress()}
                disabled={isResolvingAddress}
                className="flex items-center gap-1 text-[11px] text-slate-700 hover:text-slate-900 font-medium px-2.5 py-0.5 rounded-md bg-white border border-slate-300 shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isResolvingAddress ? (
                  <Loader2 className="w-3 h-3 animate-spin text-teal-600" />
                ) : (
                  <Globe className="w-3 h-3 text-slate-500" />
                )}
                <span>{isResolvingAddress ? 'Resolving...' : 'Resolve Street Address'}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="block text-[10px] text-slate-500 font-mono mb-1">Latitude (WGS84)</span>
                <input
                  type="number"
                  step="any"
                  placeholder="Latitude"
                  value={latitude}
                  onChange={(e) => {
                    setLatitude(e.target.value);
                    setLocationSource('manual');
                    setLocationAccuracy(null);
                  }}
                  className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-teal-500 font-mono"
                  required
                />
              </div>
              <div>
                <span className="block text-[10px] text-slate-500 font-mono mb-1">Longitude (WGS84)</span>
                <input
                  type="number"
                  step="any"
                  placeholder="Longitude"
                  value={longitude}
                  onChange={(e) => {
                    setLongitude(e.target.value);
                    setLocationSource('manual');
                    setLocationAccuracy(null);
                  }}
                  className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-teal-500 font-mono"
                  required
                />
              </div>
            </div>

            {/* Resolved Address Box */}
            {resolvedAddress && (
              <div className="p-2.5 rounded-md bg-teal-50 border border-teal-200 text-xs text-teal-900 space-y-1">
                <div className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[10px] text-teal-700 uppercase font-mono tracking-wider block font-semibold">Resolved Road / Area</span>
                    <span className="font-medium text-slate-900">{resolvedAddress}</span>
                  </div>
                </div>
                <div className="text-[10px] text-slate-500 pt-1 border-t border-teal-200/60 flex flex-col gap-0.5">
                  <span>{geocodeAttribution || 'Data © OpenStreetMap contributors, ODbL 1.0'}</span>
                  <span className="italic">Reverse geocoding resolves place names; coordinates remain unchanged.</span>
                </div>
              </div>
            )}

            {/* Quick Presets for Demo Corroboration */}
            <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-500">
              <span>Demo Presets:</span>
              <button
                type="button"
                onClick={() => {
                  setLatitude('18.5205');
                  setLongitude('73.8568');
                  setLocationSource('manual');
                  setLocationAccuracy(null);
                  setHazardType('pothole');
                  setDescription('Secondary pothole report near bridge ramp expansion joint.');
                  handleResolveAddress(18.5205, 73.8568);
                }}
                className="text-teal-700 hover:underline cursor-pointer font-medium"
              >
                Near Bridge Ramp (Test Corroboration)
              </button>
            </div>
          </div>

          {/* Timestamp */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Report Timestamp</span>
            </label>
            <input
              type="datetime-local"
              value={reportedAt}
              onChange={(e) => setReportedAt(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-teal-500 font-mono"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Hazard Description
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Deep pothole spanning 40cm across center lane with sharp edges..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-md p-3 text-sm text-slate-900 focus:outline-none focus:border-teal-500 focus:bg-white"
              required
            />
          </div>

          {/* Optical Evidence Photo + AI Detection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-slate-400" />
                <span>Evidence Photo + Pothole Detection</span>
              </span>
              {photoPreview && (
                <button
                  type="button"
                  onClick={removePhoto}
                  className="text-[11px] text-red-600 hover:underline cursor-pointer"
                >
                  Remove Photo
                </button>
              )}
            </label>

            {!photoPreview ? (
              <label className="flex flex-col items-center justify-center p-4 border border-dashed border-slate-300 hover:border-teal-500 rounded-md bg-slate-50 cursor-pointer transition-colors group">
                <Upload className="w-5 h-5 text-slate-400 group-hover:text-teal-600 mb-1" />
                <span className="text-xs text-slate-700 font-medium">Click to upload or capture photo</span>
                <span className="text-[10px] text-slate-400 mt-0.5">JPG, PNG, WebP up to 10MB</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="space-y-2">
                {/* Photo preview */}
                <div className="relative rounded-md overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center max-h-48">
                  <img
                    src={
                      detectionResult?.annotated_image_b64
                        ? `data:image/jpeg;base64,${detectionResult.annotated_image_b64}`
                        : photoPreview
                    }
                    alt={detectionResult?.annotated_image_b64 ? 'Annotated detection result' : 'Evidence Preview'}
                    className="max-h-48 w-full object-contain"
                  />
                  {/* Status badge overlay */}
                  <div className="absolute bottom-1.5 left-2 flex items-center gap-1.5">
                    {detectionResult?.annotated_image_b64 && (
                      <span className="text-[10px] font-mono bg-red-950/90 border border-red-500/50 px-1.5 py-0.5 rounded text-red-300">
                        Detection Annotated
                      </span>
                    )}
                    <span className="text-[10px] font-mono bg-black/70 px-1.5 py-0.5 rounded text-teal-300">
                      Photo Attached
                    </span>
                  </div>
                </div>

                {/* Run Detection button */}
                {!detectionResult && (
                  <button
                    type="button"
                    onClick={handleRunDetection}
                    disabled={isDetecting}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium shadow-sm transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {isDetecting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Running YOLOv8 ONNX inference…</span>
                      </>
                    ) : (
                      <>
                        <ScanSearch className="w-3.5 h-3.5" />
                        <span>Analyse with Pothole Detector (Local AI)</span>
                      </>
                    )}
                  </button>
                )}

                {/* Detection error */}
                {detectionError && (
                  <div className="p-2.5 rounded-md bg-red-50 border border-red-200 text-[11px] text-red-700 flex items-start gap-2">
                    <CircleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{detectionError}</span>
                  </div>
                )}

                {/* Detection result panel */}
                {detectionResult && (
                  <div className={`rounded-md border p-3 space-y-2 text-[11px] ${
                    detectionResult.inference_status === 'ok'
                      ? 'bg-red-50 border-red-200'
                      : detectionResult.inference_status === 'no_detections'
                      ? 'bg-slate-50 border-slate-200'
                      : 'bg-amber-50 border-amber-200'
                  }`}>
                    {/* Header row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <ShieldAlert className={`w-3.5 h-3.5 ${
                          detectionResult.inference_status === 'ok' ? 'text-red-600' : 'text-slate-500'
                        }`} />
                        <span className={
                          detectionResult.inference_status === 'ok' ? 'text-red-800' : 'text-slate-800'
                        }>
                          {detectionResult.inference_status === 'ok'
                            ? `${detectionResult.detection_count} Pothole${detectionResult.detection_count !== 1 ? 's' : ''} Detected`
                            : detectionResult.inference_status === 'no_detections'
                            ? 'No Potholes Detected'
                            : detectionResult.inference_status === 'model_not_loaded'
                            ? 'Model Not Loaded'
                            : 'Detection Error'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleRunDetection}
                        disabled={isDetecting}
                        className="text-teal-700 hover:text-teal-800 font-medium cursor-pointer"
                      >
                        Re-run
                      </button>
                    </div>

                    {/* Per-detection rows */}
                    {detectionResult.detections.map((det, i) => (
                      <div key={i} className="flex items-center justify-between bg-white rounded px-2.5 py-1.5 border border-red-200">
                        <span className="font-mono text-slate-800 capitalize">{det.class_name}</span>
                        <div className="flex items-center gap-3 text-slate-600">
                          <span>
                            Conf: <span className="font-mono font-semibold text-red-700">{(det.confidence * 100).toFixed(1)}%</span>
                          </span>
                          <span className="text-slate-400">
                            {Math.round(det.bbox_pixels.width)}×{Math.round(det.bbox_pixels.height)}px
                          </span>
                        </div>
                      </div>
                    ))}

                    {/* Model info + disclaimer */}
                    <div className="pt-1 border-t border-slate-200 space-y-1 text-slate-500">
                      <div>
                        Model: <span className="font-mono text-slate-700">{detectionResult.model_name}</span>
                        {detectionResult.architecture && (
                          <span className="ml-1 text-slate-500">({detectionResult.architecture})</span>
                        )}
                      </div>
                      <div className="flex items-start gap-1 text-amber-700">
                        <Info className="w-3 h-3 shrink-0 mt-0.5" />
                        <span>{detectionResult.disclaimer}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2 rounded-md bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm shadow-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Evaluating Road Memory...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>Submit Hazard Report</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
