import React, { useEffect } from 'react';
import {
  X,
  ShieldCheck,
  CheckCircle2,
  Trash2,
  Camera,
  Navigation,
  Clock,
  Cpu,
  Info,
  Check,
  ArrowLeft
} from 'lucide-react';
import type { Hazard, ConfirmationStatus } from '../types/hazard';
import { SeverityBadge } from './SeverityBadge';
import { ConfirmationBadge } from './ConfirmationBadge';
import { getHazardVisual } from '../utils/hazardVisual';

interface EvidenceModalProps {
  hazard: Hazard | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateStatus: (id: number, status: ConfirmationStatus) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

export const EvidenceModal: React.FC<EvidenceModalProps> = ({
  hazard,
  isOpen,
  onClose,
  onUpdateStatus,
  onDelete
}) => {
  // Listen for Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !hazard) return null;

  // Handle clicking on the backdrop
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const visual = getHazardVisual(hazard);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="hazard-detail-title"
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 overflow-y-auto cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden text-slate-900 my-8 cursor-default"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-slate-100 text-slate-700">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="hazard-detail-title" className="text-base font-bold text-slate-900 capitalize">
                  {hazard.hazard_type.replace(/_/g, ' ')}
                </h3>
                <span className="text-xs font-mono text-slate-400">#{hazard.id}</span>
              </div>
              <p className="text-xs text-slate-500">Road Memory Evidence & Spatial Corroboration</p>
            </div>
          </div>

          {/* Prominent Close X button in top right */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            title="Close (Esc)"
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* Photo / Visual Container */}
          <div className="relative aspect-video w-full rounded-md bg-slate-950 border border-slate-800 overflow-hidden flex flex-col justify-between p-4 shadow-inner">
            <img
              src={visual.imageUrl}
              alt={visual.label}
              className="absolute inset-0 w-full h-full object-cover"
              onError={(e) => {
                // Safeguard against any broken image error
                (e.currentTarget as HTMLImageElement).src = '/placeholders/pothole.jpg';
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />

            {/* Top HUD Telemetry */}
            <div className="relative z-10 flex items-center justify-between text-[11px] font-mono text-slate-300">
              <div className="flex items-center gap-2 bg-slate-900/80 px-2.5 py-1 rounded border border-slate-800">
                <Cpu className="w-3.5 h-3.5 text-teal-400" />
                <span>EVEN ROAD MEMORY RECORD</span>
              </div>
              <div className="bg-slate-900/80 px-2.5 py-1 rounded border border-slate-800 text-teal-300">
                <span>{new Date(hazard.reported_at).toLocaleString()}</span>
              </div>
            </div>

            {/* Clear, honest label for fallback vs real photo */}
            <div className="relative z-10 self-center">
              {!visual.isRealPhoto ? (
                <div className="bg-slate-950/85 border border-slate-700/80 text-slate-200 px-3 py-1.5 rounded-md text-xs font-mono flex items-center gap-2 shadow-lg backdrop-blur-xs">
                  <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Illustrative — not original report evidence</span>
                </div>
              ) : (
                <div className="bg-slate-950/85 border border-teal-500/50 text-teal-300 px-3 py-1 rounded-md text-xs font-mono flex items-center gap-1.5 shadow-lg">
                  <Camera className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                  <span>Rider Optical Evidence</span>
                </div>
              )}
            </div>

            {/* Bottom HUD Telemetry */}
            <div className="relative z-10 flex items-end justify-between text-[11px] font-mono text-slate-300">
              <div className="bg-slate-900/80 px-3 py-1.5 rounded border border-slate-800 space-y-0.5">
                <div className="flex items-center gap-1.5 text-teal-400 font-semibold">
                  <Navigation className="w-3.5 h-3.5" />
                  <span>{hazard.latitude.toFixed(6)}° N, {hazard.longitude.toFixed(6)}° E</span>
                </div>
                <div className="text-[10px] text-slate-400">
                  Source: {hazard.source} • Status: {hazard.confirmation_status.toUpperCase()}
                </div>
              </div>
              <div className="bg-slate-900/80 px-3 py-1.5 rounded border border-slate-800 text-right">
                <div className="text-[10px] text-slate-400">SEVERITY RATING</div>
                <div className="text-xs font-bold text-red-400 uppercase">{hazard.severity}</div>
              </div>
            </div>
          </div>

          {/* Explainable Corroboration Card */}
          <div className="p-3.5 rounded-md bg-teal-50 border border-teal-200 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-teal-800 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-teal-600" />
                <span>Road Memory Confirmation Engine</span>
              </div>
              <span className="text-[10px] font-mono text-teal-700">
                Window: 75m • 7 days
              </span>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed font-sans">
              {hazard.status_reason || (
                hazard.confirmation_status === 'confirmed'
                  ? `Corroborated by ${hazard.corroboration_count || 1} nearby report(s) within 75 meters.`
                  : 'Unverified single report. Awaiting corroborating second report within 75m.'
              )}
            </p>
          </div>

          {/* Location Telemetry & Resolved Address */}
          <div className="p-3.5 rounded-md bg-slate-50 border border-slate-200 space-y-2 text-xs">
            <div className="flex items-center justify-between text-slate-600">
              <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                <Navigation className="w-3.5 h-3.5 text-teal-600" />
                <span>Location Telemetry</span>
              </span>
              <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                {hazard.location_source === 'device_gps' ? 'DEVICE GPS FIX' :
                 hazard.location_source === 'video_track' ? 'VIDEO ROUTE TRACK' :
                 hazard.location_source === 'video_unlocalized' ? 'VIDEO (NO GPS)' : 'MANUAL ENTRY'}
                {hazard.location_accuracy ? ` • ±${hazard.location_accuracy}m` : ''}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-white p-2 rounded border border-slate-200">
              <div>
                <span className="text-slate-500 block">Latitude</span>
                <span className="text-slate-800">{hazard.latitude.toFixed(6)}°</span>
              </div>
              <div>
                <span className="text-slate-500 block">Longitude</span>
                <span className="text-slate-800">{hazard.longitude.toFixed(6)}°</span>
              </div>
            </div>
            {hazard.resolved_address ? (
              <div className="p-2 rounded bg-teal-50 border border-teal-200 text-teal-900 space-y-0.5">
                <span className="text-[10px] text-teal-700 uppercase font-mono block font-semibold">Resolved Address</span>
                <p className="font-medium text-slate-900 text-xs">{hazard.resolved_address}</p>
                <span className="text-[10px] text-slate-500 block pt-0.5">Data © OpenStreetMap contributors, ODbL 1.0</span>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 italic">No reverse-geocoded place name cached for this coordinate.</p>
            )}
          </div>

          {/* Description & Badges */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={hazard.severity} />
              <ConfirmationBadge
                status={hazard.confirmation_status}
                corroborationCount={hazard.corroboration_count}
              />
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700">
                Confidence: {(hazard.confidence * 100).toFixed(0)}%
              </span>
            </div>

            <div className="p-3.5 rounded-md bg-slate-50 border border-slate-200 text-sm text-slate-800 leading-relaxed">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                Rider Observation Details
              </div>
              {hazard.description}
            </div>
          </div>

          {/* Status Change, Close/Back & Triage Actions */}
          <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* Explicit Back / Close Button */}
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-medium transition-colors cursor-pointer shadow-sm"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Road Memory</span>
              </button>

              <span className="text-slate-300 hidden sm:inline">|</span>

              <span className="text-xs text-slate-500 font-semibold mr-1">Triage:</span>
              {hazard.confirmation_status !== 'confirmed' && (
                <button
                  type="button"
                  onClick={() => onUpdateStatus(hazard.id, 'confirmed')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-medium transition-colors cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Verify / Corroborate</span>
                </button>
              )}
              {hazard.confirmation_status !== 'resolved' && (
                <button
                  type="button"
                  onClick={() => onUpdateStatus(hazard.id, 'resolved')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-medium transition-colors cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Mark Resolved / Repaired</span>
                </button>
              )}
            </div>

            {/* Separate Delete Button with required confirmation */}
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Are you sure you want to permanently delete Hazard #${hazard.id} (${hazard.hazard_type})? This action cannot be undone.`)) {
                  onDelete(hazard.id);
                  onClose();
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-medium transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Record</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
