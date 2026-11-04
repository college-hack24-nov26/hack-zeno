import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Database,
  Map as MapIcon,
  ShieldCheck,
  Building2,
  Cpu,
  Layers,
  Info,
  Video
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const navItems = [
    {
      to: '/',
      label: 'Overview',
      subtitle: 'System Telemetry',
      icon: LayoutDashboard,
    },
    {
      to: '/memory',
      label: 'Road Memory',
      subtitle: 'Hazard Catalog',
      icon: Database,
    },
    {
      to: '/map',
      label: 'Live Hazard Map',
      subtitle: 'Spatial Leaflet GIS',
      icon: MapIcon,
    },
    {
      to: '/live-camera',
      label: 'Live Pothole Camera',
      subtitle: 'Real-Time Edge Scan',
      icon: Video,
      badge: 'LIVE ONNX'
    },
    {
      to: '/safety',
      label: 'Rider Safety HUD',
      subtitle: 'Edge Vision & Alerts',
      icon: ShieldCheck,
      badge: 'COCKPIT'
    },
    {
      to: '/intelligence',
      label: 'Urban Intelligence',
      subtitle: 'Municipal Works',
      icon: Building2,
    },
  ];

  return (
    <aside className="hidden lg:flex flex-col w-64 border-r border-slate-800 bg-[#0f172a] min-h-[calc(100vh-61px)] p-4 select-none">
      <div className="text-[11px] font-mono tracking-wider text-slate-400 uppercase px-3 mb-2 font-semibold flex items-center justify-between">
        <span>Navigation Channels</span>
        <span className="text-[10px] text-teal-400">v1.0</span>
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `group flex items-center justify-between px-3.5 py-2.5 text-sm font-medium transition-colors border-y border-transparent ${
                  isActive
                    ? 'bg-slate-800/90 text-teal-300 border-l-2 border-l-teal-500 rounded-r-md rounded-l-none font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 rounded-md border-l-2 border-l-transparent'
                }`
              }
            >
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-md bg-slate-900 border border-slate-800 group-hover:border-slate-700 transition-colors">
                  <Icon className="w-4 h-4 text-teal-400" />
                </div>
                <div className="text-left">
                  <div className="leading-tight">{item.label}</div>
                  <div className="text-[10px] text-slate-400 font-normal">{item.subtitle}</div>
                </div>
              </div>
              {item.badge && (
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-teal-300 border border-slate-700">
                  {item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Edge Architecture Indicator */}
      <div className="mt-auto pt-4 border-t border-slate-800 space-y-2">
        <div className="p-3 rounded-md bg-slate-900 border border-slate-800 text-xs">
          <div className="flex items-center gap-2 text-slate-300 font-semibold mb-1">
            <Cpu className="w-4 h-4 text-teal-400" />
            <span>Edge Architecture</span>
          </div>
          <div className="space-y-1 text-[11px] text-slate-400 font-mono">
            <div className="flex justify-between">
              <span>Stack:</span>
              <span className="text-slate-200">FastAPI + React</span>
            </div>
            <div className="flex justify-between">
              <span>Database:</span>
              <span className="text-teal-300">Local SQLite</span>
            </div>
            <div className="flex justify-between">
              <span>Cost / APIs:</span>
              <span className="text-teal-300">$0 / Zero Paid APIs</span>
            </div>
          </div>
        </div>

        <div className="p-2.5 rounded-md bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400 leading-relaxed flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-teal-400 mt-0.5 shrink-0" />
          <span>Designed for motorcycle cockpit mount & municipal desktop operations.</span>
        </div>
      </div>
    </aside>
  );
};
