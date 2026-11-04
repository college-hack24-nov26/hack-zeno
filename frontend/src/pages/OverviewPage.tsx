import React, { useEffect, useState } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  ShieldCheck,
  Users,
  Activity,
  ArrowRight,
  TrendingUp,
  Cpu,
  Layers,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { fetchOverviewAnalytics } from '../services/api';
import { HazardSummary, Hazard } from '../types/hazard';
import { SeverityBadge } from '../components/SeverityBadge';
import { ConfirmationBadge } from '../components/ConfirmationBadge';
import { Link } from 'react-router-dom';

interface OverviewPageProps {
  onOpenReportModal: () => void;
  onInspectHazard: (hazard: Hazard) => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({
  onOpenReportModal,
  onInspectHazard
}) => {
  const [data, setData] = useState<HazardSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const summary = await fetchOverviewAnalytics();
      setData(summary);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load telemetry summary');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const total = data?.total_hazards || 0;
  const critical = data?.critical_count || 0;
  const high = data?.high_count || 0;
  const medium = data?.medium_count || 0;
  const low = data?.low_count || 0;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-lg bg-white border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-mono font-medium">
              <span className="w-2 h-2 rounded-full bg-teal-600" />
              <span>EVEN SYSTEM TELEMETRY</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Motorcycle Road Safety & Edge Risk Engine
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Real-time road hazard aggregation, multi-rider consensus verification, and urban infrastructure intelligence.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={loadData}
              className="flex items-center gap-2 px-3 py-2 rounded-md bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium border border-slate-300 shadow-sm transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={onOpenReportModal}
              className="flex items-center gap-2 px-3.5 py-2 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium shadow-sm transition-colors cursor-pointer"
            >
              <span>+ Record Road Hazard</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-md bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between">
          <span>Failed to connect to backend: {error}</span>
          <button onClick={loadData} className="underline text-xs ml-4">Retry</button>
        </div>
      )}

      {/* Primary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Hazards */}
        <div className="p-5 rounded-lg bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-mono font-medium uppercase tracking-wider">Total Hazards</span>
            <div className="p-1.5 rounded-md bg-slate-100 text-slate-600">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-slate-900 font-mono">{total}</div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1 font-mono">
            <span className="text-teal-700 font-semibold">Stored</span> in SQLite Road Memory
          </div>
        </div>

        {/* Critical Hazards */}
        <div className="p-5 rounded-lg bg-white border border-red-200 shadow-sm">
          <div className="flex items-center justify-between text-red-700 mb-2">
            <span className="text-xs font-mono font-medium uppercase tracking-wider">Critical Hazards</span>
            <div className="p-1.5 rounded-md bg-red-50 text-red-600">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-red-600 font-mono">{critical}</div>
          <div className="mt-2 text-[11px] text-red-700 flex items-center gap-1 font-mono">
            <span>Severe rim/traction hazards</span>
          </div>
        </div>

        {/* Confirmed Hazards */}
        <div className="p-5 rounded-lg bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-mono font-medium uppercase tracking-wider">Confirmed Hazards</span>
            <div className="p-1.5 rounded-md bg-teal-50 text-teal-700">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-slate-900 font-mono">{data?.confirmed_count || 0}</div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1 font-mono">
            <span>Multi-report verified</span>
          </div>
        </div>

        {/* Active Rider Reports */}
        <div className="p-5 rounded-lg bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-mono font-medium uppercase tracking-wider">Active Riders</span>
              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200 font-medium">DEMO</span>
            </div>
            <div className="p-1.5 rounded-md bg-slate-100 text-slate-600">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-slate-900 font-mono">{data?.active_riders_simulated || 14}</div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1 font-mono">
            <span>Connected edge fleet</span>
          </div>
        </div>
      </div>

      {/* Two Column Layout: Severity Distribution & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Severity Distribution */}
        <div className="p-5 rounded-lg bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Hazard Severity Ratios</h2>
              <p className="text-xs text-slate-500">Risk classification across active corridors</p>
            </div>
            <Activity className="w-4 h-4 text-teal-600" />
          </div>

          <div className="space-y-3.5 pt-1">
            {/* Critical */}
            <div>
              <div className="flex justify-between text-xs font-mono mb-1">
                <span className="text-red-700 font-semibold">Critical Risk</span>
                <span className="text-slate-600">{critical} ({total ? Math.round((critical / total) * 100) : 0}%)</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-red-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${total ? (critical / total) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* High */}
            <div>
              <div className="flex justify-between text-xs font-mono mb-1">
                <span className="text-amber-800 font-semibold">High Risk</span>
                <span className="text-slate-600">{high} ({total ? Math.round((high / total) * 100) : 0}%)</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-amber-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${total ? (high / total) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Medium */}
            <div>
              <div className="flex justify-between text-xs font-mono mb-1">
                <span className="text-slate-700 font-semibold">Medium Risk</span>
                <span className="text-slate-600">{medium} ({total ? Math.round((medium / total) * 100) : 0}%)</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-slate-400 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${total ? (medium / total) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Low */}
            <div>
              <div className="flex justify-between text-xs font-mono mb-1">
                <span className="text-teal-700 font-semibold">Low Risk / Minor</span>
                <span className="text-slate-600">{low} ({total ? Math.round((low / total) * 100) : 0}%)</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-teal-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${total ? (low / total) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>

          {/* Quick link to Map */}
          <div className="pt-3 border-t border-slate-200">
            <Link
              to="/map"
              className="flex items-center justify-between text-xs font-medium text-teal-700 hover:text-teal-800 group"
            >
              <span>View spatial cluster in Leaflet Map</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>

        {/* Recent Hazard Activity Feed */}
        <div className="lg:col-span-2 p-5 rounded-lg bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Recent Hazard Telemetry</h2>
              <p className="text-xs text-slate-500">Chronological stream of incoming road memory records</p>
            </div>
            <Link
              to="/memory"
              className="text-xs font-medium text-slate-500 hover:text-teal-700 flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-2.5">
            {data?.recent_activity && data.recent_activity.length > 0 ? (
              data.recent_activity.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onInspectHazard(item)}
                  className="p-3.5 rounded-md bg-slate-50 hover:bg-slate-100/80 border border-slate-200 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-slate-900 uppercase">
                        {item.hazard_type.replace(/_/g, ' ')}
                      </span>
                      <SeverityBadge severity={item.severity} />
                      <ConfirmationBadge status={item.confirmation_status} />
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-1 max-w-lg">
                      {item.description}
                    </p>
                  </div>

                  <div className="text-right sm:shrink-0 text-[11px] font-mono text-slate-500">
                    <div>{new Date(item.reported_at).toLocaleTimeString()}</div>
                    <div>
                      GPS: {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-slate-400 text-xs font-mono">
                No recent road hazard telemetry recorded.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Core Platform Architecture Blueprint */}
      <div className="p-5 rounded-lg bg-white border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">EVEN System Concept Architecture</h2>
            <p className="text-xs text-slate-500">Complete edge-to-municipal road safety loop</p>
          </div>
          <span className="text-xs font-mono text-teal-700 font-medium">Zero Paid APIs • Local SQLite</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
          <div className="p-3.5 rounded-md bg-slate-50 border border-slate-200 space-y-1">
            <div className="text-teal-700 font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-teal-600" />
              <span>1. Edge Perception</span>
            </div>
            <p className="text-slate-600 text-[11px] leading-tight">
              Onboard camera & IMU detect road hazards locally on phone or bike mount.
            </p>
          </div>

          <div className="p-3.5 rounded-md bg-slate-50 border border-slate-200 space-y-1">
            <div className="text-slate-700 font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-600" />
              <span>2. Road Memory</span>
            </div>
            <p className="text-slate-600 text-[11px] leading-tight">
              Durable SQLite registry storing GPS, type, optical evidence, and confidence scores.
            </p>
          </div>

          <div className="p-3.5 rounded-md bg-slate-50 border border-slate-200 space-y-1">
            <div className="text-amber-800 font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-600" />
              <span>3. Risk Engine</span>
            </div>
            <p className="text-slate-600 text-[11px] leading-tight">
              Multi-report confirmation filters false positives and weighs two-wheeler hazard severity.
            </p>
          </div>

          <div className="p-3.5 rounded-md bg-slate-50 border border-slate-200 space-y-1">
            <div className="text-red-700 font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-600" />
              <span>4. Rider Warning</span>
            </div>
            <p className="text-slate-600 text-[11px] leading-tight">
              Proximity HUD and audio chime alerts riders 50m–100m before approaching hazards.
            </p>
          </div>

          <div className="p-3.5 rounded-md bg-slate-50 border border-slate-200 space-y-1">
            <div className="text-slate-800 font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-700" />
              <span>5. Urban Intel</span>
            </div>
            <p className="text-slate-600 text-[11px] leading-tight">
              Aggregated corridor metrics prioritize municipal repair crews and road resurfacing.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
