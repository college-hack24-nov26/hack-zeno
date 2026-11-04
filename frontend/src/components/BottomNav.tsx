import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Database, Map as MapIcon, Video, ShieldCheck, Building2 } from 'lucide-react';

export const BottomNav: React.FC = () => {
  const items = [
    { to: '/', label: 'Overview', icon: LayoutDashboard },
    { to: '/memory', label: 'Memory', icon: Database },
    { to: '/map', label: 'Map', icon: MapIcon },
    { to: '/live-camera', label: 'Live Cam', icon: Video },
    { to: '/safety', label: 'HUD', icon: ShieldCheck },
    { to: '/intelligence', label: 'Urban', icon: Building2 },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0f172a] border-t border-slate-800 px-2 py-1.5 flex items-center justify-around safe-bottom">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-1 px-2.5 rounded-md text-xs font-medium transition-colors ${
                isActive
                  ? 'text-teal-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div
                  className={`p-1 rounded-md transition-colors ${
                    isActive ? 'bg-slate-800 text-teal-400' : 'text-slate-400'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[10px] tracking-tight mt-0.5">{item.label}</span>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
};
