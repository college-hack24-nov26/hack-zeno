import React, { useEffect, useState } from 'react';
import {
  Building2,
  AlertTriangle,
  Flame,
  Download,
  Info,
  Layers,
  MapPin,
  TrendingUp,
  ShieldAlert,
  BarChart3
} from 'lucide-react';
import { fetchUrbanIntelligence } from '../services/api';
import type { UrbanIntelligenceData } from '../types/hazard';
import { SeverityBadge } from '../components/SeverityBadge';

export const UrbanIntelligencePage: React.FC = () => {
  const [data, setData] = useState<UrbanIntelligenceData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetchUrbanIntelligence();
        setData(res);
      } catch (err: any) {
        setError(err?.message || 'Failed to load urban intelligence metrics');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleExportCSV = () => {
    if (!data?.priority_maintenance_queue) return;
    const items = data.priority_maintenance_queue;

    const headers = [
      'Hazard ID',
      'Hazard Type',
      'Severity',
      'Priority Score',
      'Corroboration Count',
      'Latitude',
      'Longitude',
      'Description',
      'Status Reason',
      'Recommended Action'
    ];

    const rows = items.map((i) => [
      i.hazard_id,
      i.hazard_type,
      i.severity,
      i.priority_score,
      i.corroboration_count,
      i.latitude,
      i.longitude,
      `"${i.description.replace(/"/g, '""')}"`,
      `"${(i.status_reason || '').replace(/"/g, '""')}"`,
      `"${i.recommended_action}"`
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `EVEN_Road_Maintenance_Priority_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Urban Intelligence</h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-teal-700 font-semibold">
              MUNICIPAL WORKS
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            Road maintenance prioritization, high-risk spatial clusters, and repair queue analytics
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium shadow-sm transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-white" />
            <span>Export Repair Queue (CSV)</span>
          </button>
        </div>
      </div>

      {/* Honest Data Source Transparency Banner */}
      <div className="p-4 rounded-lg bg-white border border-slate-200 shadow-sm text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 text-slate-600">
          <Info className="w-4 h-4 text-teal-600 shrink-0" />
          <span>
            <strong className="text-slate-900">Data Lineage:</strong> Priority Queue, Spatial Clusters, and Breakdown Metrics are computed dynamically from real SQLite hazard records. Ward boundary classifications below are marked as sample planning templates.
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono shrink-0">
          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-medium">
            LIVE: SQLite Database
          </span>
          <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-medium">
            SAMPLE: Ward Boundaries
          </span>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Key Analytical Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-lg bg-white border border-slate-200 shadow-sm">
          <div className="text-slate-500 text-xs font-mono font-medium uppercase mb-1 flex items-center justify-between">
            <span>Pending Road Actions</span>
            <span className="text-[10px] text-teal-700 font-mono font-semibold">LIVE DB</span>
          </div>
          <div className="text-3xl font-bold text-slate-900 font-mono">
            {data?.total_active_hazards || 0}
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            Active hazards awaiting road repair
          </div>
        </div>

        <div className="p-5 rounded-lg bg-white border border-slate-200 shadow-sm">
          <div className="text-slate-500 text-xs font-mono font-medium uppercase mb-1 flex items-center justify-between">
            <span>Spatial Clusters</span>
            <span className="text-[10px] text-teal-700 font-mono font-semibold">LIVE DB</span>
          </div>
          <div className="text-3xl font-bold text-amber-600 font-mono">
            {data?.real_spatial_clusters?.length || 0} Corridors
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            Concentrated hazards within 200m
          </div>
        </div>

        <div className="p-5 rounded-lg bg-white border border-red-200 shadow-sm">
          <div className="text-red-700 text-xs font-mono font-medium uppercase mb-1 flex items-center justify-between">
            <span>Critical Interventions</span>
            <span className="text-[10px] text-red-700 font-mono font-semibold">LIVE DB</span>
          </div>
          <div className="text-3xl font-bold text-red-600 font-mono">
            {data?.severity_distribution?.critical || 0}
          </div>
          <div className="mt-2 text-[11px] text-red-700">
            Severe rim strike or skid hazards
          </div>
        </div>

        <div className="p-5 rounded-lg bg-white border border-slate-200 shadow-sm">
          <div className="text-slate-500 text-xs font-mono font-medium uppercase mb-1 flex items-center justify-between">
            <span>Top Hazard Category</span>
            <span className="text-[10px] text-teal-700 font-mono font-semibold">LIVE DB</span>
          </div>
          <div className="text-xl font-bold text-slate-900 capitalize truncate mt-1">
            {data?.type_distribution ? Object.keys(data.type_distribution)[0]?.replace(/_/g, ' ') || 'None' : 'None'}
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            Most frequent rider obstacle
          </div>
        </div>
      </div>

      {/* Real High-Risk Geographic Clusters (Derived directly from SQLite coordinates) */}
      <div className="p-5 rounded-lg bg-white border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Geographic High-Risk Clusters
              </h3>
              <p className="text-xs text-slate-500">
                Spatial clustering derived from GPS coordinates of nearby hazards within 200m
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-medium">
            CALCULATED FROM SQLITE
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.real_spatial_clusters && data.real_spatial_clusters.length > 0 ? (
            data.real_spatial_clusters.map((cluster) => (
              <div
                key={cluster.cluster_id}
                className="p-4 rounded-md bg-slate-50 border border-slate-200 space-y-2 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900">
                      Cluster #{cluster.cluster_id} ({cluster.primary_type.replace(/_/g, ' ')})
                    </span>
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                      cluster.has_critical
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}>
                      {cluster.risk_level}
                    </span>
                  </div>

                  <div className="mt-1 flex items-center gap-1.5 text-xs text-teal-700 font-mono">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Center: {cluster.center_latitude.toFixed(4)}, {cluster.center_longitude.toFixed(4)}</span>
                  </div>

                  <p className="text-xs text-slate-600 mt-1">
                    Contains <strong className="text-slate-900">{cluster.hazard_count} active hazard(s)</strong> within a 200m corridor.
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-200 text-[11px] font-mono text-slate-500">
                  Hazard IDs: {cluster.hazard_ids.join(', ')}
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-3 py-6 text-center text-slate-400 text-xs font-mono">
              No spatial hazard clusters detected.
            </div>
          )}
        </div>
      </div>

      {/* Road Maintenance Priority Queue */}
      <div className="p-5 rounded-lg bg-white border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Road Maintenance Priority Queue
              </h2>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200 font-medium">
                LIVE SCORE CALCULATION
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Formula: Severity Weight × Confidence × Corroboration Multiplier × 10
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-mono uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-3">Priority</th>
                <th className="py-3 px-3">Hazard Type</th>
                <th className="py-3 px-3">Severity</th>
                <th className="py-3 px-3">Corroboration</th>
                <th className="py-3 px-3">Location (GPS)</th>
                <th className="py-3 px-3">Description</th>
                <th className="py-3 px-3">Recommended Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {data?.priority_maintenance_queue && data.priority_maintenance_queue.length > 0 ? (
                data.priority_maintenance_queue.map((item, idx) => (
                  <tr key={item.hazard_id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-3 font-mono font-bold">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-5 h-5 rounded flex items-center justify-center text-[11px] ${
                          idx === 0
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : idx === 1
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {idx + 1}
                        </span>
                        <span className="text-teal-700 font-semibold">{item.priority_score} pts</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-900 capitalize">
                      {item.hazard_type.replace(/_/g, ' ')}
                    </td>
                    <td className="py-3 px-3">
                      <SeverityBadge severity={item.severity} />
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-mono text-[11px] text-slate-700">
                        {item.corroboration_count > 0 ? `${item.corroboration_count + 1} Reports` : '1 Report'}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-slate-500">
                      {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
                    </td>
                    <td className="py-3 px-3 max-w-xs text-slate-600 truncate">
                      {item.description}
                    </td>
                    <td className="py-3 px-3">
                      <span className="inline-block px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 font-mono text-[11px]">
                        {item.recommended_action}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 font-mono">
                    No pending priority maintenance items recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Two Column Layout: Real Report Trends vs Sample Ward Templates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Real Report Trends */}
        <div className="p-5 rounded-lg bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-teal-600" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Report Activity Trends
                </h3>
                <p className="text-xs text-slate-500">Reports logged by date in Road Memory</p>
              </div>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200 font-medium">
              REAL DB TIMELINE
            </span>
          </div>

          <div className="space-y-2.5">
            {data?.report_trends && data.report_trends.length > 0 ? (
              data.report_trends.map((trend) => (
                <div
                  key={trend.date}
                  className="p-3 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-between"
                >
                  <span className="font-mono text-xs text-slate-700">{trend.date}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-teal-600 h-2 rounded-full"
                        style={{ width: `${Math.min(100, trend.count * 20)}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs font-bold text-teal-700">
                      {trend.count} reports
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-4 text-center text-slate-400 text-xs font-mono">
                No report timeline recorded yet.
              </div>
            )}
          </div>
        </div>

        {/* Sample Ward Planning Layer (Clearly Labeled as Sample Demo Data) */}
        <div className="p-5 rounded-lg bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-600" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Municipal Planning Sectors
                </h3>
                <p className="text-xs text-slate-500">Urban infrastructure health ratings</p>
              </div>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200 font-medium">
              SAMPLE DEMO DATA
            </span>
          </div>

          <div className="space-y-2.5">
            {data?.municipal_sectors_sample?.map((sector, idx) => (
              <div
                key={idx}
                className="p-3 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-between gap-3"
              >
                <div>
                  <h4 className="text-xs font-bold text-slate-900">{sector.zone}</h4>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {sector.planning_note}
                  </div>
                </div>
                <div className="text-xs font-mono font-bold text-amber-600 shrink-0">
                  {sector.road_condition_index}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
