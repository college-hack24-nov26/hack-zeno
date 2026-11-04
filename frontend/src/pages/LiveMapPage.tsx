import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Compass,
  MapPin,
  RefreshCw,
  Info,
  ShieldCheck,
  Filter,
  CheckCircle2,
  Camera
} from 'lucide-react';
import { fetchHazards } from '../services/api';
import type { Hazard, SeverityLevel } from '../types/hazard';
import { getHazardVisual } from '../utils/hazardVisual';

interface LiveMapPageProps {
  onInspectHazard: (hazard: Hazard) => void;
}

export const LiveMapPage: React.FC<LiveMapPageProps> = ({ onInspectHazard }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const riderMarkerRef = useRef<L.Marker | null>(null);

  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [locatingUser, setLocatingUser] = useState<boolean>(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  // Load hazards from backend
  const loadData = async () => {
    try {
      setLoading(true);
      const data = await fetchHazards();
      setHazards(data);
    } catch (err) {
      console.error('Failed to load hazards for map:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    // Default center around urban sample area (Pune: 18.525, 73.855)
    const initialCenter: [number, number] = [18.525, 73.855];

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 13,
      zoomControl: false,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Standard OpenStreetMap tiles (100% free, zero API key required)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
    }).addTo(map);

    const markersGroup = L.layerGroup().addTo(map);
    markersLayerRef.current = markersGroup;
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Markers when hazards or filters change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    const filtered = hazards.filter((h) => {
      if (selectedType !== 'all' && h.hazard_type !== selectedType) return false;
      if (selectedSeverity !== 'all' && h.severity !== selectedSeverity) return false;
      if (selectedStatus !== 'all' && h.confirmation_status !== selectedStatus) return false;
      return true;
    });

    const markerBounds: [number, number][] = [];

    filtered.forEach((h) => {
      const colors: Record<SeverityLevel, { bg: string; text: string }> = {
        critical: { bg: '#dc2626', text: '#ffffff' },
        high: { bg: '#d97706', text: '#ffffff' },
        medium: { bg: '#64748b', text: '#ffffff' },
        low: { bg: '#0d9488', text: '#ffffff' }
      };

      const c = colors[h.severity] || colors.medium;

      // Solid, high-contrast marker icon
      const customIcon = L.divIcon({
        className: 'custom-hazard-marker',
        html: `
          <div style="width: 22px; height: 22px; border-radius: 50%; background: ${c.bg}; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.25); display: flex; align-items: center; justify-content: center; color: white; font-size: 11px; font-weight: 700;">
            !
          </div>
        `,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -11]
      });

      const marker = L.marker([h.latitude, h.longitude], { icon: customIcon });

      const visual = getHazardVisual(h);

      const statusLabel =
        h.confirmation_status === 'confirmed'
          ? `Corroborated (${(h.corroboration_count || 0) + 1} Reports)`
          : h.confirmation_status === 'resolved'
          ? 'Resolved'
          : 'Unverified (1 Report)';

      // Light popup matching operations theme
      const popupHtml = `
        <div style="min-width: 230px; padding: 4px; font-family: ui-sans-serif, system-ui, sans-serif; color: #0f172a;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <span style="font-size: 11px; font-family: monospace; color: #64748b; font-weight: 600;">#${h.id} • ${h.source.toUpperCase()}</span>
            <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; background: ${c.bg}; color: white;">
              ${h.severity}
            </span>
          </div>
          <div style="position: relative; width: 100%; height: 95px; border-radius: 6px; overflow: hidden; margin-bottom: 6px; border: 1px solid #cbd5e1; background: #0f172a;">
            <img src="${visual.imageUrl}" alt="${visual.label}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='/placeholders/pothole.jpg'" />
            <div style="position: absolute; bottom: 4px; left: 6px; font-size: 9px; font-family: monospace; background: rgba(15,23,42,0.88); color: ${visual.isRealPhoto ? '#6ee7b7' : '#fcd34d'}; padding: 2px 5px; border-radius: 3px; border: 1px solid rgba(255,255,255,0.15);">
              ${visual.isRealPhoto ? 'Photo Evidence' : 'Illustrative — not original report evidence'}
            </div>
          </div>
          <div style="font-size: 14px; font-weight: 700; color: #0f172a; text-transform: capitalize; margin-bottom: 4px;">
            ${h.hazard_type.replace(/_/g, ' ')}
          </div>
          <div style="font-size: 12px; color: #475569; line-height: 1.4; margin-bottom: 6px;">
            ${h.description}
          </div>
          <div style="font-size: 11px; font-family: monospace; color: #0f766e; margin-bottom: 4px;">
            📍 ${h.latitude.toFixed(4)}, ${h.longitude.toFixed(4)}
          </div>
          <div style="font-size: 10px; color: #64748b; margin-bottom: 6px;">
            Status: <strong style="color: #0f766e;">${statusLabel}</strong> • Conf: ${(h.confidence * 100).toFixed(0)}%
          </div>
          <div style="font-size: 10px; color: #64748b; font-style: italic; margin-bottom: 8px;">
            ${h.status_reason || ''}
          </div>
          <button id="inspect-btn-${h.id}" style="width: 100%; padding: 6px 10px; background: #0f766e; color: white; border: none; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;">
            Inspect Optical Evidence
          </button>
        </div>
      `;

      marker.bindPopup(popupHtml);

      marker.on('popupopen', () => {
        const btn = document.getElementById(`inspect-btn-${h.id}`);
        if (btn) {
          btn.onclick = () => onInspectHazard(h);
        }
      });

      marker.addTo(layer);
      markerBounds.push([h.latitude, h.longitude]);
    });

    if (markerBounds.length > 0 && !userLocation) {
      map.fitBounds(L.latLngBounds(markerBounds), { padding: [40, 40], maxZoom: 14 });
    }
  }, [hazards, selectedType, selectedSeverity, selectedStatus, onInspectHazard, userLocation]);

  // Handle Locate Me
  const handleLocateMe = () => {
    if (!('geolocation' in navigator)) {
      alert('Browser geolocation is not available.');
      return;
    }
    setLocatingUser(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLocation([lat, lng]);
        setLocatingUser(false);

        const map = mapInstanceRef.current;
        if (map) {
          map.setView([lat, lng], 15);

          if (riderMarkerRef.current) {
            riderMarkerRef.current.setLatLng([lat, lng]);
          } else {
            const riderIcon = L.divIcon({
              className: 'rider-gps-marker',
              html: `
                <div style="width: 20px; height: 20px; border-radius: 50%; background: #0d9488; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>
              `,
              iconSize: [20, 20],
              iconAnchor: [10, 10],
            });

            const marker = L.marker([lat, lng], { icon: riderIcon })
              .addTo(map)
              .bindPopup('<strong style="color: #0f766e;">Your Device Location</strong><br><span style="font-size: 11px; color: #64748b;">Browser Geolocation Readout</span>');
            riderMarkerRef.current = marker;
          }
        }
      },
      (err) => {
        setLocatingUser(false);
        alert(`Location acquisition failed: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="space-y-4">
      {/* Map Control Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Live Hazard Map</h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-teal-700 font-semibold">
              OPENSTREETMAP LEAFLET
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            Spatial visualization of road hazards from local SQLite Road Memory
          </p>
        </div>

        {/* Action and Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Type Filter */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-md px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-teal-500 focus:bg-white"
          >
            <option value="all">All Types</option>
            <option value="pothole">Potholes</option>
            <option value="obstacle">Obstacles</option>
            <option value="roadblock">Roadblocks</option>
            <option value="unsafe_condition">Unsafe Conditions</option>
            <option value="oil_spill">Oil Spills</option>
            <option value="unmarked_speed_bump">Speed Bumps</option>
            <option value="gravel">Gravel Patches</option>
            <option value="waterlogging">Waterlogging</option>
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-md px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-teal-500 focus:bg-white"
          >
            <option value="all">All Statuses</option>
            <option value="confirmed">Corroborated</option>
            <option value="unconfirmed">Unverified</option>
            <option value="resolved">Resolved</option>
          </select>

          {/* Severity Filter Pills */}
          <div className="flex items-center bg-slate-100 border border-slate-200 rounded-md p-0.5 text-xs">
            {['all', 'critical', 'high', 'medium', 'low'].map((sev) => (
              <button
                key={sev}
                onClick={() => setSelectedSeverity(sev)}
                className={`px-2.5 py-1 rounded capitalize font-medium transition-colors cursor-pointer ${
                  selectedSeverity === sev
                    ? 'bg-white text-teal-700 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>

          {/* Locate Me Button */}
          <button
            onClick={handleLocateMe}
            disabled={locatingUser}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-medium shadow-sm transition-colors cursor-pointer disabled:opacity-50"
            title="Pan to current device GPS position"
          >
            <Compass className={`w-3.5 h-3.5 text-slate-500 ${locatingUser ? 'animate-spin' : ''}`} />
            <span>{locatingUser ? 'Locating...' : 'Locate Me'}</span>
          </button>

          {/* Refresh */}
          <button
            onClick={loadData}
            className="p-1.5 rounded-md bg-white hover:bg-slate-50 border border-slate-300 text-slate-600 shadow-sm transition-colors cursor-pointer"
            title="Reload hazards"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Interactive Leaflet Map Container */}
      <div className="relative w-full h-[65vh] min-h-[460px] rounded-lg border border-slate-200 overflow-hidden shadow-sm bg-slate-100">
        <div ref={mapContainerRef} className="w-full h-full z-10" />

        {/* Legend */}
        <div className="absolute bottom-4 left-4 z-20 bg-white/95 border border-slate-200 rounded-md p-3 shadow-md max-w-xs text-xs space-y-2 pointer-events-auto">
          <div className="text-[11px] font-mono font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
            <span>Hazard Risk Legend</span>
            <span className="text-[10px] text-teal-700">{hazards.length} total in DB</span>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
              <span className="text-slate-700">Critical</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-600" />
              <span className="text-slate-700">High Risk</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
              <span className="text-slate-700">Medium</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-600" />
              <span className="text-slate-700">Low / Minor</span>
            </div>
          </div>
        </div>

        {/* Architecture Disclaimer */}
        <div className="absolute top-4 right-4 z-20 hidden sm:flex items-center gap-2 bg-white/95 border border-slate-200 rounded-md px-3 py-1.5 text-[11px] font-mono text-slate-600 shadow-md pointer-events-auto">
          <Info className="w-3.5 h-3.5 text-teal-600 shrink-0" />
          <span>OpenStreetMap Raster Tiles • Local SQLite Edge GIS • Zero Paid APIs</span>
        </div>
      </div>
    </div>
  );
};
