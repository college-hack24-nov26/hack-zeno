import React from 'react';
import type { ConfirmationStatus } from '../types/hazard';
import { ShieldCheck, HelpCircle, Search, CheckCircle2 } from 'lucide-react';

interface ConfirmationBadgeProps {
  status: ConfirmationStatus;
  corroborationCount?: number;
  className?: string;
  showCount?: boolean;
}

export const ConfirmationBadge: React.FC<ConfirmationBadgeProps> = ({
  status,
  corroborationCount,
  className = '',
  showCount = true
}) => {
  const isCorroborated = status === 'confirmed';
  const count = corroborationCount !== undefined ? corroborationCount : (isCorroborated ? 1 : 0);

  const configs: Record<ConfirmationStatus, { label: string; bg: string; text: string; border: string; icon: React.ReactNode }> = {
    confirmed: {
      label: showCount && count > 0 ? `Corroborated (${count + 1} Reports)` : 'Corroborated',
      bg: 'bg-teal-50',
      text: 'text-teal-700',
      border: 'border-teal-200',
      icon: <ShieldCheck className="w-3.5 h-3.5 text-teal-600 shrink-0" />
    },
    unconfirmed: {
      label: 'Unverified (1 Report)',
      bg: 'bg-slate-100',
      text: 'text-slate-600',
      border: 'border-slate-200',
      icon: <HelpCircle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
    },
    investigating: {
      label: 'Under Verification',
      bg: 'bg-slate-100',
      text: 'text-slate-700',
      border: 'border-slate-200',
      icon: <Search className="w-3.5 h-3.5 text-slate-600 shrink-0" />
    },
    resolved: {
      label: 'Cleared / Repaired',
      bg: 'bg-teal-50',
      text: 'text-teal-800',
      border: 'border-teal-200',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-teal-700 shrink-0" />
    }
  };

  const config = configs[status] || configs.unconfirmed;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium border ${config.bg} ${config.text} ${config.border} ${className}`}
      title={status === 'confirmed' ? `Corroborated by ${count} other nearby rider reports within 75m` : undefined}
    >
      {config.icon}
      <span>{config.label}</span>
    </span>
  );
};
