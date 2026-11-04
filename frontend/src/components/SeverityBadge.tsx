import React from 'react';
import { SeverityLevel } from '../types/hazard';

interface SeverityBadgeProps {
  severity: SeverityLevel;
  className?: string;
  showDot?: boolean;
}

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({ severity, className = '', showDot = true }) => {
  const configs: Record<SeverityLevel, { label: string; bg: string; text: string; border: string; dot: string }> = {
    critical: {
      label: 'Critical',
      bg: 'bg-red-50',
      text: 'text-red-700',
      border: 'border-red-200',
      dot: 'bg-red-600'
    },
    high: {
      label: 'High Risk',
      bg: 'bg-amber-50',
      text: 'text-amber-800',
      border: 'border-amber-200',
      dot: 'bg-amber-600'
    },
    medium: {
      label: 'Medium',
      bg: 'bg-slate-100',
      text: 'text-slate-700',
      border: 'border-slate-200',
      dot: 'bg-slate-500'
    },
    low: {
      label: 'Low / Minor',
      bg: 'bg-slate-50',
      text: 'text-slate-600',
      border: 'border-slate-200',
      dot: 'bg-slate-400'
    }
  };

  const config = configs[severity] || configs.medium;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider border ${config.bg} ${config.text} ${config.border} ${className}`}
    >
      {showDot && <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />}
      {config.label}
    </span>
  );
};
