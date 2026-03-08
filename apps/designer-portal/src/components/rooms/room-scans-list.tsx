'use client';

import { useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import type { RoomScan } from '@patina/supabase';

interface RoomScansListProps {
  scans: RoomScan[];
  isLoading?: boolean;
  onScanClick?: (scan: RoomScan) => void;
  onAssociateWithProject?: (scanId: string) => void;
  showUser?: boolean;
  emptyMessage?: string;
}

const ROOM_TYPE_ICONS: Record<string, string> = {
  living_room: 'sofa',
  bedroom: 'bed',
  dining_room: 'utensils',
  office: 'briefcase',
  kitchen: 'utensils-crossed',
  bathroom: 'bath',
  default: 'home',
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  ready: { bg: 'bg-green-100', text: 'text-green-700', label: 'Ready' },
  processing: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Processing' },
  failed: { bg: 'bg-red-100', text: 'text-red-700', label: 'Failed' },
};

export function RoomScansList({
  scans,
  isLoading = false,
  onScanClick,
  onAssociateWithProject,
  showUser = false,
  emptyMessage = 'No room scans yet',
}: RoomScansListProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-patina-off-white rounded-xl p-4 animate-pulse"
          >
            <div className="aspect-video bg-patina-clay-beige/20 rounded-lg mb-3" />
            <div className="h-5 bg-patina-clay-beige/20 rounded w-3/4 mb-2" />
            <div className="h-4 bg-patina-clay-beige/20 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (scans.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-patina-clay-beige/10 mb-4">
          <svg
            className="w-8 h-8 text-patina-clay-beige"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
            />
          </svg>
        </div>
        <p className="text-patina-mocha-brown/60 font-inter">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div>
      {/* View Mode Toggle */}
      <div className="flex justify-end mb-4">
        <div className="inline-flex rounded-lg bg-patina-off-white p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm font-inter transition-colors',
              viewMode === 'grid'
                ? 'bg-white text-patina-mocha-brown shadow-sm'
                : 'text-patina-mocha-brown/60 hover:text-patina-mocha-brown'
            )}
          >
            Grid
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm font-inter transition-colors',
              viewMode === 'list'
                ? 'bg-white text-patina-mocha-brown shadow-sm'
                : 'text-patina-mocha-brown/60 hover:text-patina-mocha-brown'
            )}
          >
            List
          </button>
        </div>
      </div>

      {/* Scans Grid/List */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {scans.map((scan) => (
            <RoomScanCard
              key={scan.id}
              scan={scan}
              onClick={() => onScanClick?.(scan)}
              onAssociateWithProject={onAssociateWithProject}
              showUser={showUser}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {scans.map((scan) => (
            <RoomScanRow
              key={scan.id}
              scan={scan}
              onClick={() => onScanClick?.(scan)}
              onAssociateWithProject={onAssociateWithProject}
              showUser={showUser}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ===============================================================================
// CARD COMPONENT
// ===============================================================================

interface RoomScanCardProps {
  scan: RoomScan;
  onClick?: () => void;
  onAssociateWithProject?: (scanId: string) => void;
  showUser?: boolean;
}

function RoomScanCard({
  scan,
  onClick,
  onAssociateWithProject,
  showUser,
}: RoomScanCardProps) {
  const statusStyle = STATUS_STYLES[scan.status] || STATUS_STYLES.ready;

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white rounded-xl overflow-hidden shadow-sm border border-patina-clay-beige/10',
        'hover:shadow-md transition-shadow duration-200',
        onClick && 'cursor-pointer'
      )}
    >
      {/* Thumbnail */}
      <div className="aspect-video bg-patina-off-white relative">
        {scan.thumbnail_url ? (
          <Image
            src={scan.thumbnail_url}
            alt={scan.name}
            fill
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              className="w-12 h-12 text-patina-clay-beige/30"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
          </div>
        )}

        {/* Status Badge */}
        <div className="absolute top-2 right-2">
          <span
            className={cn(
              'px-2 py-0.5 rounded-full text-xs font-medium',
              statusStyle.bg,
              statusStyle.text
            )}
          >
            {statusStyle.label}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-playfair text-lg text-patina-charcoal mb-1">
          {scan.name}
        </h3>

        {/* Dimensions */}
        {scan.dimensions && scan.floor_area && (
          <p className="text-sm text-patina-mocha-brown/60 font-inter mb-2">
            {Math.round(scan.floor_area * 10.764)} sq ft
            <span className="mx-1.5">·</span>
            {scan.dimensions.width.toFixed(1)}m x {scan.dimensions.length.toFixed(1)}m
          </p>
        )}

        {/* Style Signals */}
        {scan.style_signals && (
          <div className="flex flex-wrap gap-1 mb-3">
            {scan.suggested_styles?.slice(0, 3).map((style) => (
              <span
                key={style}
                className="px-2 py-0.5 bg-patina-clay-beige/10 text-patina-mocha-brown text-xs rounded-full font-inter capitalize"
              >
                {style}
              </span>
            ))}
          </div>
        )}

        {/* Features Summary */}
        {scan.features && (
          <div className="flex items-center gap-3 text-xs text-patina-mocha-brown/50 font-inter">
            {scan.features.windows && scan.features.windows.length > 0 && (
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.5" />
                  <line x1="12" y1="3" x2="12" y2="21" strokeWidth="1.5" />
                  <line x1="3" y1="12" x2="21" y2="12" strokeWidth="1.5" />
                </svg>
                {scan.features.windows.length} window{scan.features.windows.length !== 1 ? 's' : ''}
              </span>
            )}
            {scan.features.doors && scan.features.doors.length > 0 && (
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="4" y="2" width="16" height="20" rx="1" strokeWidth="1.5" />
                  <circle cx="16" cy="12" r="1" fill="currentColor" />
                </svg>
                {scan.features.doors.length} door{scan.features.doors.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        {/* User (if showing) */}
        {showUser && scan.user && (
          <div className="mt-3 pt-3 border-t border-patina-clay-beige/10 flex items-center gap-2">
            {scan.user.avatar_url ? (
              <Image
                src={scan.user.avatar_url}
                alt={scan.user.full_name || 'User'}
                width={24}
                height={24}
                className="rounded-full"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-patina-clay-beige/20 flex items-center justify-center">
                <span className="text-xs text-patina-mocha-brown">
                  {(scan.user.full_name || scan.user.email || '?')[0].toUpperCase()}
                </span>
              </div>
            )}
            <span className="text-sm text-patina-mocha-brown/60 font-inter truncate">
              {scan.user.full_name || scan.user.email}
            </span>
          </div>
        )}

        {/* Project Association */}
        {!scan.project_id && onAssociateWithProject && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAssociateWithProject(scan.id);
            }}
            className="mt-3 w-full py-2 text-sm text-patina-clay-beige hover:text-patina-mocha-brown font-inter transition-colors"
          >
            + Add to Project
          </button>
        )}

        {scan.project && (
          <div className="mt-3 pt-3 border-t border-patina-clay-beige/10">
            <span className="text-xs text-patina-mocha-brown/50 font-inter">
              Project: {scan.project.name}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ===============================================================================
// ROW COMPONENT
// ===============================================================================

interface RoomScanRowProps {
  scan: RoomScan;
  onClick?: () => void;
  onAssociateWithProject?: (scanId: string) => void;
  showUser?: boolean;
}

function RoomScanRow({
  scan,
  onClick,
  onAssociateWithProject,
  showUser,
}: RoomScanRowProps) {
  const statusStyle = STATUS_STYLES[scan.status] || STATUS_STYLES.ready;

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white rounded-lg p-4 flex items-center gap-4',
        'border border-patina-clay-beige/10 hover:shadow-sm transition-shadow',
        onClick && 'cursor-pointer'
      )}
    >
      {/* Thumbnail */}
      <div className="w-20 h-14 bg-patina-off-white rounded-md relative flex-shrink-0 overflow-hidden">
        {scan.thumbnail_url ? (
          <Image
            src={scan.thumbnail_url}
            alt={scan.name}
            fill
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-patina-clay-beige/30"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="font-playfair text-patina-charcoal truncate">
          {scan.name}
        </h3>
        <div className="flex items-center gap-3 text-sm text-patina-mocha-brown/60 font-inter">
          {scan.floor_area && (
            <span>{Math.round(scan.floor_area * 10.764)} sq ft</span>
          )}
          {scan.suggested_styles && scan.suggested_styles.length > 0 && (
            <span className="capitalize">{scan.suggested_styles[0]}</span>
          )}
        </div>
      </div>

      {/* User */}
      {showUser && scan.user && (
        <div className="flex items-center gap-2">
          {scan.user.avatar_url ? (
            <Image
              src={scan.user.avatar_url}
              alt={scan.user.full_name || 'User'}
              width={28}
              height={28}
              className="rounded-full"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-patina-clay-beige/20 flex items-center justify-center">
              <span className="text-xs text-patina-mocha-brown">
                {(scan.user.full_name || scan.user.email || '?')[0].toUpperCase()}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Status */}
      <span
        className={cn(
          'px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0',
          statusStyle.bg,
          statusStyle.text
        )}
      >
        {statusStyle.label}
      </span>

      {/* Actions */}
      {!scan.project_id && onAssociateWithProject && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAssociateWithProject(scan.id);
          }}
          className="text-sm text-patina-clay-beige hover:text-patina-mocha-brown font-inter transition-colors flex-shrink-0"
        >
          + Project
        </button>
      )}
    </div>
  );
}
