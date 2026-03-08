'use client';

import { useState } from 'react';
import { useHomeownerScans, useRequestScanAccess } from '@patina/supabase';
import {
  Box,
  Eye,
  Lock,
  Loader2,
  Maximize2,
  Ruler,
  Clock,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SharedScanBadge } from './shared-scan-badge';

interface LeadRoomScansProps {
  /** The lead/homeowner ID */
  homeownerId: string;
  /** Lead name for display */
  leadName: string;
  /** Callback when user wants to view a scan in 3D */
  onViewScan?: (scanId: string) => void;
}

/**
 * Displays room scans owned by a homeowner
 * Shows scan thumbnails, dimensions, and access status for each
 */
export function LeadRoomScans({ homeownerId, leadName, onViewScan }: LeadRoomScansProps) {
  const { data: scans = [], isLoading, error } = useHomeownerScans(homeownerId);
  const requestAccess = useRequestScanAccess();
  const [requestedScans, setRequestedScans] = useState<Set<string>>(new Set());

  const handleRequestAccess = async (scanId: string) => {
    try {
      await requestAccess.mutateAsync({
        scanId,
        consumerId: homeownerId,
        message: `I would like to view your room scan to better understand your space and provide design recommendations.`,
      });
      setRequestedScans((prev) => new Set([...prev, scanId]));
    } catch (err) {
      console.error('Failed to request access:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Box className="w-5 h-5 text-patina-mocha-brown" />
          <h2 className="font-display text-lg font-semibold text-patina-charcoal">
            Room Scans
          </h2>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-patina-clay-beige" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Box className="w-5 h-5 text-patina-mocha-brown" />
          <h2 className="font-display text-lg font-semibold text-patina-charcoal">
            Room Scans
          </h2>
        </div>
        <div className="text-center py-8">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-patina-clay-beige text-sm">Failed to load room scans</p>
        </div>
      </div>
    );
  }

  if (scans.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Box className="w-5 h-5 text-patina-mocha-brown" />
          <h2 className="font-display text-lg font-semibold text-patina-charcoal">
            Room Scans
          </h2>
        </div>
        <div className="text-center py-8">
          <Box className="w-10 h-10 text-patina-clay-beige/50 mx-auto mb-3" />
          <p className="text-patina-charcoal font-medium mb-1">No Room Scans Available</p>
          <p className="text-patina-clay-beige text-sm">
            {leadName} hasn&apos;t created any room scans yet
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Box className="w-5 h-5 text-patina-mocha-brown" />
          <h2 className="font-display text-lg font-semibold text-patina-charcoal">
            Room Scans
          </h2>
          <span className="px-2 py-0.5 bg-patina-off-white text-patina-clay-beige text-xs rounded-full">
            {scans.length}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {scans.map((scan) => {
          const association = scan.association;
          const hasAccess = association?.status === 'active';
          const isPending = association?.status === 'pending' || requestedScans.has(scan.id);
          const canView = hasAccess && (association?.access_level === 'full' || association?.access_level === 'preview');

          return (
            <div
              key={scan.id}
              className={cn(
                'relative rounded-lg border overflow-hidden transition-all',
                hasAccess
                  ? 'border-patina-clay-beige/20 hover:border-patina-clay-beige/40'
                  : 'border-dashed border-patina-clay-beige/30'
              )}
            >
              {/* Thumbnail */}
              <div className="relative aspect-video bg-patina-off-white">
                {scan.thumbnail_url ? (
                  <img
                    src={scan.thumbnail_url}
                    alt={scan.name}
                    className={cn(
                      'w-full h-full object-cover',
                      !hasAccess && 'blur-sm'
                    )}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Box className="w-10 h-10 text-patina-clay-beige/30" />
                  </div>
                )}

                {/* Access overlay */}
                {!hasAccess && (
                  <div className="absolute inset-0 bg-patina-charcoal/60 flex items-center justify-center">
                    <Lock className="w-6 h-6 text-white/80" />
                  </div>
                )}

                {/* Badge */}
                <div className="absolute top-2 right-2">
                  <SharedScanBadge
                    accessLevel={association?.access_level || 'preview'}
                    status={isPending ? 'pending' : association?.status || 'pending'}
                    expiresAt={association?.expires_at}
                    compact
                  />
                </div>
              </div>

              {/* Info */}
              <div className="p-3">
                <h3 className="font-medium text-patina-charcoal truncate mb-1">
                  {scan.name}
                </h3>

                <div className="flex items-center gap-3 text-xs text-patina-clay-beige mb-3">
                  {scan.floor_area && (
                    <span className="flex items-center gap-1">
                      <Ruler className="w-3 h-3" />
                      {scan.floor_area.toFixed(0)} m²
                    </span>
                  )}
                  {scan.room_type && (
                    <span className="capitalize">{scan.room_type.replace('_', ' ')}</span>
                  )}
                </div>

                {/* Actions */}
                {hasAccess && canView ? (
                  <button
                    onClick={() => onViewScan?.(scan.id)}
                    className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-patina-mocha-brown text-white text-sm font-medium rounded-lg hover:bg-patina-charcoal transition-colors"
                  >
                    <Maximize2 className="w-4 h-4" />
                    View 3D Scan
                  </button>
                ) : isPending ? (
                  <div className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-amber-50 text-amber-700 text-sm font-medium rounded-lg">
                    <Clock className="w-4 h-4" />
                    Request Pending
                  </div>
                ) : (
                  <button
                    onClick={() => handleRequestAccess(scan.id)}
                    disabled={requestAccess.isPending}
                    className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-patina-off-white text-patina-mocha-brown text-sm font-medium rounded-lg hover:bg-patina-soft-cream transition-colors disabled:opacity-50"
                  >
                    {requestAccess.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                    Request Access
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
