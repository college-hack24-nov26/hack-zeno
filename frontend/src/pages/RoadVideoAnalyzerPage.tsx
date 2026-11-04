import React, { useState, useRef, useEffect } from 'react';
import {
  Video,
  Play,
  Pause,
  Upload,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  StopCircle,
  Clock,
  ShieldCheck,
  MapPin,
  Sparkles,
  Info,
  Layers,
  Save,
  Check,
  Eye,
  RotateCcw
} from 'lucide-react';
import type {
  SeverityLevel,
  VideoFrameDetection,
  VideoPotholeTrack,
  DetectionResult,
  DetectionBBox,
  HazardCreate
} from '../types/hazard';
import { detectHazard, createHazard } from '../services/api';
import { SeverityBadge } from '../components/SeverityBadge';

export const RoadVideoAnalyzerPage: React.FC = () => {
  // Video source state
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisProgress, setAnalysisProgress] = useState<number>(0);
  const [processedFramesCount, setProcessedFramesCount] = useState<number>(0);
  const [totalFramesCount, setTotalFramesCount] = useState<number>(0);
  const [currentFramePreview, setCurrentFramePreview] = useState<string | null>(null);
  const [activeDetectionsInFrame, setActiveDetectionsInFrame] = useState<DetectionResult[]>([]);
  const [samplingRateFps, setSamplingRateFps] = useState<number>(1); // 1 frame per second

  // Results state
  const [frameDetections, setFrameDetections] = useState<VideoFrameDetection[]>([]);
  const [potholeTracks, setPotholeTracks] = useState<VideoPotholeTrack[]>([]);
  const [analysisCompleted, setAnalysisCompleted] = useState<boolean>(false);
  const [savedTrackIds, setSavedTrackIds] = useState<Set<string>>(new Set());
  const [trackViewFilter, setTrackViewFilter] = useState<'hazards' | 'all' | 'stationary'>('hazards');

  // Optional Route Reference State
  const [enableRouteRef, setEnableRouteRef] = useState<boolean>(false);
  const [routeName, setRouteName] = useState<string>('FC Road Southbound Corridor');
  const [routeStartLat, setRouteStartLat] = useState<string>('18.5204');
  const [routeStartLng, setRouteStartLng] = useState<string>('73.8567');

  // Error & Status
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // DOM Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const abortControllerRef = useRef<boolean>(false);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (videoUrl && videoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  const handleVideoSelect = (file: File) => {
    if (file.size > 100 * 1024 * 1024) {
      setErrorMessage('Video file exceeds 100MB limit.');
      return;
    }
    setErrorMessage(null);
    setStatusMessage(null);
    setAnalysisCompleted(false);
    setFrameDetections([]);
    setPotholeTracks([]);
    setCurrentFramePreview(null);
    setActiveDetectionsInFrame([]);

    if (videoUrl && videoUrl.startsWith('blob:')) {
      URL.revokeObjectURL(videoUrl);
    }

    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
  };

  // Helper: Format seconds to MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Generate Synthetic Test Video right in browser via canvas.captureStream() + MediaRecorder
  const generateSyntheticDemoVideo = (hasPotholes: boolean) => {
    setStatusMessage(`Generating ${hasPotholes ? 'pothole road' : 'clean road'} test video in browser...`);
    setErrorMessage(null);

    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const stream = canvas.captureStream(10); // 10 fps
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    } catch {
      try {
        recorder = new MediaRecorder(stream);
      } catch (err) {
        setErrorMessage('Browser does not support MediaRecorder canvas video synthesis. Please upload an MP4/WebM file.');
        return;
      }
    }

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const syntheticFile = new File([blob], hasPotholes ? 'pothole_road_test.webm' : 'clean_road_test.webm', {
        type: 'video/webm'
      });
      handleVideoSelect(syntheticFile);
      setStatusMessage(
        hasPotholes
          ? 'Generated 5s asphalt road test video with a realistic pothole at 00:02 - 00:03.'
          : 'Generated 5s clean asphalt road test video (zero potholes).'
      );
    };

    recorder.start();

    // Animate 50 frames (5 seconds at 10 fps)
    let frame = 0;
    const totalFrames = 50;

    const interval = setInterval(() => {
      frame++;
      // Draw road background
      ctx.fillStyle = '#4a4a4a';
      ctx.fillRect(0, 0, 640, 360);

      // Lane markings
      ctx.fillStyle = '#ffffff';
      for (let y = (frame * 12) % 60; y < 360; y += 60) {
        ctx.fillRect(315, y, 10, 30);
      }

      // Asphalt texture dots
      ctx.fillStyle = '#3a3a3a';
      for (let i = 0; i < 40; i++) {
        const x = (i * 37 + frame * 3) % 640;
        const y = (i * 23 + frame * 5) % 360;
        ctx.fillRect(x, y, 4, 3);
      }

      // If pothole video, render a pothole between frames 18 and 35 (seconds 1.8 to 3.5)
      if (hasPotholes && frame >= 18 && frame <= 36) {
        const progress = (frame - 18) / 18;
        const potY = 160 + progress * 100; // pothole moves closer to camera
        const potX = 260 + progress * 10;
        const width = 110 + progress * 40;
        const height = 65 + progress * 25;

        // Dark depression crater
        ctx.fillStyle = '#1e1b1b';
        ctx.beginPath();
        ctx.ellipse(potX + width / 2, potY + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Rim shadow
        ctx.strokeStyle = '#121010';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Inner depth shadow
        ctx.fillStyle = '#141212';
        ctx.beginPath();
        ctx.ellipse(potX + width / 2 + 5, potY + height / 2 + 5, width / 3, height / 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Frame timestamp counter overlay
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(10, 10, 180, 24);
      ctx.fillStyle = '#10b981';
      ctx.font = '12px monospace';
      ctx.fillText(`TEST ROAD • T: ${(frame / 10).toFixed(1)}s`, 16, 26);

      if (frame >= totalFrames) {
        clearInterval(interval);
        recorder.stop();
      }
    }, 100);
  };

  // Helper: Compute Intersection over Union between two bounding boxes
  const computeBBoxIoU = (b1: DetectionBBox, b2: DetectionBBox): number => {
    const x1 = Math.max(b1.x1, b2.x1);
    const y1 = Math.max(b1.y1, b2.y1);
    const x2 = Math.min(b1.x2, b2.x2);
    const y2 = Math.min(b1.y2, b2.y2);
    const w = Math.max(0, x2 - x1);
    const h = Math.max(0, y2 - y1);
    const inter = w * h;
    const area1 = Math.max(0, b1.width) * Math.max(0, b1.height);
    const area2 = Math.max(0, b2.width) * Math.max(0, b2.height);
    const union = area1 + area2 - inter;
    return union > 0 ? inter / union : 0;
  };

  // Helper: Compute normalized Euclidean distance between box centroids
  const computeCenterDistance = (b1: DetectionBBox, b2: DetectionBBox): number => {
    const c1x = (b1.x1 + b1.x2) / 2 / 640;
    const c1y = (b1.y1 + b1.y2) / 2 / 360;
    const c2x = (b2.x1 + b2.x2) / 2 / 640;
    const c2y = (b2.y1 + b2.y2) / 2 / 360;
    return Math.hypot(c1x - c2x, c1y - c2y);
  };

  interface ActiveTrackRecord {
    id: number;
    firstSeen: number;
    lastSeen: number;
    detections: { time: number; det: DetectionResult; annotated?: string | null }[];
    lastBBox: DetectionBBox;
  }

  // Explainable Multi-Object Deduplication Engine with IoU & Ego-Motion Persistence Tracking
  const deduplicateDetections = (rawFrames: VideoFrameDetection[]): VideoPotholeTrack[] => {
    const sortedFrames = [...rawFrames].sort((a, b) => a.timestamp_sec - b.timestamp_sec);
    const activeTracks: ActiveTrackRecord[] = [];
    const completedGroups: ActiveTrackRecord[] = [];
    let nextTrackId = 1;

    for (const frame of sortedFrames) {
      const frameDets = frame.detections || [];
      const assignedTrackIds = new Set<number>();

      for (const det of frameDets) {
        let bestMatch: ActiveTrackRecord | null = null;
        let bestScore = -1;

        for (const track of activeTracks) {
          if (assignedTrackIds.has(track.id)) continue;
          const timeDiff = frame.timestamp_sec - track.lastSeen;
          if (timeDiff > 2.5) continue; // max 2.5s tracking association window

          const iou = computeBBoxIoU(det.bbox_pixels, track.lastBBox);
          const centerDist = computeCenterDistance(det.bbox_pixels, track.lastBBox);

          // Spatial match if IoU >= 0.15 OR close centroid with continuous trajectory
          const isMatch = iou >= 0.15 || (centerDist <= 0.18 && timeDiff <= 2.0);
          if (isMatch) {
            const score = iou > 0 ? iou : 1 - centerDist;
            if (score > bestScore) {
              bestScore = score;
              bestMatch = track;
            }
          }
        }

        if (bestMatch) {
          bestMatch.lastSeen = frame.timestamp_sec;
          bestMatch.lastBBox = det.bbox_pixels;
          bestMatch.detections.push({
            time: frame.timestamp_sec,
            det,
            annotated: frame.annotated_b64
          });
          assignedTrackIds.add(bestMatch.id);
        } else {
          activeTracks.push({
            id: nextTrackId++,
            firstSeen: frame.timestamp_sec,
            lastSeen: frame.timestamp_sec,
            detections: [{ time: frame.timestamp_sec, det, annotated: frame.annotated_b64 }],
            lastBBox: det.bbox_pixels
          });
          assignedTrackIds.add(nextTrackId - 1);
        }
      }

      // Retire inactive tracks older than 2.5 seconds
      for (let i = activeTracks.length - 1; i >= 0; i--) {
        if (frame.timestamp_sec - activeTracks[i].lastSeen > 2.5) {
          completedGroups.push(activeTracks[i]);
          activeTracks.splice(i, 1);
        }
      }
    }

    // Flush remaining active tracks
    completedGroups.push(...activeTracks);

    // Finalize each track with ego-motion & persistence analysis
    const tracks: VideoPotholeTrack[] = [];
    for (const group of completedGroups) {
      finalizeTrack(group, tracks);
    }

    return tracks;
  };

  const finalizeTrack = (
    group: {
      id: number;
      firstSeen: number;
      lastSeen: number;
      detections: { time: number; det: DetectionResult; annotated?: string | null }[];
    },
    outList: VideoPotholeTrack[]
  ) => {
    const trackNum = outList.length + 1;
    // Find detection with highest confidence in this track
    let peakDet = group.detections[0];
    for (const item of group.detections) {
      if (item.det.confidence > peakDet.det.confidence) {
        peakDet = item;
      }
    }

    const duration = Math.max(1, group.detections.length);
    const timeSpan = group.lastSeen - group.firstSeen;
    const timeRangeStr =
      group.firstSeen === group.lastSeen
        ? `${formatTime(group.firstSeen)}`
        : `${formatTime(group.firstSeen)} – ${formatTime(group.lastSeen)}`;

    // Calculate motion and positional variance across frames
    const centers = group.detections.map((d) => ({
      x: (d.det.bbox_pixels.x1 + d.det.bbox_pixels.x2) / 2 / 640,
      y: (d.det.bbox_pixels.y1 + d.det.bbox_pixels.y2) / 2 / 360
    }));

    const meanX = centers.reduce((s, c) => s + c.x, 0) / centers.length;
    const meanY = centers.reduce((s, c) => s + c.y, 0) / centers.length;
    const varianceX = centers.reduce((s, c) => s + Math.pow(c.x - meanX, 2), 0) / centers.length;
    const varianceY = centers.reduce((s, c) => s + Math.pow(c.y - meanY, 2), 0) / centers.length;
    const stdDevX = Math.sqrt(varianceX);
    const stdDevY = Math.sqrt(varianceY);

    // Ego-vehicle stationary detection:
    // A motorcycle dashboard/mount remains static relative to the camera for >= 3.0s and >= 4 frames
    // with near-zero positional variance (stdDev < 3.5%) in the lower half of the frame (meanY >= 0.50).
    // Genuine road potholes move downward as the motorcycle advances (or pass in 1-2 frames).
    const isStationaryVehicle =
      duration >= 4 &&
      timeSpan >= 3.0 &&
      stdDevX < 0.035 &&
      stdDevY < 0.035 &&
      meanY >= 0.50;

    // Classification: verified_track vs ai_prediction vs stationary_vehicle
    let trackType: 'verified_track' | 'ai_prediction' | 'stationary_vehicle' = 'ai_prediction';
    let dedupExplanation = '';

    if (isStationaryVehicle) {
      trackType = 'stationary_vehicle';
      dedupExplanation = `Persistent vehicle feature (dashboard/mount) detected across ${duration} frames (${timeSpan.toFixed(1)}s) with near-zero ego-motion (σ < 3%). Filtered from active road hazard count.`;
    } else if (peakDet.det.confidence >= 0.70 && duration >= 2) {
      trackType = 'verified_track';
      dedupExplanation = `Multi-frame road hazard progression confirmed across ${duration} frame(s) (${timeSpan.toFixed(1)}s) with high peak confidence (${(peakDet.det.confidence * 100).toFixed(1)}%).`;
    } else {
      trackType = 'ai_prediction';
      dedupExplanation =
        duration === 1
          ? `Single-frame transient AI detection (${(peakDet.det.confidence * 100).toFixed(1)}% conf). Field verification recommended.`
          : `Moderate-confidence AI prediction (${(peakDet.det.confidence * 100).toFixed(1)}% conf) across ${duration} frame(s). Requires corroboration.`;
    }

    // Suggested severity based on duration and box size
    const boxArea = peakDet.det.bbox_pixels.width * peakDet.det.bbox_pixels.height;
    let suggestedSeverity: SeverityLevel = 'medium';
    if (boxArea > 35000 || peakDet.det.confidence > 0.90) {
      suggestedSeverity = 'high';
    } else if (boxArea > 60000) {
      suggestedSeverity = 'critical';
    } else if (boxArea < 15000) {
      suggestedSeverity = 'low';
    }

    outList.push({
      track_id: `POTHOLE-VID-${trackNum.toString().padStart(2, '0')}`,
      first_seen_sec: group.firstSeen,
      last_seen_sec: group.lastSeen,
      formatted_time_range: timeRangeStr,
      frame_count: duration,
      peak_confidence: peakDet.det.confidence,
      best_bbox: peakDet.det.bbox_pixels,
      best_annotated_b64: peakDet.annotated || null,
      dedup_explanation: dedupExplanation,
      location_note: enableRouteRef
        ? `Associated with user-provided reference: ${routeName}`
        : 'Geographic GPS unavailable (prerecorded video file has no embedded telemetry track).',
      suggested_severity: suggestedSeverity,
      track_type: trackType,
      is_stationary: isStationaryVehicle
    });
  };

  // Main Frame-by-Frame Video Processing Loop
  const handleAnalyzeVideo = async () => {
    const video = videoRef.current;
    const canvas = hiddenCanvasRef.current;
    if (!video || !canvas) {
      setErrorMessage('Video player or extraction canvas is not initialized.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisCompleted(false);
    setErrorMessage(null);
    setStatusMessage(null);
    abortControllerRef.current = false;
    setFrameDetections([]);
    setPotholeTracks([]);

    const duration = Math.min(video.duration || 60, 60); // Cap to 60s
    const stepSeconds = 1.0 / samplingRateFps; // e.g. 1.0s or 0.5s
    const targetTimestamps: number[] = [];
    for (let t = 0.5; t < duration; t += stepSeconds) {
      targetTimestamps.push(Math.round(t * 10) / 10);
    }

    setTotalFramesCount(targetTimestamps.length);
    const collectedDetections: VideoFrameDetection[] = [];

    // Pause video playback while sequential frame extraction runs
    video.pause();

    try {
      for (let i = 0; i < targetTimestamps.length; i++) {
        if (abortControllerRef.current) {
          setStatusMessage(`Video analysis cancelled by user at frame ${i} of ${targetTimestamps.length}.`);
          break;
        }

        const t = targetTimestamps[i];
        setProcessedFramesCount(i + 1);
        setAnalysisProgress(Math.round(((i + 1) / targetTimestamps.length) * 100));

        // 1. Seek video to timestamp
        video.currentTime = t;
        await new Promise((resolve) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            resolve(true);
          };
          video.addEventListener('seeked', onSeeked);
        });

        // 2. Draw frame to hidden canvas, preserving aspect ratio (640px base width)
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 360;
        const targetW = 640;
        const targetH = Math.round((vh / vw) * targetW);
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        ctx.drawImage(video, 0, 0, targetW, targetH);

        // 3. Convert frame to JPEG Blob
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85)
        );

        if (!blob) continue;

        // 4. Send frame to existing local FastAPI ONNX endpoint
        const frameFile = new File([blob], `frame_${t.toFixed(1)}s.jpg`, { type: 'image/jpeg' });
        try {
          const res = await detectHazard(frameFile);

          if (res.inference_status === 'ok' && res.detections.length > 0) {
            collectedDetections.push({
              timestamp_sec: t,
              formatted_time: formatTime(t),
              detections: res.detections,
              annotated_b64: res.annotated_image_b64
            });

            // Update live UI frame preview
            if (res.annotated_image_b64) {
              setCurrentFramePreview(`data:image/jpeg;base64,${res.annotated_image_b64}`);
            }
            setActiveDetectionsInFrame(res.detections);
          } else {
            // No detections in this frame
            setActiveDetectionsInFrame([]);
          }
        } catch (inferErr: any) {
          console.warn(`Frame @ ${t}s inference warning:`, inferErr);
        }

        // Keep UI responsive
        await new Promise((resolve) => setTimeout(resolve, 40));
      }

      setFrameDetections(collectedDetections);

      // Run deduplication
      const tracks = deduplicateDetections(collectedDetections);
      setPotholeTracks(tracks);
      setAnalysisCompleted(true);

      const roadHazardCount = tracks.filter((t) => !t.is_stationary).length;
      const stationaryCount = tracks.filter((t) => t.is_stationary).length;
      const totalRawCount = collectedDetections.reduce((acc, f) => acc + (f.detections?.length || 0), 0);

      if (roadHazardCount > 0) {
        setStatusMessage(
          `Analysis complete: Scanned ${targetTimestamps.length} frames (${totalRawCount} raw AI detections). Identified ${roadHazardCount} unique road hazard track(s)${stationaryCount > 0 ? ` and filtered ${stationaryCount} persistent vehicle feature(s)` : ''}.`
        );
      } else if (stationaryCount > 0) {
        setStatusMessage(
          `Analysis complete: Scanned ${targetTimestamps.length} frames (${totalRawCount} raw AI detections). Zero active road hazards detected (${stationaryCount} persistent vehicle dashboard feature(s) safely filtered).`
        );
      } else {
        setStatusMessage(
          `Analysis complete: Scanned ${targetTimestamps.length} frames at ${samplingRateFps} FPS. Zero road potholes detected.`
        );
      }
    } catch (err: any) {
      setErrorMessage(`Video processing stopped: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCancelAnalysis = () => {
    abortControllerRef.current = true;
  };

  // Save Video Track to Road Memory
  const handleSaveTrackToRoadMemory = async (track: VideoPotholeTrack) => {
    try {
      const lat = enableRouteRef ? parseFloat(routeStartLat) : 18.5204;
      const lng = enableRouteRef ? parseFloat(routeStartLng) : 73.8567;

      const newHazard: HazardCreate = {
        hazard_type: 'pothole',
        severity: track.suggested_severity,
        latitude: lat,
        longitude: lng,
        description: `Pothole detected in video at ${track.formatted_time_range} (peak confidence ${(track.peak_confidence * 100).toFixed(1)}%, visible in ${track.frame_count} frames). ${track.location_note}`,
        reported_at: new Date().toISOString(),
        confirmation_status: 'unconfirmed',
        confidence: Math.round(track.peak_confidence * 100) / 100,
        source: 'edge_vision',
        image_path: track.best_annotated_b64 ? `data:image/jpeg;base64,${track.best_annotated_b64}` : null,
        location_source: enableRouteRef ? 'video_track' : 'video_unlocalized',
        resolved_address: enableRouteRef ? routeName : 'Location Unavailable (Prerecorded Video)'
      };

      await createHazard(newHazard);
      setSavedTrackIds((prev) => new Set(prev).add(track.track_id));
      setStatusMessage(`Saved ${track.track_id} (${track.formatted_time_range}) to Road Memory database.`);
    } catch (err: any) {
      setErrorMessage(`Failed to save to Road Memory: ${err?.message || 'Server error'}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Road Video Analyzer</h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-teal-700 font-semibold">
              LOCAL ONNX INFERENCE
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            Prerecorded road video hazard scanner with capped frame sampling and temporal deduplication
          </p>
        </div>

        {/* Quick Demo Generation Presets */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => generateSyntheticDemoVideo(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-medium shadow-sm transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-600" />
            <span>Generate Pothole Video (5s)</span>
          </button>
          <button
            type="button"
            onClick={() => generateSyntheticDemoVideo(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-medium shadow-sm transition-colors cursor-pointer"
          >
            <span>Generate Clean Video (5s)</span>
          </button>
        </div>
      </div>

      {/* Hidden offscreen canvas for frame extraction */}
      <canvas ref={hiddenCanvasRef} className="hidden" />

      {/* Status & Error Alerts */}
      {errorMessage && (
        <div className="p-3.5 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {statusMessage && (
        <div className="p-3.5 rounded-md bg-teal-50 border border-teal-200 text-xs text-teal-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Video Upload Dropzone & Player Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Video Player & Extraction Controls (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-5 rounded-lg bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Video className="w-4 h-4 text-teal-600" />
                <span>Video Player & Frame Ingestion</span>
              </h2>
              {videoFile && (
                <span className="text-xs font-mono text-slate-500">
                  {videoFile.name} ({(videoFile.size / (1024 * 1024)).toFixed(1)} MB)
                </span>
              )}
            </div>

            {/* Video Viewport */}
            {!videoUrl ? (
              <label className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-300 hover:border-teal-500 rounded-lg bg-slate-50 cursor-pointer transition-colors group">
                <Upload className="w-8 h-8 text-slate-400 group-hover:text-teal-600 mb-2 transition-colors" />
                <span className="text-sm text-slate-800 font-semibold">Upload Prerecorded Road Video</span>
                <span className="text-xs text-slate-500 mt-1">MP4, WebM, MOV up to 100MB</span>
                <span className="text-[11px] text-slate-400 mt-2">or click "Generate Pothole Video (5s)" above to test instantly</span>
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime,video/ogg"
                  onChange={(e) => e.target.files?.[0] && handleVideoSelect(e.target.files[0])}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="space-y-3">
                <div className="relative aspect-video rounded-md overflow-hidden bg-black border border-slate-800">
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    controls
                    playsInline
                    onLoadedMetadata={() => {
                      if (videoRef.current) {
                        setVideoDuration(videoRef.current.duration);
                      }
                    }}
                    onTimeUpdate={() => {
                      if (videoRef.current) {
                        setCurrentTime(videoRef.current.currentTime);
                      }
                    }}
                    className="w-full h-full object-contain"
                  />
                  {isAnalyzing && (
                    <div className="absolute top-2 left-2 bg-slate-900/90 px-2.5 py-1 rounded border border-slate-700 text-[11px] font-mono text-teal-300 flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-400" />
                      <span>SAMPLING FRAMES: {formatTime(currentTime)}</span>
                    </div>
                  )}
                </div>

                {/* Sampling Rate & Process Bar */}
                <div className="p-3 rounded-md bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-600 font-medium">Sampling Rate:</span>
                      <div className="flex items-center bg-slate-100 rounded-md p-0.5 border border-slate-200">
                        <button
                          type="button"
                          onClick={() => setSamplingRateFps(1)}
                          className={`px-2.5 py-1 rounded text-[11px] font-mono font-medium transition-colors cursor-pointer ${
                            samplingRateFps === 1
                              ? 'bg-white text-teal-700 font-bold shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          1 FPS (Standard)
                        </button>
                        <button
                          type="button"
                          onClick={() => setSamplingRateFps(2)}
                          className={`px-2.5 py-1 rounded text-[11px] font-mono font-medium transition-colors cursor-pointer ${
                            samplingRateFps === 2
                              ? 'bg-white text-teal-700 font-bold shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          2 FPS (Dense)
                        </button>
                      </div>
                    </div>

                    <div className="text-slate-500 font-mono text-[11px]">
                      Duration: {formatTime(videoDuration)} • Max Scan: 60s
                    </div>
                  </div>

                  {/* Action Controls */}
                  <div className="flex items-center gap-3">
                    {!isAnalyzing ? (
                      <button
                        type="button"
                        onClick={handleAnalyzeVideo}
                        className="flex-1 flex items-center justify-center gap-2 py-2 rounded-md bg-teal-600 hover:bg-teal-700 text-white font-medium text-xs sm:text-sm shadow-sm transition-colors cursor-pointer"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>Run Video Pothole Analysis</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleCancelAnalysis}
                        className="flex-1 flex items-center justify-center gap-2 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white font-medium text-xs sm:text-sm transition-colors cursor-pointer"
                      >
                        <StopCircle className="w-4 h-4" />
                        <span>Cancel Analysis</span>
                      </button>
                    )}

                    <label className="px-3.5 py-2 rounded-md bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-medium shadow-sm cursor-pointer transition-colors">
                      <span>Change Video</span>
                      <input
                        type="file"
                        accept="video/mp4,video/webm,video/quicktime,video/ogg"
                        onChange={(e) => e.target.files?.[0] && handleVideoSelect(e.target.files[0])}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {/* Progress Bar */}
                  {isAnalyzing && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between text-[11px] font-mono">
                        <span className="text-teal-700 font-medium">
                          Processing frame {processedFramesCount} of {totalFramesCount}
                        </span>
                        <span className="text-slate-500">{analysisProgress}%</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                        <div
                          className="h-full bg-teal-600 transition-all duration-150"
                          style={{ width: `${analysisProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Location Handling & Route Reference Card (Honest Transparency) */}
          <div className="p-5 rounded-lg bg-white border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <MapPin className="w-4 h-4 text-teal-600" />
                <span>Video Location Telemetry & Route Association</span>
              </h3>
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableRouteRef}
                  onChange={(e) => setEnableRouteRef(e.target.checked)}
                  className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-[11px] font-medium">Associate Known Route</span>
              </label>
            </div>

            {/* Honest Container Disclaimer */}
            <div className="p-3 rounded-md bg-slate-50 border border-slate-200 text-[11px] text-slate-600 leading-relaxed space-y-1">
              <div className="flex items-center gap-1.5 text-slate-800 font-semibold">
                <Info className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>Geographic Telemetry Transparency</span>
              </div>
              <p>
                Prerecorded video containers (.mp4 / .webm) do not contain browser-accessible GPS track streams.
                Detections are timestamped to the exact video frame (MM:SS). Without user-provided route coordinates,
                saved records are labeled as <span className="font-mono text-slate-700">Location Unavailable (Prerecorded Video)</span>.
              </p>
            </div>

            {/* Optional Route Entry */}
            {enableRouteRef && (
              <div className="p-3.5 rounded-md bg-slate-50 border border-slate-200 space-y-3">
                <div className="text-[10px] font-mono text-slate-700 uppercase tracking-wider font-semibold">
                  USER-PROVIDED ROUTE REFERENCE — NOT EXTRACTED FROM VIDEO FILE
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Route / Street Reference Name</label>
                    <input
                      type="text"
                      value={routeName}
                      onChange={(e) => setRouteName(e.target.value)}
                      placeholder="e.g. FC Road Southbound Corridor"
                      className="w-full bg-white border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-teal-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1">Start Latitude</label>
                      <input
                        type="number"
                        step="any"
                        value={routeStartLat}
                        onChange={(e) => setRouteStartLat(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-teal-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1">Start Longitude</label>
                      <input
                        type="number"
                        step="any"
                        value={routeStartLng}
                        onChange={(e) => setRouteStartLng(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-teal-500 font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Detection Telemetry & Deduplicated Tracks (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Active Frame Inspection Preview */}
          <div className="p-5 rounded-lg bg-white border border-slate-200 shadow-sm space-y-3">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-teal-600" />
                <span>Sampled Frame Telemetry</span>
              </span>
              <span className="text-[10px] font-mono text-slate-500">YOLOv8n ONNX</span>
            </h2>

            {currentFramePreview ? (
              <div className="space-y-2">
                <div className="relative rounded-md overflow-hidden border border-slate-800 bg-black flex items-center justify-center max-h-48">
                  <img
                    src={currentFramePreview}
                    alt="Active Frame Detection"
                    className="max-h-48 w-full object-contain"
                  />
                  <div className="absolute top-2 left-2 bg-red-950/90 border border-red-500/50 px-2 py-0.5 rounded text-[10px] font-mono text-red-300 font-semibold">
                    DETECTED IN FRAME
                  </div>
                </div>
                {activeDetectionsInFrame.length > 0 && (
                  <div className="flex flex-wrap gap-2 text-[11px] font-mono">
                    {activeDetectionsInFrame.map((det, i) => (
                      <span key={i} className="px-2 py-1 rounded bg-red-50 border border-red-200 text-red-700">
                        {det.class_name} • {(det.confidence * 100).toFixed(1)}% conf
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-500 space-y-1">
                <Clock className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                <p>Run analysis to stream inspected frames and bounding boxes in real time.</p>
              </div>
            )}
          </div>

          {/* Deduplicated Hazard Tracks */}
          <div className="p-5 rounded-lg bg-white border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-teal-600" />
                <span>Identified Road Hazard Tracks</span>
              </h2>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-teal-700 font-bold">
                {potholeTracks.filter((t) => !t.is_stationary).length} Road Tracks
              </span>
            </div>

            {/* 3-Tier Telemetry Summary (Raw Detections vs Unique Tracks vs Verified Reports) */}
            <div className="grid grid-cols-3 gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-center font-mono text-xs">
              <div className="bg-white p-2 rounded border border-slate-200">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">Raw AI Detections</div>
                <div className="text-base font-bold text-slate-800">
                  {frameDetections.reduce((sum, f) => sum + (f.detections?.length || 0), 0)}
                </div>
                <div className="text-[9px] text-slate-400">Sampled BBoxes</div>
              </div>
              <div className="bg-white p-2 rounded border border-teal-200 bg-teal-50/30">
                <div className="text-[10px] text-teal-700 uppercase tracking-wider font-semibold">Unique Tracks</div>
                <div className="text-base font-bold text-teal-800">
                  {potholeTracks.filter((t) => !t.is_stationary).length}
                </div>
                <div className="text-[9px] text-teal-600">IoU Deduplicated</div>
              </div>
              <div className="bg-white p-2 rounded border border-slate-200">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">Verified Reports</div>
                <div className="text-base font-bold text-slate-800">{savedTrackIds.size}</div>
                <div className="text-[9px] text-slate-400">Road Memory DB</div>
              </div>
            </div>

            {/* Filter Tabs if tracks exist */}
            {potholeTracks.length > 0 && (
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-md border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setTrackViewFilter('hazards')}
                  className={`flex-1 py-1 px-2 rounded text-center font-medium transition-colors cursor-pointer ${
                    trackViewFilter === 'hazards'
                      ? 'bg-white text-teal-800 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Road Hazards ({potholeTracks.filter((t) => !t.is_stationary).length})
                </button>
                {potholeTracks.some((t) => t.is_stationary) && (
                  <button
                    type="button"
                    onClick={() => setTrackViewFilter('stationary')}
                    className={`py-1 px-2 rounded text-center font-medium transition-colors cursor-pointer ${
                      trackViewFilter === 'stationary'
                        ? 'bg-white text-slate-800 shadow-xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Persistent vehicle features (e.g. dashboard/mount) filtered by ego-motion analysis"
                  >
                    Vehicle ({potholeTracks.filter((t) => t.is_stationary).length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setTrackViewFilter('all')}
                  className={`py-1 px-2 rounded text-center font-medium transition-colors cursor-pointer ${
                    trackViewFilter === 'all'
                      ? 'bg-white text-slate-800 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({potholeTracks.length})
                </button>
              </div>
            )}

            {potholeTracks.length === 0 ? (
              <div className="p-8 text-center rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-500 space-y-1">
                <ShieldCheck className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                <p>
                  {analysisCompleted
                    ? 'No potholes detected in this road video.'
                    : 'Awaiting video analysis. Upload a road recording and run analysis.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {(trackViewFilter === 'hazards'
                  ? potholeTracks.filter((t) => !t.is_stationary)
                  : trackViewFilter === 'stationary'
                  ? potholeTracks.filter((t) => t.is_stationary)
                  : potholeTracks
                ).map((track) => {
                  const isSaved = savedTrackIds.has(track.track_id);
                  return (
                    <div
                      key={track.track_id}
                      className="p-4 rounded-md bg-slate-50 border border-slate-200 hover:border-slate-300 transition-colors space-y-3"
                    >
                      {/* Top Track Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-teal-700">{track.track_id}</span>
                            <span className="text-xs font-bold text-slate-900">
                              {track.is_stationary ? 'Vehicle Feature' : 'Road Pothole'}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-slate-600 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3 text-slate-500" />
                            <span>Timestamp: {track.formatted_time_range}</span>
                            <span className="text-slate-400 font-sans">({track.frame_count} frames)</span>
                          </div>
                        </div>
                        <SeverityBadge severity={track.suggested_severity} />
                      </div>

                      {/* Status / Reliability Badge */}
                      <div className="flex items-center gap-2">
                        {track.track_type === 'verified_track' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <ShieldCheck className="w-3 h-3 text-emerald-600" />
                            Verified Road Track
                          </span>
                        ) : track.track_type === 'stationary_vehicle' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-200 text-slate-700 border border-slate-300">
                            <Info className="w-3 h-3 text-slate-500" />
                            Filtered: Stationary Vehicle
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            AI Prediction (Needs Verification)
                          </span>
                        )}
                      </div>

                      {/* Best Thumbnail if available */}
                      {track.best_annotated_b64 && (
                        <div className="relative rounded-md overflow-hidden border border-slate-800 max-h-32 bg-black flex items-center justify-center">
                          <img
                            src={`data:image/jpeg;base64,${track.best_annotated_b64}`}
                            alt={track.track_id}
                            className="max-h-32 w-full object-contain"
                          />
                        </div>
                      )}

                      {/* Telemetry Metrics */}
                      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-white p-2 rounded-md border border-slate-200">
                        <div>
                          <span className="text-slate-500 block text-[10px]">Peak Confidence</span>
                          <span className="text-teal-700 font-bold">{(track.peak_confidence * 100).toFixed(1)}%</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">Bounding Area</span>
                          <span className="text-slate-700">
                            {Math.round(track.best_bbox.width)}×{Math.round(track.best_bbox.height)} px
                          </span>
                        </div>
                      </div>

                      {/* Deduplication & Location note */}
                      <div className="space-y-1 text-[10px] text-slate-500">
                        <p className="italic text-slate-500">{track.dedup_explanation}</p>
                        <p className="text-slate-700 font-medium">{track.location_note}</p>
                      </div>

                      {/* Save to Road Memory Button (or stationary note) */}
                      {track.is_stationary ? (
                        <div className="p-2 rounded bg-slate-100 border border-slate-200 text-[10px] font-mono text-slate-500 text-center">
                          Filtered from Road Memory (Camera-Fixed Ego-Motion)
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSaveTrackToRoadMemory(track)}
                          disabled={isSaved}
                          className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                            isSaved
                              ? 'bg-slate-100 text-teal-800 border border-slate-200'
                              : 'bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200'
                          }`}
                        >
                          {isSaved ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-teal-700" />
                              <span>Saved to Road Memory</span>
                            </>
                          ) : (
                            <>
                              <Save className="w-3.5 h-3.5" />
                              <span>Save to Road Memory</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
