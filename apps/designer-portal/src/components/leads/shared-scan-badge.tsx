'use client';

import { Eye, Ruler, Box, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SharedScanBadgeProps {
  /** Access level granted */
  accessLevel: string;
  /** Association status */
  status: string;
  /** Expiration date if set */
  expiresAt?: string | null;
  /** Show compact version */
  compact?: boolean;
  /** Additional class names */
  className?: string;
}

const ACCESS_CONFIGS = {
  full: {
    label: 'Full Access',
    shortLabel: 'Full',
    icon: Box,
    className: 'bg-green-100 text-green-700 border-green-200',
  },
  preview: {
    label: 'Preview Only',
    shortLabel: 'Preview',
    icon: Eye,
    className: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  measurements_only: {
    label: 'Measurements',
    shortLabel: 'Dims',
    icon: Ruler,
    className: 'bg-amber-100 text-amber-700 border-amber-200',
  },
} as const;

const STATUS_CONFIGS = {
  active: {
    label: 'Active',
    icon: CheckCircle,
    className: 'text-green-600',
  },
  pending: {
    label: 'Pending',
    icon: Clock,
    className: 'text-amber-600',
  },
  revoked: {
    label: 'Revoked',
    icon: XCircle,
    className: 'text-red-600',
  },
  expired: {
    label: 'Expired',
    icon: AlertTriangle,
    className: 'text-gray-500',
  },
} as const;

/**
 * Badge showing access level and status for a shared room scan
 */
export function SharedScanBadge({
  accessLevel,
  status,
  expiresAt,
  compact = false,
  className,
}: SharedScanBadgeProps) {
  const accessConfig = ACCESS_CONFIGS[accessLevel as keyof typeof ACCESS_CONFIGS] || ACCESS_CONFIGS.preview;
  const statusConfig = STATUS_CONFIGS[status as keyof typeof STATUS_CONFIGS] || STATUS_CONFIGS.pending;

  const AccessIcon = accessConfig.icon;
  const StatusIcon = statusConfig.icon;

  // Check if expiring soon (within 7 days)
  const isExpiringSoon = expiresAt && new Date(expiresAt) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const isExpired = expiresAt && new Date(expiresAt) < new Date();

  if (compact) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border',
          isExpired ? 'bg-gray-100 text-gray-500 border-gray-200' : accessConfig.className,
          className
        )}
        title={`${accessConfig.label} - ${statusConfig.label}${expiresAt ? ` (Expires: ${new Date(expiresAt).toLocaleDateString()})` : ''}`}
      >
        <AccessIcon className="w-3 h-3" />
        {accessConfig.shortLabel}
      </span>
    );
  }

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {/* Access level badge */}
      <span
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium border',
          isExpired ? 'bg-gray-100 text-gray-500 border-gray-200' : accessConfig.className
        )}
      >
        <AccessIcon className="w-4 h-4" />
        {accessConfig.label}
      </span>

      {/* Status indicator */}
      <div className="flex items-center gap-1 text-xs">
        <StatusIcon className={cn('w-3 h-3', statusConfig.className)} />
        <span className={statusConfig.className}>{statusConfig.label}</span>

        {/* Expiration info */}
        {expiresAt && !isExpired && (
          <span className={cn('ml-1', isExpiringSoon ? 'text-amber-600' : 'text-patina-clay-beige')}>
            {isExpiringSoon ? 'Expires soon' : `Until ${new Date(expiresAt).toLocaleDateString()}`}
          </span>
        )}
        {isExpired && (
          <span className="ml-1 text-gray-500">Expired</span>
        )}
      </div>
    </div>
  );
}
