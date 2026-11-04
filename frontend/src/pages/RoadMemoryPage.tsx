import React, { useEffect, useState } from 'react';
import {
  Search,
  Filter,
  Plus,
  Camera,
  Trash2,
  RefreshCw,
  LayoutGrid,
  List,
  MapPin,
  ShieldCheck,
  CheckCircle2,
  Sliders,
  Sparkles
} from 'lucide-react';
import { fetchHazards, updateHazard, deleteHazard, recalculateCorroborations } from '../services/api';
import type { Hazard, ConfirmationStatus } from '../types/hazard';
import { SeverityBadge } from '../components/SeverityBadge';
import { ConfirmationBadge } from '../components/ConfirmationBadge';
import { getHazardVisual } from '../utils/hazardVisual';

interface RoadMemoryPageProps {
  onOpenReportModal: () => void;
  onInspectHazard: (hazard: Hazard) => void;
}

export const RoadMemoryPage: React.FC<RoadMemoryPageProps> = ({
  onOpenReportModal,
  onInspectHazard
}) => {
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRecalculating, setIsRecalculating] = useState<boolean>(false);
  const [engineNotification, setEngineNotification] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  const loadHazards = async () => {
    try {
      setLoading(true);
      const data = await fetchHazards();
      setHazards(data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch road memory records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHazards();
  }, []);

  const handleUpdateStatus = async (id: number, status: ConfirmationStatus) => {
    try {
      const updated = await updateHazard(id, { confirmation_status: status });
      setHazards((prev) => prev.map((h) => (h.id === id ? updated : h)));
    } catch (err: any) {
      alert(`Could not update status: ${err.message}`);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(`Delete Hazard #${id} from Road Memory?`)) return;
    try {
      await deleteHazard(id);
      setHazards((prev) => prev.filter((h) => h.id !== id));
    } catch (err: any) {
      alert(`Could not delete hazard: ${err.message}`);
    }
  };

  const handleTriggerEngine = async () => {
    try {
      setIsRecalculating(true);
      const res = await recalculateCorroborations();
      setEngineNotification(res.message);
      await loadHazards();
      setTimeout(() => setEngineNotification(null), 3500);
    } catch (err: any) {
      alert(`Engine calculation failed: ${err.message}`);
    } finally {
      setIsRecalculating(false);
    }
  };

  // Filter computation
  const filteredHazards = hazards.filter((h) => {
    const matchesSearch =
      h.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      h.hazard_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      h.id.toString().includes(searchQuery);

    const matchesType = selectedType === 'all' || h.hazard_type === selectedType;
    const matchesSeverity = selectedSeverity === 'all' || h.severity === selectedSeverity;
    const matchesStatus = selectedStatus === 'all' || h.confirmation_status === selectedStatus;

    return matchesSearch && matchesType && matchesSeverity && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Road Memory</h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-teal-700 font-semibold">
              {hazards.length} RECORDED
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            Durable SQLite registry of verified and incoming two-wheeler road hazards
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Confirmation Engine Trigger */}
          <button
            onClick={handleTriggerEngine}
            disabled={isRecalculating}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-medium shadow-sm transition-colors cursor-pointer disabled:opacity-50"
            title="Run 75m / 7-day spatial confirmation engine across all records"
          >
            <Sparkles className={`w-3.5 h-3.5 text-teal-600 ${isRecalculating ? 'animate-spin' : ''}`} />
            <span>{isRecalculating ? 'Evaluating...' : 'Run Confirmation Engine'}</span>
          </button>

          {/* View toggle (desktop) */}
          <div className="hidden md:flex items-center bg-slate-100 border border-slate-200 rounded-md p-0.5">
            <button
              onClick={() => setViewMode('cards')}
              className={`p-1.5 rounded text-xs font-medium transition-colors cursor-pointer ${
                viewMode === 'cards' ? 'bg-white text-teal-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Grid Card View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded text-xs font-medium transition-colors cursor-pointer ${
                viewMode === 'table' ? 'bg-white text-teal-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Table View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={loadHazards}
            className="p-2 rounded-md bg-white hover:bg-slate-50 text-slate-600 border border-slate-300 shadow-sm transition-colors cursor-pointer"
            title="Refresh database records"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={onOpenReportModal}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-xs sm:text-sm font-medium shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Report Hazard</span>
          </button>
        </div>
      </div>

      {engineNotification && (
        <div className="p-3 rounded-md bg-teal-50 border border-teal-200 text-xs text-teal-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-teal-600 shrink-0" />
            <span>{engineNotification}</span>
          </div>
          <span className="text-[10px] font-mono text-teal-700">Haversine Distance Window: 75m</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-lg bg-white border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by description, hazard type, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-md pl-10 pr-4 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-teal-500 focus:bg-white"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Type Filter */}
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-teal-500 focus:bg-white"
            >
              <option value="all">All Hazard Types</option>
              <option value="pothole">Potholes</option>
              <option value="obstacle">Obstacles</option>
              <option value="roadblock">Roadblocks</option>
              <option value="unsafe_condition">Unsafe Conditions</option>
              <option value="oil_spill">Oil Spills</option>
              <option value="unmarked_speed_bump">Speed Bumps</option>
              <option value="gravel">Gravel Patches</option>
              <option value="broken_surface">Broken Surfaces</option>
              <option value="waterlogging">Waterlogging</option>
              <option value="debris">Debris</option>
            </select>

            {/* Severity Filter */}
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-teal-500 focus:bg-white"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical Risk</option>
              <option value="high">High Risk</option>
              <option value="medium">Medium Risk</option>
              <option value="low">Low Risk</option>
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-teal-500 focus:bg-white"
            >
              <option value="all">All Verification Statuses</option>
              <option value="confirmed">Corroborated</option>
              <option value="unconfirmed">Unverified</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="py-16 text-center text-slate-500 font-mono text-sm">
          <div className="inline-block w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mb-2" />
          <div>Querying SQLite Road Memory...</div>
        </div>
      ) : filteredHazards.length === 0 ? (
        <div className="py-16 text-center rounded-lg bg-white border border-slate-200 shadow-sm space-y-2">
          <p className="text-slate-500 text-sm">No road hazards match the selected filters.</p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedType('all');
              setSelectedSeverity('all');
              setSelectedStatus('all');
            }}
            className="text-xs font-medium text-teal-700 hover:underline cursor-pointer"
          >
            Clear all filters
          </button>
        </div>
      ) : viewMode === 'cards' ? (
        /* Grid Cards View */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredHazards.map((hazard) => {
            const visual = getHazardVisual(hazard);

            return (
              <div
                key={hazard.id}
                className="p-5 rounded-lg bg-white border border-slate-200 shadow-sm hover:border-slate-300 transition-colors flex flex-col justify-between space-y-3"
              >
                <div>
                  {/* Card Top: Type, Severity & Status */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-slate-400">#{hazard.id}</span>
                      <h3 className="text-base font-bold text-slate-900 capitalize">
                        {hazard.hazard_type.replace(/_/g, ' ')}
                      </h3>
                    </div>
                    <SeverityBadge severity={hazard.severity} />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <ConfirmationBadge
                      status={hazard.confirmation_status}
                      corroborationCount={hazard.corroboration_count}
                    />
                    <span className="text-[11px] font-mono text-slate-500">
                      Conf: {(hazard.confidence * 100).toFixed(0)}%
                    </span>
                  </div>

                  {/* Corroboration Explanation */}
                  <p className="text-[11px] text-slate-500 italic mb-2 line-clamp-2">
                    {hazard.status_reason || 'Pending confirmation analysis.'}
                  </p>

                  {hazard.resolved_address && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-700 font-medium mb-2 bg-slate-50 px-2 py-1 rounded border border-slate-200">
                      <MapPin className="w-3 h-3 text-teal-600 shrink-0" />
                      <span className="truncate">{hazard.resolved_address}</span>
                    </div>
                  )}

                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                    {hazard.description}
                  </p>
                </div>

                {/* Optical Evidence Frame / Real Photo or Illustrative Preview */}
                <div
                  onClick={() => onInspectHazard(hazard)}
                  className="group relative h-28 rounded-md bg-slate-900 border border-slate-800 overflow-hidden flex items-center justify-center cursor-pointer hover:border-teal-500 transition-colors"
                >
                  <img
                    src={visual.imageUrl}
                    alt={visual.label}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = '/placeholders/pothole.jpg';
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />

                  {/* Top Badge: Photo Evidence vs Illustrative */}
                  <div className="absolute top-2 left-2 z-10">
                    {visual.isRealPhoto ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-950/90 text-emerald-300 border border-emerald-700/60 backdrop-blur-sm">
                        <Camera className="w-3 h-3" />
                        Photo Evidence
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-900/90 text-amber-300 border border-amber-600/50 backdrop-blur-sm">
                        Illustrative Preview
                      </span>
                    )}
                  </div>

                  <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[10px] font-mono text-slate-300 z-10">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-teal-400" />
                      {hazard.latitude.toFixed(4)}, {hazard.longitude.toFixed(4)}
                    </span>
                    <span>{new Date(hazard.reported_at).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {hazard.confirmation_status !== 'confirmed' && (
                      <button
                        onClick={() => handleUpdateStatus(hazard.id, 'confirmed')}
                        className="px-2.5 py-1 rounded bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 text-xs font-medium transition-colors cursor-pointer"
                        title="Corroborate this hazard report"
                      >
                        Corroborate
                      </button>
                    )}
                    {hazard.confirmation_status !== 'resolved' && (
                      <button
                        onClick={() => handleUpdateStatus(hazard.id, 'resolved')}
                        className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-medium transition-colors cursor-pointer"
                        title="Mark repaired/cleared"
                      >
                        Resolve
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => handleDelete(hazard.id)}
                    className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                    title="Delete from database"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="overflow-x-auto rounded-lg bg-white border border-slate-200 shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-mono uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">ID</th>
                <th className="py-3 px-4">Hazard Type</th>
                <th className="py-3 px-4">Severity</th>
                <th className="py-3 px-4">Status & Corroboration</th>
                <th className="py-3 px-4">GPS Location</th>
                <th className="py-3 px-4">Confidence</th>
                <th className="py-3 px-4">Report Time</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {filteredHazards.map((hazard) => (
                <tr key={hazard.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-4 font-mono font-medium text-slate-400">#{hazard.id}</td>
                  <td className="py-3 px-4 font-semibold text-slate-900 capitalize">
                    {hazard.hazard_type.replace(/_/g, ' ')}
                  </td>
                  <td className="py-3 px-4">
                    <SeverityBadge severity={hazard.severity} />
                  </td>
                  <td className="py-3 px-4">
                    <div className="space-y-0.5">
                      <ConfirmationBadge
                        status={hazard.confirmation_status}
                        corroborationCount={hazard.corroboration_count}
                      />
                      <div className="text-[10px] text-slate-500 max-w-xs truncate">
                        {hazard.status_reason}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-700">
                    <div>{hazard.latitude.toFixed(4)}, {hazard.longitude.toFixed(4)}</div>
                    {hazard.resolved_address && (
                      <div className="text-[10px] text-slate-500 font-sans truncate max-w-[180px]" title={hazard.resolved_address}>
                        {hazard.resolved_address}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono">
                    {(hazard.confidence * 100).toFixed(0)}%
                  </td>
                  <td className="py-3 px-4 text-slate-500 font-mono">
                    {new Date(hazard.reported_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="py-3 px-4 text-right space-x-2">
                    <button
                      onClick={() => onInspectHazard(hazard)}
                      className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium cursor-pointer"
                    >
                      Inspect
                    </button>
                    <button
                      onClick={() => handleDelete(hazard.id)}
                      className="p-1 rounded text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 inline" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
