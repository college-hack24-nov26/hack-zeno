import React, { useEffect, useState } from 'react';
import { ShieldAlert, Activity, Wifi, WifiOff, MapPin, Plus, Navigation } from 'lucide-react';
import { fetchHealth } from '../services/api';

interface NavbarProps {
  onOpenReportModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenReportModal }) => {
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [hazardCount, setHazardCount] = useState<number>(0);
  const [gpsActive, setGpsActive] = useState<boolean>(false);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const health = await fetchHealth();
        setBackendOnline(true);
        setHazardCount(health.total_hazards);
      } catch {
        setBackendOnline(false);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 15000); // 15s gentle check
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        () => setGpsActive(true),
        () => setGpsActive(false),
        { timeout: 5000 }
      );
    }
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-[#0f172a] border-b border-slate-800 px-4 py-3 md:px-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Brand identity */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-slate-800 border border-slate-700 text-teal-400">
            <ShieldAlert className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-wider text-white">
                EVEN
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-teal-300 font-semibold tracking-wider">
                PROTOTYPE V1
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium tracking-wide hidden sm:block">
              AI Motorcycle Road Safety & Urban Intelligence
            </p>
          </div>
        </div>

        {/* Telemetry and Action Controls */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Backend Status */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium border ${
              backendOnline
                ? 'bg-slate-800 border-slate-700 text-teal-300'
                : backendOnline === false
                ? 'bg-red-950/40 border-red-800/40 text-red-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
            title={backendOnline ? `FastAPI + SQLite Active (${hazardCount} hazards recorded)` : 'Backend server unreachable. Make sure FastAPI is running on port 8000.'}
          >
            {backendOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-teal-400" />
                <span className="hidden md:inline">SYSTEM ONLINE</span>
                <span className="md:hidden">ONLINE</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-red-400" />
                <span>OFFLINE</span>
              </>
            )}
          </div>

          {/* GPS telemetry indicator */}
          <div
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium border ${
              gpsActive
                ? 'bg-slate-800 border-slate-700 text-teal-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            <Navigation className={`w-3.5 h-3.5 ${gpsActive ? 'text-teal-400' : 'text-slate-500'}`} />
            <span>GPS {gpsActive ? 'LOCKED' : 'STANDBY'}</span>
          </div>

          {/* Quick report button */}
          <button
            onClick={onOpenReportModal}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-teal-600 hover:bg-teal-700 text-white font-medium text-xs sm:text-sm shadow-sm transition-colors active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Report Hazard</span>
          </button>
        </div>
      </div>
    </header>
  );
};
