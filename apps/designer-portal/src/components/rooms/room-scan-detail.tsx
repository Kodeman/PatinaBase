'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { Box } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RoomScan } from '@patina/supabase';

// Dynamically import the viewer to avoid SSR issues with Three.js
const RoomScanViewer = dynamic(
  () => import('./viewer/RoomScanViewer').then((mod) => ({ default: mod.RoomScanViewer })),
  { ssr: false, loading: () => <ViewerLoadingPlaceholder /> }
);

function ViewerLoadingPlaceholder() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-patina-charcoal">
      <div className="text-white/60 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full mx-auto mb-2" />
        <p className="text-sm">Loading 3D viewer...</p>
      </div>
    </div>
  );
}

interface RoomScanDetailProps {
  scan: RoomScan;
  onClose?: () => void;
  onAssociateWithProject?: (scanId: string) => void;
  onDelete?: (scanId: string) => void;
}

export function RoomScanDetail({
  scan,
  onClose,
  onAssociateWithProject,
  onDelete,
}: RoomScanDetailProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'features' | 'style'>('overview');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showViewer, setShowViewer] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Check if 3D model is available
  const hasModel = (scan as { model_url_gltf?: string }).model_url_gltf || scan.model_url;

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!confirm('Are you sure you want to delete this room scan? This cannot be undone.')) return;

    setIsDeleting(true);
    try {
      await onDelete(scan.id);
    } finally {
      setIsDeleting(false);
    }
  };

  // Show 3D viewer fullscreen
  if (showViewer) {
    return (
      <div className={cn(
        "bg-patina-charcoal overflow-hidden flex flex-col",
        isFullscreen
          ? "fixed inset-0 z-50"
          : "rounded-2xl shadow-lg max-w-6xl w-full h-[85vh]"
      )}>
        <RoomScanViewer
          scan={scan}
          onClose={() => setShowViewer(false)}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
        />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-patina-clay-beige/10 flex items-center justify-between">
        <div>
          <h2 className="font-playfair text-2xl text-patina-charcoal">{scan.name}</h2>
          {scan.scanned_at && (
            <p className="text-sm text-patina-mocha-brown/60 font-inter">
              Scanned {new Date(scan.scanned_at).toLocaleDateString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasModel && (
            <button
              onClick={() => setShowViewer(true)}
              className="flex items-center gap-2 px-3 py-2 bg-patina-clay-beige text-white rounded-lg text-sm font-inter hover:bg-patina-mocha-brown transition-colors"
            >
              <Box className="w-4 h-4" />
              View 3D
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-patina-off-white rounded-lg transition-colors"
            >
              <svg className="w-5 h-5 text-patina-mocha-brown/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

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
            <div className="text-center">
              <svg
                className="w-16 h-16 text-patina-clay-beige/30 mx-auto mb-2"
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
              <p className="text-patina-mocha-brown/40 font-inter text-sm">No preview available</p>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="px-6 border-b border-patina-clay-beige/10">
        <div className="flex gap-6">
          {(['overview', 'features', 'style'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'py-3 text-sm font-inter capitalize border-b-2 transition-colors',
                activeTab === tab
                  ? 'border-patina-clay-beige text-patina-charcoal'
                  : 'border-transparent text-patina-mocha-brown/60 hover:text-patina-mocha-brown'
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'overview' && (
          <OverviewTab scan={scan} />
        )}
        {activeTab === 'features' && (
          <FeaturesTab scan={scan} />
        )}
        {activeTab === 'style' && (
          <StyleTab scan={scan} />
        )}
      </div>

      {/* Actions */}
      <div className="px-6 py-4 border-t border-patina-clay-beige/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {!scan.project_id && onAssociateWithProject && (
            <button
              onClick={() => onAssociateWithProject(scan.id)}
              className="px-4 py-2 bg-patina-clay-beige text-white rounded-lg text-sm font-inter hover:bg-patina-mocha-brown transition-colors"
            >
              Add to Project
            </button>
          )}
          {scan.project && (
            <span className="text-sm text-patina-mocha-brown/60 font-inter">
              In project: <span className="text-patina-charcoal">{scan.project.name}</span>
            </span>
          )}
        </div>
        {onDelete && (
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-inter transition-colors disabled:opacity-50"
          >
            {isDeleting ? 'Deleting...' : 'Delete Scan'}
          </button>
        )}
      </div>
    </div>
  );
}

// ===============================================================================
// TAB COMPONENTS
// ===============================================================================

function OverviewTab({ scan }: { scan: RoomScan }) {
  return (
    <div className="space-y-6">
      {/* Dimensions */}
      <div>
        <h3 className="font-playfair text-lg text-patina-charcoal mb-3">Dimensions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {scan.dimensions && (
            <>
              <DimensionCard
                label="Width"
                value={scan.dimensions.width}
                unit="m"
                imperial={scan.dimensions.width * 3.281}
                imperialUnit="ft"
              />
              <DimensionCard
                label="Length"
                value={scan.dimensions.length}
                unit="m"
                imperial={scan.dimensions.length * 3.281}
                imperialUnit="ft"
              />
              <DimensionCard
                label="Height"
                value={scan.dimensions.height}
                unit="m"
                imperial={scan.dimensions.height * 3.281}
                imperialUnit="ft"
              />
            </>
          )}
          {scan.floor_area && (
            <DimensionCard
              label="Floor Area"
              value={scan.floor_area}
              unit="m2"
              imperial={scan.floor_area * 10.764}
              imperialUnit="sq ft"
            />
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div>
        <h3 className="font-playfair text-lg text-patina-charcoal mb-3">Room Summary</h3>
        <div className="bg-patina-off-white rounded-xl p-4 space-y-3">
          <div className="flex justify-between">
            <span className="text-patina-mocha-brown/60 font-inter text-sm">Status</span>
            <span className={cn(
              'text-sm font-inter capitalize',
              scan.status === 'ready' && 'text-green-600',
              scan.status === 'processing' && 'text-yellow-600',
              scan.status === 'failed' && 'text-red-600'
            )}>
              {scan.status}
            </span>
          </div>
          {scan.features?.windows && (
            <div className="flex justify-between">
              <span className="text-patina-mocha-brown/60 font-inter text-sm">Windows</span>
              <span className="text-patina-charcoal font-inter text-sm">
                {scan.features.windows.length}
              </span>
            </div>
          )}
          {scan.features?.doors && (
            <div className="flex justify-between">
              <span className="text-patina-mocha-brown/60 font-inter text-sm">Doors</span>
              <span className="text-patina-charcoal font-inter text-sm">
                {scan.features.doors.length}
              </span>
            </div>
          )}
          {scan.suggested_styles && scan.suggested_styles.length > 0 && (
            <div className="flex justify-between">
              <span className="text-patina-mocha-brown/60 font-inter text-sm">Suggested Style</span>
              <span className="text-patina-charcoal font-inter text-sm capitalize">
                {scan.suggested_styles[0]}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FeaturesTab({ scan }: { scan: RoomScan }) {
  if (!scan.features) {
    return (
      <div className="text-center py-8">
        <p className="text-patina-mocha-brown/60 font-inter">No features detected</p>
      </div>
    );
  }

  const allFeatures = [
    ...(scan.features.windows?.map(f => ({ ...f, category: 'Window' })) || []),
    ...(scan.features.doors?.map(f => ({ ...f, category: 'Door' })) || []),
    ...(scan.features.other?.map(f => ({ ...f, category: 'Other' })) || []),
  ];

  if (allFeatures.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-patina-mocha-brown/60 font-inter">No features detected</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="font-playfair text-lg text-patina-charcoal">Detected Features</h3>
      <div className="grid gap-3">
        {allFeatures.map((feature, idx) => (
          <div
            key={idx}
            className="bg-patina-off-white rounded-lg p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-patina-clay-beige/20 flex items-center justify-center">
                <FeatureIcon type={feature.type} />
              </div>
              <div>
                <p className="font-inter text-patina-charcoal capitalize">
                  {feature.type.replace(/_/g, ' ')}
                </p>
                <p className="text-sm text-patina-mocha-brown/60 font-inter">
                  {feature.category}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-patina-mocha-brown font-inter">
                {Math.round((feature.confidence || 0) * 100)}% confidence
              </p>
              {feature.value && (
                <p className="text-xs text-patina-mocha-brown/60 font-inter">
                  Value: {feature.value.toFixed(2)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StyleTab({ scan }: { scan: RoomScan }) {
  if (!scan.style_signals) {
    return (
      <div className="text-center py-8">
        <p className="text-patina-mocha-brown/60 font-inter">No style analysis available</p>
      </div>
    );
  }

  const signals = scan.style_signals;

  return (
    <div className="space-y-6">
      {/* Style Signals */}
      <div>
        <h3 className="font-playfair text-lg text-patina-charcoal mb-4">Style Signals</h3>
        <div className="space-y-4">
          <SignalBar label="Natural Light" value={signals.naturalLight || 0} />
          <SignalBar label="Openness" value={signals.openness || 0} />
          <SignalBar label="Warmth" value={signals.warmth || 0} />
          <SignalBar label="Texture" value={signals.texture || 0} />
        </div>
      </div>

      {/* Suggested Styles */}
      {scan.suggested_styles && scan.suggested_styles.length > 0 && (
        <div>
          <h3 className="font-playfair text-lg text-patina-charcoal mb-3">Suggested Styles</h3>
          <div className="flex flex-wrap gap-2">
            {scan.suggested_styles.map((style) => (
              <span
                key={style}
                className="px-4 py-2 bg-patina-clay-beige/10 text-patina-mocha-brown rounded-full font-inter capitalize text-sm"
              >
                {style}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Preferences */}
      {(signals.timeOfDay || signals.lightPreference || signals.seatingPreference || signals.roomFeeling) && (
        <div>
          <h3 className="font-playfair text-lg text-patina-charcoal mb-3">User Preferences</h3>
          <div className="bg-patina-off-white rounded-xl p-4 space-y-3">
            {signals.timeOfDay && (
              <div className="flex justify-between">
                <span className="text-patina-mocha-brown/60 font-inter text-sm">Preferred Time</span>
                <span className="text-patina-charcoal font-inter text-sm capitalize">
                  {signals.timeOfDay}
                </span>
              </div>
            )}
            {signals.lightPreference && (
              <div className="flex justify-between">
                <span className="text-patina-mocha-brown/60 font-inter text-sm">Light Style</span>
                <span className="text-patina-charcoal font-inter text-sm capitalize">
                  {signals.lightPreference}
                </span>
              </div>
            )}
            {signals.seatingPreference && (
              <div className="flex justify-between">
                <span className="text-patina-mocha-brown/60 font-inter text-sm">Seating Preference</span>
                <span className="text-patina-charcoal font-inter text-sm capitalize">
                  {signals.seatingPreference.replace(/_/g, ' ')}
                </span>
              </div>
            )}
            {signals.roomFeeling && (
              <div className="flex justify-between">
                <span className="text-patina-mocha-brown/60 font-inter text-sm">Room Feeling</span>
                <span className="text-patina-charcoal font-inter text-sm">
                  {signals.roomFeeling}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ===============================================================================
// HELPER COMPONENTS
// ===============================================================================

function DimensionCard({
  label,
  value,
  unit,
  imperial,
  imperialUnit,
}: {
  label: string;
  value: number;
  unit: string;
  imperial?: number;
  imperialUnit?: string;
}) {
  return (
    <div className="bg-patina-off-white rounded-lg p-3">
      <p className="text-xs text-patina-mocha-brown/60 font-inter mb-1">{label}</p>
      <p className="text-lg font-playfair text-patina-charcoal">
        {value.toFixed(1)} <span className="text-sm text-patina-mocha-brown/60">{unit}</span>
      </p>
      {imperial !== undefined && imperialUnit && (
        <p className="text-xs text-patina-mocha-brown/40 font-inter">
          ({Math.round(imperial)} {imperialUnit})
        </p>
      )}
    </div>
  );
}

function SignalBar({ label, value }: { label: string; value: number }) {
  const percentage = Math.round(value * 100);

  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-sm text-patina-mocha-brown font-inter">{label}</span>
        <span className="text-sm text-patina-mocha-brown/60 font-inter">{percentage}%</span>
      </div>
      <div className="h-2 bg-patina-off-white rounded-full overflow-hidden">
        <div
          className="h-full bg-patina-clay-beige rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function FeatureIcon({ type }: { type: string }) {
  // Map feature types to icons
  const iconClass = 'w-5 h-5 text-patina-clay-beige';

  if (type.includes('window')) {
    return (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.5" />
        <line x1="12" y1="3" x2="12" y2="21" strokeWidth="1.5" />
        <line x1="3" y1="12" x2="21" y2="12" strokeWidth="1.5" />
      </svg>
    );
  }

  if (type.includes('door')) {
    return (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="4" y="2" width="16" height="20" rx="1" strokeWidth="1.5" />
        <circle cx="16" cy="12" r="1" fill="currentColor" />
      </svg>
    );
  }

  if (type.includes('fireplace')) {
    return (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
      </svg>
    );
  }

  // Default icon
  return (
    <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  );
}
