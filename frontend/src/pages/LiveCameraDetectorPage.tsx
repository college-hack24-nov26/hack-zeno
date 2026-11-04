import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  Play,
  Square,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldCheck,
  MapPin,
  Sparkles,
  Info,
  Layers,
  Database,
  Eye,
  Activity,
  Compass,
  RefreshCw
} from 'lucide-react';
import type {
  SeverityLevel,
  DetectionResult,
  HazardCreate
} from '../types/hazard';
import { detectHazard, createHazard } from '../services/api';
import { SeverityBadge } from '../components/SeverityBadge';

interface LivePotholeEvent {
  id: string;
  timestamp: string;
  confidence: number;
  bbox: { x1: number; y1: number; x2: number; y2: number; width: number; height: number };
  annotated_b64?: string | null;
  savedToDb: boolean;
  latitude: number;
  longitude: number;
  locationAccuracy?: number;
  severity: SeverityLevel;
  roadName: string;
}

export const LiveCameraDetectorPage: React.FC = () => {
  // Live Camera Stream State
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Live Location State
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<string>('Acquiring GPS...');
  const [routeName, setRouteName] = useState<string>('Live Patrol Sector');

  // Real-Time Inference Stats
  const [isInferencing, setIsInferencing] = useState<boolean>(false);
  const [fps, setFps] = useState<number>(0);
  const [totalFramesEvaluated, setTotalFramesEvaluated] = useState<number>(0);
  const [activeDetections, setActiveDetections] = useState<DetectionResult[]>([]);
  const [latestAnnotatedB64, setLatestAnnotatedB64] = useState<string | null>(null);

  // Detected Events & Cooldown Tracking
  const [detectedEvents, setDetectedEvents] = useState<LivePotholeEvent[]>([]);
  // Safety guard: default to manual review mode (auto-save disabled) to prevent unverified false detections
  const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(false);

  // Confidence Threshold for Auto-Saving
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.65);

  // DOM Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const loopTimerRef = useRef<number | null>(null);
  const lastEventTimeRef = useRef<number>(0);
  const lastBBoxRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const isInferencingRef = useRef<boolean>(false);

  // 1. Initialize Browser Geolocation Watcher
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus('Geolocation unsupported by browser');
      setCurrentCoords({ lat: 18.5204, lng: 73.8567 }); // fallback Pune default
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setCurrentCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        });
        setLocationStatus(`GPS Active (±${Math.round(pos.coords.accuracy)}m)`);
      },
      (err) => {
        console.warn('Geolocation warning:', err.message);
        setLocationStatus('GPS Unavailable (Using fallback coords)');
        setCurrentCoords({ lat: 18.5204, lng: 73.8567 });
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  // 2. Start Live Camera Stream
  const startCamera = async () => {
    setStreamError(null);
    setStatusMessage('Requesting camera access...');

    try {
      // Prioritize environment/rear camera for road surveillance if available
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsStreaming(true);
      setStatusMessage('Live camera stream active. Ready for real-time pothole scanning.');
    } catch (err: any) {
      console.error('Camera error:', err);
      setStreamError(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please enable camera access in browser settings.'
          : `Camera error: ${err.message || 'Unable to open video device'}`
      );
      setIsStreaming(false);
    }
  };

  // 3. Stop Live Camera Stream
  const stopCamera = () => {
    if (loopTimerRef.current) {
      window.clearInterval(loopTimerRef.current);
      loopTimerRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsStreaming(false);
    setIsInferencing(false);
    setActiveDetections([]);
    setStatusMessage('Camera stopped.');
  };

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Helper: Compute Intersection over Union
  const computeIoU = (
    b1: { x1: number; y1: number; x2: number; y2: number },
    b2: { x1: number; y1: number; x2: number; y2: number }
  ): number => {
    const x1 = Math.max(b1.x1, b2.x1);
    const y1 = Math.max(b1.y1, b2.y1);
    const x2 = Math.min(b1.x2, b2.x2);
    const y2 = Math.min(b1.y2, b2.y2);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const area1 = (b1.x2 - b1.x1) * (b1.y2 - b1.y1);
    const area2 = (b2.x2 - b2.x1) * (b2.y2 - b2.y1);
    const union = area1 + area2 - inter;
    return union > 0 ? inter / union : 0;
  };

  // 4. Capture Frame & Run Local ONNX Inference
  const captureAndDetect = useCallback(async () => {
    if (isInferencingRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    isInferencingRef.current = true;
    setIsInferencing(true);

    try {
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 360;
      const targetW = 640;
      const targetH = Math.round((vh / vw) * targetW);

      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, targetW, targetH);
      setTotalFramesEvaluated((prev) => prev + 1);

      // Convert frame to Blob
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85)
      );

      if (!blob) return;

      const frameFile = new File([blob], `live_frame_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const startTime = performance.now();
      const res = await detectHazard(frameFile);
      const elapsed = performance.now() - startTime;
      setFps(Math.round(1000 / Math.max(elapsed, 1)));

      if (res.inference_status === 'ok' && res.detections.length > 0) {
        setActiveDetections(res.detections);
        if (res.annotated_image_b64) {
          setLatestAnnotatedB64(res.annotated_image_b64);
        }

        // Evaluate top detection for automatic Road Memory registration
        const topDet = [...res.detections].sort((a, b) => b.confidence - a.confidence)[0];
        const now = Date.now();

        // Spatial & Temporal Deduplication / Cooldown Guard
        // Check if same physical pothole was registered within last 4.0 seconds or IoU > 0.35
        let isDuplicate = false;
        if (now - lastEventTimeRef.current < 4000) {
          if (lastBBoxRef.current) {
            const iou = computeIoU(topDet.bbox_pixels, lastBBoxRef.current);
            if (iou > 0.25) {
              isDuplicate = true;
            }
          }
        }

        if (!isDuplicate && topDet.confidence >= confidenceThreshold) {
          lastEventTimeRef.current = now;
          lastBBoxRef.current = topDet.bbox_pixels;

          // Determine suggested severity based on box size and confidence
          const boxArea = topDet.bbox_pixels.width * topDet.bbox_pixels.height;
          let severity: SeverityLevel = 'medium';
          if (boxArea > 35000 || topDet.confidence > 0.90) {
            severity = 'high';
          } else if (boxArea > 65000) {
            severity = 'critical';
          } else if (boxArea < 15000) {
            severity = 'low';
          }

          const lat = currentCoords ? currentCoords.lat : 18.5204;
          const lng = currentCoords ? currentCoords.lng : 73.8567;

          const eventId = `LIVE-${Date.now().toString().slice(-6)}`;
          const newEvent: LivePotholeEvent = {
            id: eventId,
            timestamp: new Date().toLocaleTimeString(),
            confidence: topDet.confidence,
            bbox: topDet.bbox_pixels,
            annotated_b64: res.annotated_image_b64,
            savedToDb: false,
            latitude: lat,
            longitude: lng,
            locationAccuracy: currentCoords?.accuracy,
            severity,
            roadName: routeName
          };

          // Auto-Save to Road Memory DB if enabled
          if (autoSaveEnabled) {
            try {
              const hazardPayload: HazardCreate = {
                hazard_type: 'pothole',
                severity,
                latitude: lat,
                longitude: lng,
                description: `Live camera auto-detected pothole at ${new Date().toLocaleTimeString()} (confidence ${(topDet.confidence * 100).toFixed(1)}%). Detected via YOLOv8n ONNX vision pipeline.`,
                reported_at: new Date().toISOString(),
                confirmation_status: 'unconfirmed',
                confidence: Math.round(topDet.confidence * 100) / 100,
                source: 'edge_vision',
                image_path: res.annotated_image_b64 ? `data:image/jpeg;base64,${res.annotated_image_b64}` : null,
                location_source: currentCoords?.accuracy ? 'device_gps' : 'manual',
                location_accuracy: currentCoords?.accuracy ? Math.round(currentCoords.accuracy) : null,
                location_timestamp: new Date().toISOString(),
                resolved_address: routeName
              };

              await createHazard(hazardPayload);
              newEvent.savedToDb = true;
              setStatusMessage(`Auto-registered ${eventId} into Road Memory database.`);
            } catch (err: any) {
              console.warn('Failed to auto-register hazard:', err);
            }
          }

          setDetectedEvents((prev) => [newEvent, ...prev.slice(0, 19)]);
        }
      } else {
        setActiveDetections([]);
      }
    } catch (err) {
      console.warn('Inference frame error:', err);
    } finally {
      isInferencingRef.current = false;
      setIsInferencing(false);
    }
  }, [confidenceThreshold, autoSaveEnabled, currentCoords, routeName]);

  // 5. Continuous Loop Trigger while Streaming
  useEffect(() => {
    if (isStreaming) {
      // Run continuous inference cycle at ~2 FPS (every 500ms) to maintain smooth UI and low latency
      const interval = window.setInterval(() => {
        captureAndDetect();
      }, 500);
      loopTimerRef.current = interval;

      return () => {
        window.clearInterval(interval);
        loopTimerRef.current = null;
      };
    }
  }, [isStreaming, captureAndDetect]);

  // Manually Save an Event if not auto-saved
  const handleManualSave = async (event: LivePotholeEvent) => {
    try {
      const hazardPayload: HazardCreate = {
        hazard_type: 'pothole',
        severity: event.severity,
        latitude: event.latitude,
        longitude: event.longitude,
        description: `Live camera verified pothole at ${event.timestamp} (${(event.confidence * 100).toFixed(1)}% conf).`,
        reported_at: new Date().toISOString(),
        confirmation_status: 'unconfirmed',
        confidence: Math.round(event.confidence * 100) / 100,
        source: 'edge_vision',
        image_path: event.annotated_b64 ? `data:image/jpeg;base64,${event.annotated_b64}` : null,
        location_source: event.locationAccuracy ? 'device_gps' : 'manual',
        location_accuracy: event.locationAccuracy ? Math.round(event.locationAccuracy) : null,
        location_timestamp: new Date().toISOString(),
        resolved_address: event.roadName
      };

      await createHazard(hazardPayload);
      setDetectedEvents((prev) =>
        prev.map((e) => (e.id === event.id ? { ...e, savedToDb: true } : e))
      );
      setStatusMessage(`Event #${event.id} saved to Road Memory.`);
    } catch (err: any) {
      alert(`Save failed: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Live Pothole Camera</h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-teal-700 font-semibold">
              PRETRAINED YOLOv8n ONNX
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            Real-time live camera feed with automatic edge inference and spatial Road Memory logging
          </p>
        </div>

        {/* Action Button: Start / Stop Camera */}
        <div className="flex items-center gap-3">
          {!isStreaming ? (
            <button
              type="button"
              onClick={startCamera}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-teal-600 hover:bg-teal-700 text-white font-medium text-xs sm:text-sm shadow-sm transition-colors cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>Start Live Camera</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={stopCamera}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white font-medium text-xs sm:text-sm shadow-sm transition-colors cursor-pointer"
            >
              <Square className="w-4 h-4 fill-current" />
              <span>Stop Camera</span>
            </button>
          )}
        </div>
      </div>

      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Alerts */}
      {streamError && (
        <div className="p-3.5 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{streamError}</span>
        </div>
      )}

      {statusMessage && (
        <div className="p-3.5 rounded-md bg-teal-50 border border-teal-200 text-xs text-teal-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Main Grid: Camera Viewport (Left 7) & Live Detection Telemetry (Right 5) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Live Video Stream & HUD Controls */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-5 rounded-lg bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Camera className="w-4 h-4 text-teal-600" />
                <span>Live Optical Feed</span>
              </h2>
              <div className="flex items-center gap-2 text-xs font-mono">
                {isStreaming ? (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    LIVE ({fps} FPS)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                    STANDBY
                  </span>
                )}
              </div>
            </div>

            {/* Viewport Card */}
            <div className="relative aspect-video rounded-md overflow-hidden bg-black border border-slate-800 flex items-center justify-center shadow-inner">
              <video
                ref={videoRef}
                playsInline
                muted
                className={`w-full h-full object-contain ${!isStreaming ? 'hidden' : ''}`}
              />

              {!isStreaming && (
                <div className="p-8 text-center text-slate-400 space-y-3">
                  <Camera className="w-10 h-10 mx-auto text-slate-600" />
                  <div>
                    <p className="text-sm font-semibold text-slate-300">Camera Feed Inactive</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Click "Start Live Camera" to begin real-time road hazard detection
                    </p>
                  </div>
                </div>
              )}

              {/* Real-Time Detection HUD Overlay */}
              {isStreaming && (
                <>
                  {/* Top Left: Model info and frame count */}
                  <div className="absolute top-3 left-3 bg-slate-900/85 backdrop-blur-xs px-2.5 py-1 rounded border border-slate-700 text-[11px] font-mono text-teal-300 space-y-0.5">
                    <div className="flex items-center gap-1.5 font-bold">
                      <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                      <span>ONNX YOLOv8n Pothole Model</span>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Evaluated: {totalFramesEvaluated} frames
                    </div>
                  </div>

                  {/* Top Right: Real-time Bounding Alert */}
                  {activeDetections.length > 0 && (
                    <div className="absolute top-3 right-3 bg-red-950/90 border border-red-500/80 px-2.5 py-1 rounded text-[11px] font-mono text-red-300 font-bold flex items-center gap-1.5 animate-bounce">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                      <span>POTHOLE IN SIGHT ({Math.round(activeDetections[0].confidence * 100)}%)</span>
                    </div>
                  )}

                  {/* Bottom Bar: Live GPS Telemetry */}
                  <div className="absolute bottom-3 left-3 right-3 bg-slate-900/85 backdrop-blur-xs p-2 rounded border border-slate-700 flex items-center justify-between text-[11px] font-mono text-slate-300">
                    <div className="flex items-center gap-1.5 text-teal-400">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>
                        {currentCoords
                          ? `${currentCoords.lat.toFixed(5)}° N, ${currentCoords.lng.toFixed(5)}° E`
                          : 'Locating...'}
                      </span>
                    </div>
                    <div className="text-slate-400">{locationStatus}</div>
                  </div>
                </>
              )}
            </div>

            {/* Live Camera Configuration Controls */}
            <div className="p-3.5 rounded-md bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <label className="text-slate-700 font-medium">Auto-Save to Road Memory:</label>
                  <input
                    type="checkbox"
                    checked={autoSaveEnabled}
                    onChange={(e) => setAutoSaveEnabled(e.target.checked)}
                    className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 h-4 w-4 cursor-pointer"
                  />
                  <span className="text-[11px] text-slate-500">
                    {autoSaveEnabled ? '(Automatic SQLite Registration)' : '(Review mode)'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-slate-700 font-medium">Confidence Filter:</label>
                  <select
                    value={confidenceThreshold}
                    onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                    className="bg-white border border-slate-300 rounded px-2 py-1 text-xs font-mono text-slate-900 cursor-pointer"
                  >
                    <option value={0.50}>50% (Sensitive)</option>
                    <option value={0.65}>65% (Recommended)</option>
                    <option value={0.80}>80% (Strict)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Route / Area Label</label>
                <input
                  type="text"
                  value={routeName}
                  onChange={(e) => setRouteName(e.target.value)}
                  placeholder="e.g. Live Patrol Sector or Highway 4"
                  className="w-full bg-white border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>
          </div>

          {/* Model Provenance & Verification Badge */}
          <div className="p-4 rounded-lg bg-white border border-slate-200 shadow-sm space-y-2 text-xs">
            <div className="flex items-center justify-between font-bold text-slate-900 uppercase tracking-wider text-[11px]">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-teal-600" />
                <span>Pretrained Model Verification</span>
              </span>
              <span className="text-teal-700 font-mono">AGPL-3.0</span>
            </div>
            <p className="text-slate-600 leading-relaxed text-[11px]">
              Weights verified locally at <code className="font-mono text-slate-800">backend/models/pothole_yolov8n.onnx</code>.
              Fine-tuned on the dedicated <code className="font-mono text-slate-800">pothole_dataset.yaml</code> containing genuine
              annotated road surface pothole imagery with single-class output <code className="font-mono text-slate-800">&#123;0: 'pothole'&#125;</code>.
              Zero cloud APIs or external tokens are consumed.
            </p>
          </div>
        </div>

        {/* Right Column: Live Detection Telemetry & Saved Events */}
        <div className="lg:col-span-5 space-y-4">
          {/* Real-Time Optical Reticle Preview */}
          <div className="p-5 rounded-lg bg-white border border-slate-200 shadow-sm space-y-3">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-teal-600" />
                <span>Annotated Optical Return</span>
              </span>
              <span className="text-[10px] font-mono text-slate-500">640×640 TENSOR</span>
            </h2>

            {latestAnnotatedB64 ? (
              <div className="space-y-2">
                <div className="relative rounded-md overflow-hidden border border-slate-800 bg-black flex items-center justify-center max-h-48">
                  <img
                    src={`data:image/jpeg;base64,${latestAnnotatedB64}`}
                    alt="Active Frame Detection"
                    className="max-h-48 w-full object-contain"
                  />
                  <div className="absolute top-2 left-2 bg-red-950/90 border border-red-500/50 px-2 py-0.5 rounded text-[10px] font-mono text-red-300 font-semibold">
                    MODEL DETECTED
                  </div>
                </div>
                {activeDetections.length > 0 && (
                  <div className="flex flex-wrap gap-2 text-[11px] font-mono">
                    {activeDetections.map((det, i) => (
                      <span key={i} className="px-2 py-1 rounded bg-red-50 border border-red-200 text-red-700">
                        {det.class_name} • {(det.confidence * 100).toFixed(1)}% conf
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-500 space-y-1">
                <Activity className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                <p>Start live camera to inspect real-time bounding boxes and model telemetry.</p>
              </div>
            )}
          </div>

          {/* Auto-Registered Hazard Events */}
          <div className="p-5 rounded-lg bg-white border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-teal-600" />
                <span>Live Hazard Registry</span>
              </h2>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-teal-700 font-bold">
                {detectedEvents.length} Events
              </span>
            </div>

            {detectedEvents.length === 0 ? (
              <div className="p-8 text-center rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-500 space-y-1">
                <ShieldCheck className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                <p>No potholes detected yet. When detected, hazards will automatically appear and register here.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                {detectedEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className="p-4 rounded-md bg-slate-50 border border-slate-200 hover:border-slate-300 transition-colors space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-teal-700">#{evt.id}</span>
                          <span className="text-xs font-bold text-slate-900">Road Pothole</span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-600 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>{evt.timestamp}</span>
                        </div>
                      </div>
                      <SeverityBadge severity={evt.severity} />
                    </div>

                    {/* Thumbnail if available */}
                    {evt.annotated_b64 && (
                      <div className="relative rounded-md overflow-hidden border border-slate-800 max-h-28 bg-black flex items-center justify-center">
                        <img
                          src={`data:image/jpeg;base64,${evt.annotated_b64}`}
                          alt={evt.id}
                          className="max-h-28 w-full object-contain"
                        />
                      </div>
                    )}

                    {/* Metrics */}
                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-white p-2 rounded-md border border-slate-200">
                      <div>
                        <span className="text-slate-500 block text-[10px]">Confidence</span>
                        <span className="text-teal-700 font-bold">{(evt.confidence * 100).toFixed(1)}%</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">GPS Position</span>
                        <span className="text-slate-700">
                          {evt.latitude.toFixed(4)}, {evt.longitude.toFixed(4)}
                        </span>
                      </div>
                    </div>

                    {/* Save Status / Action */}
                    {evt.savedToDb ? (
                      <div className="flex items-center justify-center gap-1.5 py-1 rounded bg-teal-50 border border-teal-200 text-teal-800 text-[11px] font-medium font-mono">
                        <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                        <span>Saved in Road Memory (SQLite)</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleManualSave(evt)}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium transition-colors cursor-pointer"
                      >
                        <Database className="w-3.5 h-3.5" />
                        <span>Save to Road Memory</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
