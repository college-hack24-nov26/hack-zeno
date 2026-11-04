import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  CameraOff,
  Volume2,
  Navigation,
  Sliders,
  ShieldAlert,
  Play,
  RotateCcw,
  Cpu,
  Info,
  Clock,
  AlertTriangle,
  CloudRain,
  Wind,
  Sun,
  CloudLightning,
  Eye,
  RefreshCw,
  Thermometer,
  Droplets,
  CheckCircle2
} from 'lucide-react';
import { fetchHazards, fetchWeatherWarning } from '../services/api';
import type { Hazard, WeatherWarningResponse } from '../types/hazard';
import { SeverityBadge } from '../components/SeverityBadge';

export const RiderSafetyPage: React.FC = () => {
  // Real hazards from database to simulate approaching
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [selectedHazardId, setSelectedHazardId] = useState<number | null>(null);

  // Camera state
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // GPS state
  const [gpsLocked, setGpsLocked] = useState<boolean>(false);
  const [gpsPermissionDenied, setGpsPermissionDenied] = useState<boolean>(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number; speed: number; accuracy: number }>({
    lat: 18.5204,
    lng: 73.8567,
    speed: 42,
    accuracy: 3.5
  });

  // Weather road risk state
  const [weatherData, setWeatherData] = useState<WeatherWarningResponse | null>(null);
  const [weatherLoading, setWeatherLoading] = useState<boolean>(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [lastWeatherFetchTime, setLastWeatherFetchTime] = useState<number>(0);

  // Rider preferences
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [proximityDistance, setProximityDistance] = useState<number>(100);
  const [minSeverity, setMinSeverity] = useState<string>('high');

  // Simulation state
  const [simulatingAlert, setSimulatingAlert] = useState<boolean>(false);
  const [simulatedDistance, setSimulatedDistance] = useState<number>(90);
  const simulationTimerRef = useRef<any>(null);

  // Load real hazards on mount
  useEffect(() => {
    fetchHazards().then((data) => {
      setHazards(data);
      if (data.length > 0) {
        // Pick the first critical hazard by default
        const crit = data.find((h) => h.severity === 'critical') || data[0];
        setSelectedHazardId(crit.id);
      }
    }).catch(console.error);
  }, []);

  const selectedHazard = hazards.find((h) => h.id === selectedHazardId) || hazards[0];

  // Synthesize crystal-clear audio warning chime using client-side Web Audio API (zero external files or network)
  const playWarningBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 tone
      osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.25);

      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch (e) {
      console.warn('Web Audio playback error:', e);
    }
  };

  // Trigger simulated motorcycle approach alert toward the selected hazard
  const triggerHazardAlertSimulation = () => {
    if (simulationTimerRef.current) {
      clearInterval(simulationTimerRef.current);
    }

    setSimulatingAlert(true);
    setSimulatedDistance(95);
    if (soundEnabled) {
      playWarningBeep();
    }

    simulationTimerRef.current = setInterval(() => {
      setSimulatedDistance((prev) => {
        if (prev <= 15) {
          clearInterval(simulationTimerRef.current);
          setTimeout(() => setSimulatingAlert(false), 2800);
          return 12;
        }
        if (soundEnabled && prev % 25 === 0) {
          playWarningBeep();
        }
        return prev - 15;
      });
    }, 650);
  };

  const stopSimulation = () => {
    if (simulationTimerRef.current) {
      clearInterval(simulationTimerRef.current);
    }
    setSimulatingAlert(false);
  };

  // Camera start / stop logic using WebRTC getUserMedia
  const toggleCamera = async () => {
    if (cameraActive) {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
      setCameraActive(false);
      setCameraError(null);
    } else {
      try {
        setCameraError(null);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setCameraActive(true);
      } catch (err: any) {
        setCameraError(err?.message || 'Camera permission denied or camera hardware not found.');
      }
    }
  };

  useEffect(() => {
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
      if (simulationTimerRef.current) {
        clearInterval(simulationTimerRef.current);
      }
    };
  }, []);

  // Weather fetch logic with throttle guard (max 1 query per 60s unless forced)
  const loadWeather = async (lat: number, lng: number, force: boolean = false) => {
    if (!force && Date.now() - lastWeatherFetchTime < 60000 && weatherData) {
      return;
    }
    setWeatherLoading(true);
    setWeatherError(null);
    try {
      const res = await fetchWeatherWarning(lat, lng);
      setWeatherData(res);
      setLastWeatherFetchTime(Date.now());
    } catch (err: any) {
      setWeatherError(err?.message || 'Weather telemetry offline');
    } finally {
      setWeatherLoading(false);
    }
  };

  // Real GPS listener
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGpsPermissionDenied(true);
      loadWeather(coords.lat, coords.lng);
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsLocked(true);
        setGpsPermissionDenied(false);
        const newLat = pos.coords.latitude;
        const newLng = pos.coords.longitude;
        setCoords({
          lat: newLat,
          lng: newLng,
          speed: pos.coords.speed !== null ? Math.round(pos.coords.speed * 3.6) : 42,
          accuracy: pos.coords.accuracy ? Math.round(pos.coords.accuracy) : 4
        });
        loadWeather(newLat, newLng);
      },
      (err) => {
        setGpsLocked(false);
        setGpsPermissionDenied(true);
        // Fallback to initial coordinates
        loadWeather(coords.lat, coords.lng);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 2000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Time to impact in seconds at current speed (42 km/h = 11.67 m/s)
  const speedMps = (coords.speed || 42) * 0.2778;
  const timeToHazard = speedMps > 0 ? (simulatedDistance / speedMps).toFixed(1) : '2.5';

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Rider Safety HUD</h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-teal-700 font-semibold">
              COCKPIT INTERFACE
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            Handlebar phone mount heads-up display, camera feed readiness, and risk warnings
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {simulatingAlert ? (
            <button
              onClick={stopSimulation}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-medium shadow-sm transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Reset Simulation</span>
            </button>
          ) : (
            <button
              onClick={triggerHazardAlertSimulation}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-medium shadow-sm transition-colors cursor-pointer active:scale-95"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start Approach Simulation</span>
            </button>
          )}
        </div>
      </div>

      {/* Honest Simulation Disclaimer Banner */}
      <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <div>
          <strong className="text-slate-900">SIMULATION DEMO:</strong> The approaching hazard warning is an interactive demonstration simulating proximity calculation against real Road Memory database records. No live vehicle tracking or background telematics are active.
        </div>
      </div>

      {/* Approaching Hazard Alert Banner (When Simulation Active) */}
      {simulatingAlert && selectedHazard && (
        <div className="p-4 rounded-lg bg-red-50 border-2 border-red-500 text-slate-900 shadow-sm flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-md bg-red-600 text-white shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-mono font-bold tracking-wider text-red-700">
                  CRITICAL APPROACH WARNING
                </span>
                <span className="text-xs font-mono bg-red-100 text-red-800 px-2 py-0.5 rounded border border-red-300 font-bold">
                  {simulatedDistance}m AHEAD
                </span>
                <span className="text-xs font-mono text-red-700">
                  ~{timeToHazard}s IMPACT
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold tracking-wide text-slate-900 uppercase">
                {selectedHazard.hazard_type.replace(/_/g, ' ')}: {selectedHazard.description}
              </h2>
            </div>
          </div>
          <div className="text-right font-mono hidden sm:block shrink-0">
            <div className="text-xs text-red-700 font-medium">REC SPEED</div>
            <div className="text-xl font-bold text-red-700">&lt; 25 KM/H</div>
          </div>
        </div>
      )}

      {/* Cockpit HUD & Camera Viewfinder */}
      <div className="relative aspect-video w-full max-h-[480px] rounded-lg bg-slate-950 border border-slate-800 overflow-hidden shadow-md flex flex-col justify-between p-4 md:p-6">
        {/* Actual Video Element */}
        <video
          ref={videoRef}
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            cameraActive ? 'opacity-90' : 'opacity-0 pointer-events-none'
          }`}
        />

        {/* Reticle Overlay */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="relative w-48 h-32 md:w-72 md:h-44 border border-dashed border-teal-500/40 rounded-lg flex items-center justify-center">
            <span className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-teal-400" />
            <span className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-teal-400" />
            <span className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-teal-400" />
            <span className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-teal-400" />

            <div className="text-center font-mono text-[10px] md:text-xs text-teal-300 bg-slate-950/80 px-2 py-1 rounded border border-teal-500/30">
              {cameraActive ? (
                <span>CAMERA PREVIEW ACTIVE</span>
              ) : (
                <span>OPTICAL PREVIEW STANDBY</span>
              )}
            </div>
          </div>
        </div>

        {/* HUD Top Bar */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-md border border-slate-800 text-xs font-mono text-slate-300">
            <Cpu className="w-3.5 h-3.5 text-teal-400" />
            <span>OPTICAL HARDWARE: {cameraActive ? 'STREAM CONNECTED' : 'STANDBY'}</span>
          </div>

          {/* Speedometer Telemetry */}
          <div className="bg-slate-900/80 px-4 py-1.5 rounded-md border border-slate-800 text-center font-mono">
            <span className="text-xl md:text-2xl font-bold text-white">{coords.speed || 42}</span>
            <span className="text-[10px] text-slate-400 ml-1">KM/H</span>
          </div>
        </div>

        {/* Center Prompt if Camera Inactive */}
        {!cameraActive && (
          <div className="relative z-10 text-center space-y-3 py-8">
            <div className="inline-flex p-3 rounded-lg bg-slate-900 border border-slate-800 text-teal-400">
              <Camera className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Live Camera Preview Feed</h2>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mt-0.5">
                Enable device camera to test handlebar phone mount alignment. Optical AI road hazard inference will be integrated in Phase 2.
              </p>
            </div>
            <button
              onClick={toggleCamera}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium transition-colors cursor-pointer shadow-sm"
            >
              <Camera className="w-4 h-4" />
              <span>Enable Device Camera</span>
            </button>
          </div>
        )}

        {/* HUD Bottom Bar */}
        <div className="relative z-10 flex items-end justify-between">
          <div className="bg-slate-900/80 px-3 py-2 rounded-md border border-slate-800 space-y-0.5 text-xs font-mono text-slate-300">
            <div className="flex items-center gap-1.5 text-teal-400 font-semibold">
              <Navigation className="w-3.5 h-3.5" />
              <span>Browser GPS: {coords.lat.toFixed(5)}°, {coords.lng.toFixed(5)}°</span>
            </div>
            <div className="text-[10px] text-slate-400">
              Accuracy: ~{coords.accuracy || 3}m • Status: {gpsLocked ? 'LOCKED' : 'ESTIMATED'}
            </div>
          </div>

          {cameraActive && (
            <button
              onClick={toggleCamera}
              className="flex items-center gap-1.5 bg-red-950/80 hover:bg-red-900 border border-red-500/50 px-3 py-1.5 rounded-md text-xs font-mono text-red-300 transition-colors cursor-pointer"
            >
              <CameraOff className="w-3.5 h-3.5" />
              <span>Disconnect Camera</span>
            </button>
          )}
        </div>
      </div>

      {cameraError && (
        <div className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
          Camera Error: {cameraError}
        </div>
      )}

      {/* Weather-Based Road Safety Warning Panel */}
      <div className="p-5 rounded-lg bg-white border border-slate-200 shadow-sm space-y-4">
        {/* Header with Risk Level Pill & Telemetry Source */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-md border ${
              weatherData?.risk_level === 'HIGH_CAUTION'
                ? 'bg-red-50 border-red-200 text-red-700'
                : weatherData?.risk_level === 'CAUTION'
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-teal-50 border-teal-200 text-teal-700'
            }`}>
              {weatherData?.weather_code && weatherData.weather_code >= 95 ? (
                <CloudLightning className="w-5 h-5 text-red-600" />
              ) : weatherData?.precipitation_mm && weatherData.precipitation_mm > 0 ? (
                <CloudRain className="w-5 h-5 text-teal-600" />
              ) : weatherData?.wind_speed_kmh && weatherData.wind_speed_kmh >= 30 ? (
                <Wind className="w-5 h-5 text-teal-600" />
              ) : (
                <Sun className="w-5 h-5 text-amber-600" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Atmospheric Road Risk Telemetry
                </h3>
                {weatherData && (
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${
                    weatherData.risk_level === 'HIGH_CAUTION'
                      ? 'bg-red-50 border-red-200 text-red-700'
                      : weatherData.risk_level === 'CAUTION'
                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                      : 'bg-teal-50 border-teal-200 text-teal-800'
                  }`}>
                    {weatherData.risk_level === 'HIGH_CAUTION'
                      ? 'HIGH CAUTION'
                      : weatherData.risk_level === 'CAUTION'
                      ? 'WEATHER CAUTION'
                      : 'NORMAL CONDITIONS'}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Live Open-Meteo atmospheric telemetry evaluated against two-wheeler surface adhesion thresholds
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* GPS derivation tag */}
            <span className={`text-[10px] font-mono px-2 py-1 rounded-md border flex items-center gap-1 ${
              gpsLocked
                ? 'bg-slate-100 border-slate-200 text-teal-700 font-medium'
                : 'bg-slate-100 border-slate-200 text-slate-600'
            }`}>
              <Navigation className="w-3 h-3 text-teal-600" />
              <span>{gpsLocked ? `GPS FIX (±${coords.accuracy}m)` : 'FALLBACK COORDS (NO GPS)'}</span>
            </span>

            {/* Manual refresh button */}
            <button
              onClick={() => loadWeather(coords.lat, coords.lng, true)}
              disabled={weatherLoading}
              className="p-1.5 rounded-md bg-white hover:bg-slate-50 text-slate-600 border border-slate-300 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh weather data from Open-Meteo"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${weatherLoading ? 'animate-spin text-teal-600' : ''}`} />
            </button>
          </div>
        </div>

        {weatherError && (
          <div className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
            {weatherError}
          </div>
        )}

        {/* 4-Card Weather Metrics Grid */}
        {weatherData && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* 1. Temperature */}
            <div className="p-3 rounded-md bg-slate-50 border border-slate-200 space-y-1">
              <div className="flex items-center justify-between text-slate-500 text-xs">
                <span className="flex items-center gap-1 font-medium">
                  <Thermometer className="w-3.5 h-3.5 text-slate-600" />
                  <span>Temperature</span>
                </span>
                <span className="text-[10px] font-mono">2m AGL</span>
              </div>
              <div className="text-lg font-bold text-slate-900 font-mono">
                {weatherData.temperature_c !== null ? `${weatherData.temperature_c}°C` : '--'}
              </div>
              <div className="text-[10px] text-slate-500 truncate">
                Feels like {weatherData.apparent_temperature_c}°C • {weatherData.weather_description}
              </div>
            </div>

            {/* 2. Precipitation */}
            <div className={`p-3 rounded-md border space-y-1 ${
              (weatherData.precipitation_mm || 0) > 0
                ? 'bg-amber-50 border-amber-200'
                : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between text-slate-500 text-xs">
                <span className="flex items-center gap-1 font-medium">
                  <Droplets className="w-3.5 h-3.5 text-teal-600" />
                  <span>Precipitation</span>
                </span>
                <span className="text-[10px] font-mono">Intensity</span>
              </div>
              <div className={`text-lg font-bold font-mono ${
                (weatherData.precipitation_mm || 0) > 0 ? 'text-amber-800' : 'text-slate-900'
              }`}>
                {weatherData.precipitation_mm !== null ? `${weatherData.precipitation_mm} mm/h` : '--'}
              </div>
              <div className="text-[10px] text-slate-500">
                {(weatherData.precipitation_mm || 0) >= 2.5
                  ? 'Heavy Standing Water'
                  : (weatherData.precipitation_mm || 0) > 0
                  ? 'Wet Asphalt Friction'
                  : 'Dry Road Surface'}
              </div>
            </div>

            {/* 3. Wind Speed */}
            <div className={`p-3 rounded-md border space-y-1 ${
              (weatherData.wind_speed_kmh || 0) >= 30
                ? 'bg-amber-50 border-amber-200'
                : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between text-slate-500 text-xs">
                <span className="flex items-center gap-1 font-medium">
                  <Wind className="w-3.5 h-3.5 text-slate-600" />
                  <span>Wind Speed</span>
                </span>
                <span className="text-[10px] font-mono">10m AGL</span>
              </div>
              <div className="text-lg font-bold text-slate-900 font-mono">
                {weatherData.wind_speed_kmh !== null ? `${weatherData.wind_speed_kmh} km/h` : '--'}
              </div>
              <div className="text-[10px] text-slate-500">
                Gusts to {weatherData.wind_gusts_kmh || 0} km/h • {(weatherData.wind_speed_kmh || 0) >= 35 ? 'Lateral Force' : 'Stable'}
              </div>
            </div>

            {/* 4. Visibility */}
            <div className={`p-3 rounded-md border space-y-1 ${
              weatherData.visibility_m && weatherData.visibility_m < 1000
                ? 'bg-amber-50 border-amber-200'
                : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between text-slate-500 text-xs">
                <span className="flex items-center gap-1 font-medium">
                  <Eye className="w-3.5 h-3.5 text-teal-600" />
                  <span>Visual Range</span>
                </span>
                <span className="text-[10px] font-mono">Line of Sight</span>
              </div>
              <div className="text-lg font-bold text-slate-900 font-mono">
                {weatherData.visibility_m != null
                  ? `${(weatherData.visibility_m / 1000).toFixed(1)} km`
                  : '10.0+ km'}
              </div>
              <div className="text-[10px] text-slate-500">
                {weatherData.visibility_m && weatherData.visibility_m < 500
                  ? 'Severe Fog Hazard'
                  : weatherData.visibility_m && weatherData.visibility_m < 1000
                  ? 'Mist / Fog Caution'
                  : 'Clear Visual Horizon'}
              </div>
            </div>
          </div>
        )}

        {/* Primary Advisory Banner */}
        {weatherData && (
          <div className={`p-3.5 rounded-md border flex items-start gap-2.5 text-xs ${
            weatherData.risk_level === 'HIGH_CAUTION'
              ? 'bg-red-50 border-red-200 text-red-800'
              : weatherData.risk_level === 'CAUTION'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-slate-50 border-slate-200 text-slate-800'
          }`}>
            <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${
              weatherData.risk_level === 'HIGH_CAUTION'
                ? 'text-red-700'
                : weatherData.risk_level === 'CAUTION'
                ? 'text-amber-700'
                : 'text-slate-600'
            }`} />
            <div className="space-y-1">
              <span className="font-bold text-slate-900 block">
                {weatherData.risk_level === 'HIGH_CAUTION'
                  ? 'CRITICAL ATMOSPHERIC ROAD ADVISORY'
                  : weatherData.risk_level === 'CAUTION'
                  ? 'ELEVATED ROAD SURFACE ADVISORY'
                  : 'STANDARD ROAD TRACTION ADVISORY'}
              </span>
              <p className="leading-relaxed">{weatherData.primary_warning}</p>
              {weatherData.active_hazards.length > 1 && (
                <ul className="list-disc list-inside space-y-0.5 pt-1 text-[11px] opacity-90">
                  {weatherData.active_hazards.slice(1).map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Attribution, Timestamps & Honest Disclaimer Footer */}
        {weatherData && (
          <div className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10px] text-slate-500 font-mono">
            <div className="flex flex-wrap items-center gap-2">
              <span>Observation: {weatherData.data_timestamp || 'Recent'}</span>
              <span>•</span>
              <span className="text-slate-600">
                {weatherData.status === 'cached'
                  ? `Cached (${weatherData.cache_age_seconds ? Math.round(weatherData.cache_age_seconds) : 0}s ago)`
                  : 'Live Open-Meteo Query'}
              </span>
              {weatherData.is_stale && (
                <span className="text-amber-700 font-semibold">[STALE DATA]</span>
              )}
            </div>
            <div className="text-slate-500">
              {weatherData.attribution}
            </div>
          </div>
        )}

        <div className="text-[10px] text-slate-500 italic">
          Disclaimer: Weather safety assessments are advisory warnings derived from atmospheric sensors. Weather conditions alone do not predict road accidents; road surface integrity, rider caution, and speed are primary factors.
        </div>
      </div>

      {/* Target Hazard Selector for Demo */}
      <div className="p-5 rounded-lg bg-white border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-slate-600" />
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Select Road Memory Hazard to Simulate
            </h3>
          </div>
          <span className="text-xs font-mono text-slate-500">
            {hazards.length} Available from SQLite
          </span>
        </div>

        <select
          value={selectedHazardId || ''}
          onChange={(e) => setSelectedHazardId(Number(e.target.value))}
          className="w-full bg-slate-50 border border-slate-300 rounded-md px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-teal-500 font-mono"
        >
          {hazards.map((h) => (
            <option key={h.id} value={h.id}>
              #{h.id} [{h.severity.toUpperCase()}] {h.hazard_type.replace(/_/g, ' ')} — {h.description.slice(0, 75)}...
            </option>
          ))}
        </select>
      </div>

      {/* Warning Settings & Audio Chime */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Sound Settings */}
        <div className="p-5 rounded-lg bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-slate-100 text-slate-700">
                <Volume2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Cockpit Audio Alert</h3>
                <p className="text-[11px] text-slate-500">Offline Web Audio synthesizer tone</p>
              </div>
            </div>
            <button
              onClick={() => {
                setSoundEnabled(!soundEnabled);
                if (!soundEnabled) playWarningBeep();
              }}
              className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors cursor-pointer ${
                soundEnabled
                  ? 'bg-teal-50 border-teal-200 text-teal-800 font-semibold'
                  : 'bg-slate-100 border-slate-200 text-slate-600'
              }`}
            >
              {soundEnabled ? 'ENABLED' : 'MUTED'}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-700">Acoustic Chime Test:</span>
            <button
              onClick={playWarningBeep}
              className="px-3 py-1.5 rounded-md bg-white hover:bg-slate-50 border border-slate-300 text-xs font-mono text-slate-700 shadow-sm transition-colors cursor-pointer"
            >
              Play Test Tone (880Hz)
            </button>
          </div>

          <div className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-md border border-slate-200">
            Synthesized directly inside the browser using Web Audio API oscillators. Works 100% offline with zero external audio assets or network streams.
          </div>
        </div>

        {/* Proximity Threshold */}
        <div className="p-5 rounded-lg bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-slate-100 text-slate-700">
                <Sliders className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Proximity Threshold</h3>
                <p className="text-[11px] text-slate-500">Alert trigger distance window</p>
              </div>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs font-mono mb-1.5">
              <span className="text-slate-700">Warning Distance Ahead:</span>
              <span className="text-teal-700 font-bold">{proximityDistance} Meters</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[50, 100, 200].map((dist) => (
                <button
                  key={dist}
                  onClick={() => setProximityDistance(dist)}
                  className={`py-1.5 text-xs font-mono font-medium rounded-md border transition-colors cursor-pointer ${
                    proximityDistance === dist
                      ? 'bg-teal-50 border-teal-300 text-teal-800 font-bold'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {dist}m
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-700 mb-1.5">
              Minimum Severity Filter:
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'medium', label: 'Medium+' },
                { id: 'high', label: 'High+' },
                { id: 'critical', label: 'Critical Only' }
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setMinSeverity(item.id)}
                  className={`py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                    minSeverity === item.id
                      ? 'bg-teal-50 border-teal-300 text-teal-800 font-bold'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
